import assert from 'assert';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { describe, it, beforeEach, afterEach } from 'node:test';
import db from '../src/db/models/index.js';
import { GoogleDriveStorageService } from '../src/services/storage/googleDrive.storage.service.js';

describe('GoogleDriveStorageService Token Refresh & Concurrency Audit Tests', () => {
  let service;
  let sandbox;
  let updateStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new GoogleDriveStorageService();
    updateStub = sandbox.stub(db.GoogleDriveConnection, 'update').resolves([1]);
  });

  afterEach(() => {
    sandbox.restore();
    service.resetCache();
  });

  it('1. Access-token expiry: automatically refreshes token when expired or missing', async () => {
    const mockConnection = {
      isSystem: true,
      refreshToken: 'valid-stored-refresh-token-1',
      status: 'CONNECTED',
      save: sandbox.stub().resolves()
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub().callsFake((creds) => {
      mockOAuthClient.credentials = { ...mockOAuthClient.credentials, ...creds };
    });
    mockOAuthClient.getAccessToken = sandbox.stub().callsFake(async () => {
      mockOAuthClient.credentials.access_token = 'fresh-access-token-1';
      mockOAuthClient.credentials.expiry_date = Date.now() + 3600 * 1000;
      return { token: 'fresh-access-token-1', res: { data: { expires_in: 3600 } } };
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    const client = await service.getAuthenticatedOAuthClient();

    assert.strictEqual(mockOAuthClient.getAccessToken.callCount, 1, 'getAccessToken must be called once');
    assert.strictEqual(service.cachedRefreshToken, 'valid-stored-refresh-token-1');
    assert.strictEqual(service.cachedOAuth2Client, mockOAuthClient);
    assert.ok(service.tokenExpiryDate > Date.now(), 'Token expiry date must be in the future');
    assert.strictEqual(client.credentials.access_token, 'fresh-access-token-1');
  });

  it('2. Successful refresh: reuses cached credentials within expiry window without extra network calls', async () => {
    const mockConnection = {
      isSystem: true,
      refreshToken: 'valid-stored-refresh-token-2',
      status: 'CONNECTED'
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub().callsFake((creds) => {
      mockOAuthClient.credentials = { ...mockOAuthClient.credentials, ...creds };
    });
    mockOAuthClient.getAccessToken = sandbox.stub().callsFake(async () => {
      mockOAuthClient.credentials.access_token = 'fresh-access-token-2';
      mockOAuthClient.credentials.expiry_date = Date.now() + 3600 * 1000;
      return { token: 'fresh-access-token-2' };
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    // First call: fetches token
    const client1 = await service.getAuthenticatedOAuthClient();
    assert.strictEqual(mockOAuthClient.getAccessToken.callCount, 1);

    // Second call: should reuse cached client without calling getAccessToken again
    const client2 = await service.getAuthenticatedOAuthClient();
    assert.strictEqual(mockOAuthClient.getAccessToken.callCount, 1, 'getAccessToken must NOT be called again');
    assert.strictEqual(client1, client2, 'Returned client must be the same cached instance');
  });

  it('3. Persisted credentials: works after simulated backend restart by loading refresh token from DB', async () => {
    // Simulate server startup / post-restart: cache is empty
    service.resetCache();
    assert.strictEqual(service.cachedOAuth2Client, null);
    assert.strictEqual(service.tokenExpiryDate, null);

    const mockConnection = {
      isSystem: true,
      refreshToken: 'persisted-in-db-token',
      status: 'CONNECTED'
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub().callsFake((creds) => {
      mockOAuthClient.credentials = { ...mockOAuthClient.credentials, ...creds };
    });
    mockOAuthClient.getAccessToken = sandbox.stub().callsFake(async () => {
      mockOAuthClient.credentials.access_token = 'token-after-restart';
      mockOAuthClient.credentials.expiry_date = Date.now() + 3600 * 1000;
      return { token: 'token-after-restart' };
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    const client = await service.getAuthenticatedOAuthClient();

    assert.ok(mockOAuthClient.setCredentials.calledWith({ refresh_token: 'persisted-in-db-token' }));
    assert.strictEqual(mockOAuthClient.getAccessToken.callCount, 1);
    assert.strictEqual(client.credentials.access_token, 'token-after-restart');
  });

  it('4. Missing refresh token: throws error when connection or refresh token is not found', async () => {
    // Case A: No connection in DB
    const findOneStub = sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(null);

    await assert.rejects(
      async () => service.getAuthenticatedOAuthClient(),
      (err) => {
        assert.strictEqual(err.code, 'GOOGLE_DRIVE_NOT_CONNECTED');
        assert.ok(err.message.includes('refresh token missing'));
        return true;
      }
    );

    // Case B: Connection exists but refreshToken is empty/null
    findOneStub.resolves({ isSystem: true, refreshToken: null, status: 'CONNECTED' });

    await assert.rejects(
      async () => service.getAuthenticatedOAuthClient(),
      (err) => {
        assert.strictEqual(err.code, 'GOOGLE_DRIVE_NOT_CONNECTED');
        return true;
      }
    );
  });

  it('5. Revoked tokens (invalid_grant): marks DB connection as EXPIRED and blocks repeated retries', async () => {
    const mockConnection = {
      isSystem: true,
      refreshToken: 'revoked-token',
      status: 'CONNECTED'
    };
    const findOneStub = sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub();
    const invalidGrantError = new Error('invalid_grant: Token has been expired or revoked');
    invalidGrantError.response = { data: { error: 'invalid_grant' } };
    mockOAuthClient.getAccessToken = sandbox.stub().rejects(invalidGrantError);

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    // First attempt: should catch invalid_grant, update DB status to EXPIRED, and throw GOOGLE_DRIVE_TOKEN_EXPIRED
    await assert.rejects(
      async () => service.getAuthenticatedOAuthClient(),
      (err) => {
        assert.strictEqual(err.code, 'GOOGLE_DRIVE_TOKEN_EXPIRED');
        assert.strictEqual(err.status, 401);
        return true;
      }
    );

    assert.ok(updateStub.calledWith({ status: 'EXPIRED' }, { where: { isSystem: true } }), 'Must update DB status to EXPIRED');
    assert.strictEqual(service.cachedOAuth2Client, null, 'Cache must be cleared');

    // Subsequent attempt: DB now reflects status EXPIRED
    findOneStub.resolves({
      isSystem: true,
      refreshToken: 'revoked-token',
      status: 'EXPIRED'
    });

    // Reset stub count to verify no Google call is made
    mockOAuthClient.getAccessToken.resetHistory();

    await assert.rejects(
      async () => service.getAuthenticatedOAuthClient(),
      (err) => {
        assert.strictEqual(err.code, 'GOOGLE_DRIVE_TOKEN_EXPIRED');
        return true;
      }
    );

    assert.strictEqual(mockOAuthClient.getAccessToken.callCount, 0, 'Must NOT retry Google endpoint when status is EXPIRED');
  });

  it('6. Concurrent requests safety: multiple simultaneous requests do not trigger token-refresh races', async () => {
    const mockConnection = {
      isSystem: true,
      refreshToken: 'concurrent-refresh-token',
      status: 'CONNECTED'
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub().callsFake((creds) => {
      mockOAuthClient.credentials = { ...mockOAuthClient.credentials, ...creds };
    });

    let refreshCallCount = 0;
    mockOAuthClient.getAccessToken = sandbox.stub().callsFake(async () => {
      refreshCallCount++;
      // Simulate network roundtrip latency
      await new Promise(resolve => setTimeout(resolve, 30));
      mockOAuthClient.credentials.access_token = 'concurrent-access-token';
      mockOAuthClient.credentials.expiry_date = Date.now() + 3600 * 1000;
      return { token: 'concurrent-access-token' };
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    // Launch 10 simultaneous concurrent requests (simulating multiple range stream chunks)
    const results = await Promise.all([
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient(),
      service.getAuthenticatedOAuthClient()
    ]);

    assert.strictEqual(refreshCallCount, 1, 'Only exactly 1 refresh call must occur across all concurrent callers');
    assert.strictEqual(results.length, 10);
    for (const client of results) {
      assert.strictEqual(client.credentials.access_token, 'concurrent-access-token');
      assert.strictEqual(client, mockOAuthClient);
    }
  });

  it('7. Preserve existing refresh token: does not overwrite valid refresh token if Google omits it on reconnect', async () => {
    const existingConnection = {
      googleAccountId: 'old-acc-id',
      refreshToken: 'existing-precious-refresh-token',
      status: 'EXPIRED',
      save: sandbox.stub().resolves()
    };

    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(existingConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.setCredentials = sandbox.stub();
    // Google only returns access_token, refresh_token is undefined
    mockOAuthClient.getToken = sandbox.stub().resolves({
      tokens: {
        access_token: 'new-access-token-only',
        scope: 'https://www.googleapis.com/auth/drive.readonly'
      }
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    // Mock google.oauth2 userinfo
    const { google } = require('googleapis');
    sandbox.stub(google, 'oauth2').returns({
      userinfo: {
        get: sandbox.stub().resolves({ data: { id: 'new-google-account-id' } })
      }
    });

    await service.handleCallback('reconnect-code', 'system');

    assert.strictEqual(
      existingConnection.refreshToken,
      'existing-precious-refresh-token',
      'Existing refresh token must NOT be overwritten when Google returns no refresh token'
    );
    assert.strictEqual(existingConnection.status, 'CONNECTED', 'Status must be updated to CONNECTED');
    assert.strictEqual(existingConnection.save.callCount, 1);
  });

  it('8. Updates refresh token if Google provides a new one on reconnect', async () => {
    const existingConnection = {
      googleAccountId: 'old-acc-id',
      refreshToken: 'old-refresh-token',
      status: 'EXPIRED',
      save: sandbox.stub().resolves()
    };

    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(existingConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.setCredentials = sandbox.stub();
    mockOAuthClient.getToken = sandbox.stub().resolves({
      tokens: {
        access_token: 'new-access-token',
        refresh_token: 'newly-rotated-refresh-token',
        scope: 'https://www.googleapis.com/auth/drive.readonly'
      }
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    const { google } = require('googleapis');
    sandbox.stub(google, 'oauth2').returns({
      userinfo: {
        get: sandbox.stub().resolves({ data: { id: 'acc-id-123' } })
      }
    });

    await service.handleCallback('new-auth-code', 'system');

    assert.strictEqual(
      existingConnection.refreshToken,
      'newly-rotated-refresh-token',
      'Refresh token must be updated when a new valid one is received'
    );
    assert.strictEqual(existingConnection.status, 'CONNECTED');
  });

  it('9. Temporary network errors do NOT mark connection permanently EXPIRED', async () => {
    const mockConnection = {
      isSystem: true,
      refreshToken: 'network-test-token',
      status: 'CONNECTED'
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.credentials = {};
    mockOAuthClient.setCredentials = sandbox.stub();
    const networkError = new Error('connect ETIMEDOUT 142.250.190.42:443');
    networkError.code = 'ETIMEDOUT';
    mockOAuthClient.getAccessToken = sandbox.stub().rejects(networkError);

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    await assert.rejects(
      async () => service.getAuthenticatedOAuthClient(),
      (err) => {
        assert.strictEqual(err.code, 'ETIMEDOUT');
        return true;
      }
    );

    // Verify that update({ status: 'EXPIRED' }) was NEVER called
    assert.strictEqual(updateStub.calledWith({ status: 'EXPIRED' }), false, 'Temporary network errors must NOT mark connection EXPIRED');
  });

  it('10. Reconnection saves access token, refresh token, expiry time, and status to DB', async () => {
    const existingConnection = {
      googleAccountId: 'old-id',
      refreshToken: 'old-refresh',
      accessToken: null,
      tokenExpiry: null,
      status: 'EXPIRED',
      save: sandbox.stub().resolves()
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(existingConnection);

    const mockOAuthClient = new EventEmitter();
    mockOAuthClient.setCredentials = sandbox.stub();
    const expiryTimestamp = Date.now() + 3600 * 1000;
    mockOAuthClient.getToken = sandbox.stub().resolves({
      tokens: {
        access_token: 'new-persisted-access-token',
        refresh_token: 'new-persisted-refresh-token',
        expiry_date: expiryTimestamp,
        scope: 'https://www.googleapis.com/auth/drive.readonly'
      }
    });

    sandbox.stub(service, 'getOAuthClient').returns(mockOAuthClient);

    const { google } = require('googleapis');
    sandbox.stub(google, 'oauth2').returns({
      userinfo: {
        get: sandbox.stub().resolves({ data: { id: 'admin-account-777' } })
      }
    });

    await service.handleCallback('code-abc', 'system');

    assert.strictEqual(existingConnection.refreshToken, 'new-persisted-refresh-token');
    assert.strictEqual(existingConnection.accessToken, 'new-persisted-access-token');
    assert.ok(existingConnection.tokenExpiry instanceof Date);
    assert.strictEqual(existingConnection.status, 'CONNECTED');
    assert.strictEqual(existingConnection.googleAccountId, 'admin-account-777');
    assert.strictEqual(existingConnection.save.callCount, 1);
  });

  it('11. streamFile handles HTTP Range requests and pipes media stream', async () => {
    const mockDrive = {
      files: {
        get: sandbox.stub()
      }
    };
    // First call: metadata
    mockDrive.files.get.onFirstCall().resolves({
      data: { size: '10000000', mimeType: 'audio/mpeg' }
    });
    // Second call: media stream
    const mockStream = new EventEmitter();
    mockStream.pipe = sandbox.stub().callsFake((dest) => {
      dest.written = true;
    });
    mockDrive.files.get.onSecondCall().resolves({
      data: mockStream
    });

    sandbox.stub(service, 'getSystemDriveClient').resolves(mockDrive);

    let writtenHeaders = {};
    let writtenStatus = null;
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        writtenStatus = status;
        writtenHeaders = headers;
      },
      end: sandbox.stub()
    };

    await service.streamFile('mock-file-external-id', 'bytes=0-1048575', res);

    assert.strictEqual(writtenStatus, 206, 'Must respond with 206 Partial Content for Range requests');
    assert.strictEqual(writtenHeaders['Content-Range'], 'bytes 0-1048575/10000000');
    assert.strictEqual(writtenHeaders['Content-Length'], 1048576);
    assert.strictEqual(writtenHeaders['Content-Type'], 'audio/mpeg');
    assert.strictEqual(mockStream.pipe.callCount, 1, 'Stream must be piped to response');
  });
});
