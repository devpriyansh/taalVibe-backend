import assert from 'assert';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'node:test';
import db from '../src/db/models/index.js';
import MusicController from '../src/rest-resources/controllers/music.controller.js';
import GoogleDriveStorageService from '../src/services/storage/googleDrive.storage.service.js';

describe('MusicController Google Drive Auth & Error Handling Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('1. streamSong returns 401 with GOOGLE_DRIVE_TOKEN_EXPIRED when token is expired/revoked', async () => {
    const mockSong = {
      id: 233,
      storageProvider: 'GOOGLE_DRIVE',
      externalId: 'drive-file-id-123',
      isActive: true
    };
    sandbox.stub(db.Song, 'findOne').resolves(mockSong);

    const expiredError = new Error('Google Drive authorization token has expired or was revoked. Please reconnect Google Drive in Settings.');
    expiredError.code = 'GOOGLE_DRIVE_TOKEN_EXPIRED';
    sandbox.stub(GoogleDriveStorageService, 'streamFile').rejects(expiredError);
    const updateStub = sandbox.stub(db.GoogleDriveConnection, 'update').resolves([1]);

    const req = {
      params: { id: 233 },
      headers: {}
    };

    let responseStatus;
    let responseBody;
    const res = {
      headersSent: false,
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await MusicController.streamSong(req, res);

    assert.strictEqual(responseStatus, 401);
    assert.strictEqual(responseBody.code, 'GOOGLE_DRIVE_TOKEN_EXPIRED');
    assert.ok(responseBody.message.includes('Please reconnect Google Drive in Settings'));
    assert.ok(updateStub.calledWith({ status: 'EXPIRED' }, { where: { isSystem: true } }));
  });

  it('2. syncLibrary returns 401 with admin reconnect message when token is expired', async () => {
    const expiredError = new Error('invalid_grant');
    expiredError.code = 'GOOGLE_DRIVE_TOKEN_EXPIRED';
    sandbox.stub(GoogleDriveStorageService, 'syncLibrary').rejects(expiredError);
    const updateStub = sandbox.stub(db.GoogleDriveConnection, 'update').resolves([1]);

    const req = {};
    let responseStatus;
    let responseBody;
    const res = {
      headersSent: false,
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await MusicController.syncLibrary(req, res);

    assert.strictEqual(responseStatus, 401);
    assert.strictEqual(responseBody.code, 'GOOGLE_DRIVE_TOKEN_EXPIRED');
    assert.ok(responseBody.message.includes('Please reconnect Google Drive in Settings'));
    assert.ok(updateStub.calledWith({ status: 'EXPIRED' }, { where: { isSystem: true } }));
  });

  it('3. getDriveStatus never exposes refresh tokens or secrets to client', async () => {
    const mockConnection = {
      id: 1,
      refreshToken: 'SECRET_SHOULD_NEVER_BE_EXPOSED',
      status: 'EXPIRED',
      folderId: 'folder-abc-123',
      lastSyncedAt: new Date('2026-10-25T10:00:00Z'),
      isSystem: true
    };
    sandbox.stub(db.GoogleDriveConnection, 'findOne').resolves(mockConnection);

    const req = {};
    let responseStatus;
    let responseBody;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await MusicController.getDriveStatus(req, res);

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseBody.result.connected, false, 'EXPIRED status must mean connected is false');
    assert.strictEqual(responseBody.result.status, 'EXPIRED');
    assert.strictEqual(responseBody.result.folderId, 'folder-abc-123');
    assert.strictEqual(responseBody.result.refreshToken, undefined, 'Must NEVER return refreshToken');
    assert.strictEqual(JSON.stringify(responseBody).includes('SECRET_SHOULD_NEVER_BE_EXPOSED'), false);
  });
});
