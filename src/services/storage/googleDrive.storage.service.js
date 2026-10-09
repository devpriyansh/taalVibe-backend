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
    
    if (!connection) {
      connection = await db.GoogleDriveConnection.create({
        userId,
        isSystem,
        googleAccountId: userInfo.data.id,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        status: 'CONNECTED'
      });
    } else {
      connection.googleAccountId = userInfo.data.id;
      if (tokens.refresh_token) {
        connection.refreshToken = tokens.refresh_token;
      }
      connection.status = 'CONNECTED';
      await connection.save();
    }

    return connection;
  }

  async getSystemDriveClient() {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    if (!connection || !connection.refreshToken) {
      throw new Error('System Google Drive not connected or refresh token missing');
    }

    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: connection.refreshToken });
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  async setMusicFolder(folderId) {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    if (!connection) throw new Error('Not connected');
    connection.folderId = folderId;
    await connection.save();
    return connection;
  }

  async syncLibrary() {
    const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
    if (!connection || !connection.folderId) {
      throw new Error('System Google Drive or Music Folder not configured');
    }

    const drive = await this.getSystemDriveClient();
    const rootFolderId = connection.folderId;
    
    const foldersToScan = [rootFolderId];
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
          pageToken = null; // Skip remaining pages for this folder on error
        }
      } while (pageToken);
    }

    const stats = { added: 0, updated: 0, skipped: 0, failed: 0, inactive: 0, totalDiscovered: discoveredFiles.size };
    
    // 2. Fetch all existing songs from DB to compare
    const existingSongs = await db.Song.findAll({ where: { storageProvider: 'GOOGLE_DRIVE' } });
    const existingSongsMap = new Map();
    for (const song of existingSongs) {
      existingSongsMap.set(song.externalId, song);
    }

    // 3. Process discovered files
    for (const [fileId, { file, parentFolderId }] of discoveredFiles.entries()) {
      const existing = existingSongsMap.get(fileId);
      let needsProcessing = true;
      
      if (existing) {
        existingSongsMap.delete(fileId); // Mark as found
        
        // MVP: if it exists, skip metadata extraction unless it's inactive (then we reactivate it)
        // If you wanted to detect metadata changes, you'd compare modifiedTime or file.size
        needsProcessing = false; 
        if (!existing.isActive) {
           existing.isActive = true;
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
             metadata = await mm.parseStream(streamRes.data, { mimeType: file.mimeType }, { duration: true, skipCovers: false });
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
          
          let coverArtKey = null;
          if (metadata?.common?.picture && metadata.common.picture.length > 0) {
            const pic = metadata.common.picture[0];
            const ext = pic.format === 'image/png' ? 'png' : 'jpg';
            const fileName = `${fileId}.${ext}`;
            const artPath = path.join(process.cwd(), 'public', 'artwork', fileName);
            fs.mkdirSync(path.dirname(artPath), { recursive: true });
            fs.writeFileSync(artPath, pic.data);
            coverArtKey = fileName;
          }

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
          console.error(`Failed to process file ${file.name}:`, error.message);
          stats.failed++;
        }
      }
    }

    // 4. Mark remaining songs as inactive (they were not discovered in Drive)
    for (const [fileId, song] of existingSongsMap.entries()) {
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
      res.status(500).end();
    });
    
    streamRes.data.pipe(res);
  }
}

export default new GoogleDriveStorageService();
