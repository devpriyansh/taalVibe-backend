import { google } from 'googleapis';
import config from '../../configs/app.config';
import db from '../../db/models';
import fs from 'fs';
import path from 'path';
import mm from 'music-metadata';

class GoogleDriveStorageService {
  constructor() {
    this.clientId = config.get('google.clientId');
    this.clientSecret = config.get('google.clientSecret');
    this.redirectUri = config.get('google.redirectUri');

    // In-memory token & client cache for automatic renewal and concurrent request safety
    this.cachedOAuth2Client = null;
    this.cachedRefreshToken = null;
    this.tokenExpiryDate = null;
    this.refreshPromise = null;
  }

  resetCache() {
    this.cachedOAuth2Client = null;
    this.cachedRefreshToken = null;
    this.tokenExpiryDate = null;
    this.refreshPromise = null;
  }

  getOAuthClient() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  getAuthUrl(userId) {
    const oauth2Client = this.getOAuthClient();
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: String(userId) // Pass userId securely
    });
  }

  isAuthError(error) {
    return this.isRevocationError(error);
  }

  isRevocationError(error) {
    if (!error) return false;
    const msg = String(error.message || '');
    const code = error.code;
    const errData = String(error.response?.data?.error || '');
    const desc = String(error.response?.data?.error_description || '');
    const causeMsg = String(error.cause?.message || '');

    // Our own code for already-expired connections
    if (code === 'GOOGLE_DRIVE_TOKEN_EXPIRED') return true;

    // Google OAuth error for revoked/invalid refresh token
    return (
      errData === 'invalid_grant' ||
      desc.includes('invalid_grant') ||
      desc.includes('Token has been expired or revoked') ||
      msg.includes('invalid_grant') ||
      causeMsg.includes('invalid_grant')
    );
  }

  async markConnectionExpired(reason = 'Google Drive authorization token has expired or was revoked. Please reconnect Google Drive in Settings.') {
    this.resetCache();
    try {
      await db.GoogleDriveConnection.update(
        { status: 'EXPIRED' },
        { where: { isSystem: true } }
      );
    } catch (err) {
      console.error('Failed to update GoogleDriveConnection status to EXPIRED:', err.message);
    }
    const authError = new Error(reason);
    authError.code = 'GOOGLE_DRIVE_TOKEN_EXPIRED';
    authError.status = 401;
    return authError;
  }

  async handleCallback(code, stateParam) {
    const oauth2Client = this.getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info to store account ID
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const isSystem = stateParam === 'system';
    const userId = isSystem ? null : stateParam;

    // Check if connection exists
    let connection = await db.GoogleDriveConnection.findOne({ 
      where: isSystem ? { isSystem: true } : { userId, isSystem: false } 
    });

    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);
    
    if (!connection) {
      if (!tokens.refresh_token) {
        throw new Error('Google did not return a refresh token. Please re-authorize with offline access consent.');
      }
      connection = await db.GoogleDriveConnection.create({
        userId,
        isSystem,
        googleAccountId: userInfo.data.id,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || null,
        tokenExpiry: tokenExpiry,
        scope: tokens.scope,
        status: 'CONNECTED'
      });
    } else {
      connection.googleAccountId = userInfo.data.id;
      // Preserve existing refresh token if Google does not return a new one.
      // Do not overwrite a valid refresh token with null or an empty value.
      if (tokens.refresh_token && typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim() !== '') {
        connection.refreshToken = tokens.refresh_token;
      }
      if (tokens.access_token) {
        connection.accessToken = tokens.access_token;
      }
      connection.tokenExpiry = tokenExpiry;
      if (tokens.scope) {
        connection.scope = tokens.scope;
      }
      connection.status = 'CONNECTED';
      await connection.save();
    }

    // Invalidate stale in-memory credentials and activate refreshed client
    this.resetCache();
    this.cachedOAuth2Client = oauth2Client;
    this.cachedRefreshToken = connection.refreshToken;
    this.tokenExpiryDate = tokens.expiry_date || (Date.now() + 3600 * 1000);

    return connection;
  }

  async getAuthenticatedOAuthClient() {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    if (!connection || !connection.refreshToken) {
      const err = new Error('System Google Drive not connected or refresh token missing');
      err.code = 'GOOGLE_DRIVE_NOT_CONNECTED';
      err.status = 404;
      throw err;
    }

    // If marked EXPIRED, do not repeatedly retry Google OAuth endpoint
    if (connection.status === 'EXPIRED') {
      const err = new Error('Google Drive authorization token has expired or was revoked. Please reconnect Google Drive in Settings.');
      err.code = 'GOOGLE_DRIVE_TOKEN_EXPIRED';
      err.status = 401;
      throw err;
    }

    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer before expiry

    // 1. Reuse in-memory cached client if access token is still fresh
    if (
      this.cachedOAuth2Client &&
      this.cachedRefreshToken === connection.refreshToken &&
      this.tokenExpiryDate &&
      this.tokenExpiryDate > (now + bufferMs)
    ) {
      return this.cachedOAuth2Client;
    }

    // 2. Check if DB has an unexpired access token (e.g. after a process restart)
    if (
      !this.cachedOAuth2Client &&
      connection.accessToken &&
      connection.tokenExpiry &&
      new Date(connection.tokenExpiry).getTime() > (now + bufferMs)
    ) {
      const oauth2Client = this.getOAuthClient();
      oauth2Client.setCredentials({
        access_token: connection.accessToken,
        refresh_token: connection.refreshToken,
        expiry_date: new Date(connection.tokenExpiry).getTime()
      });
      this.cachedOAuth2Client = oauth2Client;
      this.cachedRefreshToken = connection.refreshToken;
      this.tokenExpiryDate = new Date(connection.tokenExpiry).getTime();
      return this.cachedOAuth2Client;
    }

    // 3. Concurrency lock / single-flight: await if refresh already in progress
    if (this.refreshPromise) {
      await this.refreshPromise;
      if (
        this.cachedOAuth2Client &&
        this.cachedRefreshToken === connection.refreshToken &&
        this.tokenExpiryDate &&
        this.tokenExpiryDate > (now + bufferMs)
      ) {
        return this.cachedOAuth2Client;
      }
    }

    // 4. Start single-flight token refresh under mutex
    this.refreshPromise = (async () => {
      try {
        const oauth2Client = this.getOAuthClient();
        oauth2Client.setCredentials({ refresh_token: connection.refreshToken });

        oauth2Client.on('tokens', async (tokens) => {
          if (tokens.refresh_token && typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim() !== '') {
            try {
              await db.GoogleDriveConnection.update(
                { refreshToken: tokens.refresh_token },
                { where: { isSystem: true } }
              );
              this.cachedRefreshToken = tokens.refresh_token;
            } catch (err) {
              console.error('Failed to update rotated refresh token in DB:', err.message);
            }
          }
          if (tokens.expiry_date) {
            this.tokenExpiryDate = tokens.expiry_date;
          }
        });

        const tokenRes = await oauth2Client.getAccessToken();
        const accessToken = tokenRes?.token || (typeof tokenRes === 'string' ? tokenRes : null);

        if (!accessToken) {
          throw new Error('Failed to obtain access token from Google');
        }

        const expiryDate = oauth2Client.credentials?.expiry_date || (Date.now() + 3600 * 1000);
        this.cachedOAuth2Client = oauth2Client;
        this.cachedRefreshToken = connection.refreshToken;
        this.tokenExpiryDate = expiryDate;

        // Persist fresh access token and expiry to database for cross-instance / restart reuse
        await db.GoogleDriveConnection.update(
          {
            accessToken: accessToken,
            tokenExpiry: new Date(expiryDate)
          },
          { where: { isSystem: true } }
        ).catch(err => console.error('Failed to persist access token to DB:', err.message));

        return oauth2Client;
      } catch (error) {
        if (this.isRevocationError(error)) {
          console.error('Google Drive token refresh failed with revocation error:', error.message);
          throw await this.markConnectionExpired();
        }
        // Temporary network or 5xx error: log and rethrow without marking connection permanently expired
        console.error('Google Drive token refresh failed with temporary error (connection not marked expired):', error.message);
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return await this.refreshPromise;
  }

  async getSystemDriveClient() {
    const oauth2Client = await this.getAuthenticatedOAuthClient();
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  async setMusicFolder(folderId) {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    if (!connection) throw new Error('Not connected');
    connection.folderId = folderId;
    await connection.save();
    return connection;
  }

  async listSubfolders(parentFolderId = null) {
    try {
      const drive = await this.getSystemDriveClient();
      const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
      const targetFolderId = parentFolderId || connection?.folderId;
      if (!targetFolderId) return [];

      const query = `'${targetFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const res = await drive.files.list({
        q: query,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 100
      });
      return res.data.files || [];
    } catch (e) {
      if (this.isAuthError(e)) {
        throw await this.markConnectionExpired();
      }
      console.error('Error listing subfolders:', e.message);
      throw e;
    }
  }

  async syncLibrary(specificFolderId = null) {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    const rootFolderId = specificFolderId || connection?.folderId;
    if (!connection || !rootFolderId) {
      throw new Error('System Google Drive or Music Folder not configured');
    }

    const drive = await this.getSystemDriveClient();
    
    const foldersToScan = [rootFolderId];
    if (!specificFolderId && db.DrivePlaylist) {
      try {
        const drivePlaylists = await db.DrivePlaylist.findAll({ where: { isActive: true } });
        for (const pl of drivePlaylists) {
          if (pl.folderId && !foldersToScan.includes(pl.folderId)) {
            foldersToScan.push(pl.folderId);
          }
        }
      } catch (err) {
        console.warn('Could not load playlist folders during sync:', err.message);
      }
    }
    const discoveredFiles = new Map(); // fileId -> { file, parentFolderId }

    // 1. Traverse folders recursively
    while (foldersToScan.length > 0) {
      const currentFolderId = foldersToScan.shift();
      let pageToken = null;
      const query = `'${currentFolderId}' in parents and (mimeType contains 'audio/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
      
      do {
        try {
          const res = await drive.files.list({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
            pageToken: pageToken,
            pageSize: 100
          });

          for (const file of (res.data.files || [])) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
              foldersToScan.push(file.id);
            } else {
              discoveredFiles.set(file.id, { file, parentFolderId: currentFolderId });
            }
          }
          pageToken = res.data.nextPageToken;
        } catch (error) {
          console.error(`Error scanning folder ${currentFolderId}:`, error.message);
          if (this.isAuthError(error)) {
            throw await this.markConnectionExpired();
          }
          pageToken = null; // Skip remaining pages for this folder on error
        }
      } while (pageToken);
    }

    const stats = { added: 0, updated: 0, skipped: 0, failed: 0, inactive: 0, totalDiscovered: discoveredFiles.size };
    
    // 2. Fetch all existing songs from DB to compare
    const existingSongs = await db.Song.findAll({ where: { storageProvider: 'GOOGLE_DRIVE' } });
    const existingSongsMap = new Map();
    // Track songs eligible for deactivation if not found during this scan
    const songsEligibleForDeactivation = new Map();

    for (const song of existingSongs) {
      existingSongsMap.set(song.externalId, song);
      // If syncing a specific folder, only consider songs in that folder for deactivation.
      // If syncing entire library, consider all songs.
      if (!specificFolderId || song.folderId === specificFolderId) {
        songsEligibleForDeactivation.set(song.externalId, song);
      }
    }

    // 3. Process discovered files
    for (const [fileId, { file, parentFolderId }] of discoveredFiles.entries()) {
      const existing = existingSongsMap.get(fileId);
      songsEligibleForDeactivation.delete(fileId); // Mark as found in Drive
      let needsProcessing = true;
      
      if (existing) {
        needsProcessing = false; 
        let isUpdated = false;
        if (!existing.isActive) {
           existing.isActive = true;
           isUpdated = true;
        }
        if (existing.folderId !== parentFolderId) {
           existing.folderId = parentFolderId;
           isUpdated = true;
        }
        if (isUpdated) {
           await existing.save();
           stats.updated++;
        } else {
           stats.skipped++;
        }
      }

      if (needsProcessing) {
        try {
          // Extract metadata
          const streamRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
          let metadata;
          try {
             metadata = await mm.parseStream(streamRes.data, { mimeType: file.mimeType }, { duration: true, skipCovers: true });
          } catch (e) {
             console.warn(`music-metadata parsing error for ${file.name}:`, e.message);
          } finally {
             // Abort the download stream safely to prevent downloading the entire file
             if (streamRes.data && typeof streamRes.data.destroy === 'function') {
                streamRes.data.destroy();
             }
          }

          // Fallback parsing from filename
          const cleanName = file.name.replace(/\.[^/.]+$/, "");
          let artistFallback = 'Unknown Artist';
          let titleFallback = cleanName;
          if (cleanName.includes(' - ')) {
            const parts = cleanName.split(' - ');
            artistFallback = parts[0].trim();
            titleFallback = parts.slice(1).join(' - ').trim();
          }

          const title = metadata?.common?.title || titleFallback;
          const artist = metadata?.common?.artist || artistFallback;
          const album = metadata?.common?.album || 'Unknown Album';
          const albumArtist = metadata?.common?.albumartist || artist;
          
          let year = metadata?.common?.year ? String(metadata.common.year) : null;
          if (!year && metadata?.common?.date) {
            year = metadata.common.date.substring(0, 4);
          }
          let decade = 'Unknown';
          if (year && !isNaN(parseInt(year, 10))) {
            const y = parseInt(year, 10);
            decade = `${Math.floor(y / 10) * 10}s`;
          }
          const genre = (metadata?.common?.genre && metadata.common.genre.length > 0) ? metadata.common.genre[0] : 'Unknown';
          const duration = metadata?.format?.duration ? Math.floor(metadata.format.duration) : 0;
          
          const coverArtKey = null;

          await db.Song.create({
            title, 
            artist, 
            album, 
            albumArtist, 
            year, 
            decade, 
            genre, 
            duration,
            externalId: fileId, 
            storageProvider: 'GOOGLE_DRIVE', 
            folderId: parentFolderId,
            mimeType: file.mimeType, 
            fileSize: file.size ? parseInt(file.size, 10) : 0, 
            isActive: true,
            coverArtKey
          });
          stats.added++;
        } catch (error) {
          if (this.isAuthError(error)) {
            throw await this.markConnectionExpired();
          }
          console.error(`Failed to process file ${file.name}:`, error.message);
          stats.failed++;
        }
      }
    }

    // 4. Mark remaining songs as inactive (they were not discovered in Drive)
    for (const [fileId, song] of songsEligibleForDeactivation.entries()) {
      if (song.isActive) {
        song.isActive = false;
        await song.save();
        stats.inactive++;
      }
    }

    connection.lastSyncedAt = new Date();
    await connection.save();

    return stats;
  }

  async streamFile(externalId, rangeHeader, res) {
    try {
      const drive = await this.getSystemDriveClient();
      
      // 1. Get file metadata to determine full size
      const metadataRes = await drive.files.get({
        fileId: externalId,
        fields: 'size, mimeType'
      });
      
      const fileSize = parseInt(metadataRes.data.size, 10);
      const mimeType = metadataRes.data.mimeType;

      // 2. Handle Range Header
      let start = 0;
      let end = fileSize - 1;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Handle edge cases
        if (start >= fileSize) {
          res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
          return;
        }

        const chunksize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
        });
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
        });
      }

      // 3. Request the stream from Google Drive with specific Range
      const streamRes = await drive.files.get(
        { fileId: externalId, alt: 'media' },
        { 
          responseType: 'stream',
          headers: rangeHeader ? { Range: rangeHeader } : {}
        }
      );

      // 4. Pipe to response
      streamRes.data.on('end', () => res.end());
      streamRes.data.on('error', (err) => {
        console.error('Error streaming from Drive:', err);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy();
        }
      });
      
      streamRes.data.pipe(res);
    } catch (error) {
      // If error is 401 (e.g. access token expired during stream), invalidate cached access token and retry once
      const is401 = error.status === 401 || error.response?.status === 401 || error.code === 401;
      if (is401 && !this.isRevocationError(error)) {
        console.warn('Google Drive API returned 401 during stream. Invalidating cached access token and refreshing...');
        this.resetCache();
        try {
          const drive = await this.getSystemDriveClient();
          const metadataRes = await drive.files.get({
            fileId: externalId,
            fields: 'size, mimeType'
          });
          const fileSize = parseInt(metadataRes.data.size, 10);
          const mimeType = metadataRes.data.mimeType;
          let start = 0;
          let end = fileSize - 1;
          if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            if (start >= fileSize) {
              res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
              return;
            }
            const chunksize = (end - start) + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': mimeType,
            });
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': mimeType,
              'Accept-Ranges': 'bytes',
            });
          }
          const streamRes = await drive.files.get(
            { fileId: externalId, alt: 'media' },
            { 
              responseType: 'stream',
              headers: rangeHeader ? { Range: rangeHeader } : {}
            }
          );
          streamRes.data.on('end', () => res.end());
          streamRes.data.on('error', (err) => {
            console.error('Error streaming from Drive (retry):', err);
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
          });
          streamRes.data.pipe(res);
          return;
        } catch (retryError) {
          if (this.isRevocationError(retryError)) {
            throw await this.markConnectionExpired();
          }
          throw retryError;
        }
      }

      if (this.isRevocationError(error)) {
        throw await this.markConnectionExpired();
      }
      throw error;
    }
  }
}

const googleDriveStorageServiceInstance = new GoogleDriveStorageService();
export { GoogleDriveStorageService };
export default googleDriveStorageServiceInstance;
