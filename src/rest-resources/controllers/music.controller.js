import db from '../../db/models';
import GoogleDriveStorageService from '../../services/storage/googleDrive.storage.service';
const { Sequelize, Op } = require('sequelize');

class MusicController {
  
  async googleAuthInit(req, res) {
    try {
      const url = GoogleDriveStorageService.getAuthUrl('system');
      return res.status(200).json({ status: 200, message: 'OAuth URL generated', result: { url } });
    } catch (error) {
      console.error('googleAuthInit error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async googleAuthCallback(req, res) {
    try {
      const { code, state } = req.query;
      const userId = state;
      
      if (!code || !userId) return res.status(400).send('Missing auth code or user state');

      await GoogleDriveStorageService.handleCallback(code, userId);
      return res.redirect('http://localhost:3000/settings');
    } catch (error) {
      console.error('googleAuthCallback error:', error);
      return res.status(500).send('Internal Server Error: ' + error.message);
    }
  }

  async getDriveStatus(req, res) {
    try {
      const connection = await db.GoogleDriveConnection.findOne({ where: { isSystem: true } });
      return res.status(200).json({ 
        status: 200, 
        message: 'Drive status', 
        result: { 
          connected: !!connection,
          folderId: connection?.folderId,
          lastSyncedAt: connection?.lastSyncedAt 
        } 
      });
    } catch (error) {
      console.error('getDriveStatus error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async setDriveFolder(req, res) {
    try {
      const { folderId } = req.body;
      if (!folderId) return res.status(400).json({ status: 400, message: 'Missing folderId' });

      await GoogleDriveStorageService.setMusicFolder(folderId);
      return res.status(200).json({ status: 200, message: 'Folder updated', result: { folderId } });
    } catch (error) {
      console.error('setDriveFolder error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async syncLibrary(req, res) {
    try {
      const result = await GoogleDriveStorageService.syncLibrary();
      return res.status(200).json({ status: 200, message: 'Sync complete', result });
    } catch (error) {
      console.error('syncLibrary error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  // --- CATALOG APIS (STAGE 4) ---

  async getSongs(req, res) {
    try {
      const userId = req.userId;
      const { 
        page = 1, 
        limit = 50, 
        q, 
        artist, 
        album, 
        genre, 
        year, 
        decade,
        sort = 'recently_added'
      } = req.query;

      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const limitVal = parseInt(limit, 10);

      const where = { isActive: true };

      if (q) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${q}%` } },
          { artist: { [Op.iLike]: `%${q}%` } },
          { album: { [Op.iLike]: `%${q}%` } }
        ];
      }

      if (artist) where.artist = { [Op.iLike]: artist };
      if (album) where.album = { [Op.iLike]: album };
      if (genre) where.genre = { [Op.iLike]: genre };
      if (year) where.year = year;
      if (decade) where.decade = decade;

      let order = [['createdAt', 'DESC']];
      if (sort === 'title') order = [['title', 'ASC']];
      else if (sort === 'artist') order = [['artist', 'ASC'], ['title', 'ASC']];
      else if (sort === 'album') order = [['album', 'ASC'], ['title', 'ASC']];
      else if (sort === 'year') order = [['year', 'DESC'], ['title', 'ASC']];
      else if (sort === 'recently_added') order = [['createdAt', 'DESC']];

      const { count, rows: songsData } = await db.Song.findAndCountAll({
        where,
        order,
        limit: limitVal,
        offset,
        include: [{
          model: db.User,
          as: 'favoritedBy',
          where: { id: userId },
          required: req.query.favoritesOnly === 'true',
          attributes: ['id']
        }]
      });

      const songs = songsData.map(song => {
        const songJSON = song.toJSON();
        songJSON.favorite = song.favoritedBy && song.favoritedBy.length > 0;
        delete songJSON.favoritedBy;
        if (songJSON.coverArtKey) {
          songJSON.coverArtUrl = `/public/artwork/${songJSON.coverArtKey}`;
        }
        return songJSON;
      });

      return res.status(200).json({
        status: 200,
        message: 'Songs retrieved',
        result: { 
          songs,
          totalCount: count,
          page: parseInt(page, 10),
          limit: limitVal,
          hasMore: offset + songs.length < count
        }
      });
    } catch (error) {
      console.error('getSongs error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getArtists(req, res) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const limitVal = parseInt(limit, 10);
      
      const result = await db.Song.findAndCountAll({
        attributes: [
          'artist', 
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'songCount']
        ],
        where: { isActive: true },
        group: ['artist'],
        order: [['artist', 'ASC']],
        limit: limitVal,
        offset
      });

      const totalCount = result.count.length;
      return res.status(200).json({
        status: 200,
        message: 'Artists retrieved',
        result: {
          artists: result.rows,
          totalCount,
          page: parseInt(page, 10),
          limit: limitVal,
          hasMore: offset + result.rows.length < totalCount
        }
      });
    } catch (error) {
      console.error('getArtists error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getAlbums(req, res) {
    try {
      const { page = 1, limit = 50, artist } = req.query;
      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const limitVal = parseInt(limit, 10);

      const where = { isActive: true };
      if (artist) where.artist = { [Op.iLike]: artist };

      const result = await db.Song.findAndCountAll({
        attributes: [
          'album',
          'albumArtist',
          [Sequelize.fn('MAX', Sequelize.col('cover_art_key')), 'coverArtKey'],
          [Sequelize.fn('MAX', Sequelize.col('year')), 'year'],
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'songCount']
        ],
        where,
        group: ['album', 'albumArtist'],
        order: [['album', 'ASC']],
        limit: limitVal,
        offset
      });

      const totalCount = result.count.length;
      const albums = result.rows.map(row => {
         const json = row.toJSON();
         if (json.coverArtKey) json.coverArtUrl = `/public/artwork/${json.coverArtKey}`;
         return json;
      });

      return res.status(200).json({
        status: 200,
        message: 'Albums retrieved',
        result: {
          albums,
          totalCount,
          page: parseInt(page, 10),
          limit: limitVal,
          hasMore: offset + albums.length < totalCount
        }
      });
    } catch (error) {
      console.error('getAlbums error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getGenres(req, res) {
    try {
      const genres = await db.Song.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('genre')), 'genre']],
        where: { isActive: true },
        order: [['genre', 'ASC']]
      });
      return res.status(200).json({ 
        status: 200, 
        message: 'Genres retrieved', 
        result: { genres: genres.map(g => g.genre).filter(Boolean) } 
      });
    } catch (error) {
      console.error('getGenres error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getDecades(req, res) {
    try {
      const decades = await db.Song.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('decade')), 'decade']],
        where: { isActive: true },
        order: [['decade', 'ASC']]
      });
      return res.status(200).json({ 
        status: 200, 
        message: 'Decades retrieved', 
        result: { decades: decades.map(d => d.decade).filter(Boolean) } 
      });
    } catch (error) {
      console.error('getDecades error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  // --- STREAMING & FAVORITES ---

  async streamSong(req, res) {
    try {
      const { id } = req.params;
      const range = req.headers.range;

      const song = await db.Song.findOne({ where: { id, isActive: true } });
      if (!song) return res.status(404).json({ status: 404, message: 'Song not found or unavailable' });

      if (song.storageProvider === 'GOOGLE_DRIVE') {
        await GoogleDriveStorageService.streamFile(song.externalId, range, res);
      } else {
        return res.status(500).json({ status: 500, message: 'Unsupported storage provider' });
      }
    } catch (error) {
      console.error('streamSong error:', error);
      if (!res.headersSent) {
        res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
      }
    }
  }

  async toggleFavorite(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const song = await db.Song.findOne({ where: { id, isActive: true } });
      if (!song) return res.status(404).json({ status: 404, message: 'Song not found' });

      const existingFav = await db.UserFavorite.findOne({ where: { userId, songId: id } });

      let favorite = false;
      if (existingFav) {
        await existingFav.destroy();
      } else {
        await db.UserFavorite.create({ userId, songId: id });
        favorite = true;
      }

      const songJSON = song.toJSON();
      songJSON.favorite = favorite;
      return res.status(200).json({ status: 200, message: 'Song favorite toggled', result: { song: songJSON } });
    } catch (error) {
      console.error('toggleFavorite error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  // --- PLAYLISTS ---

  async getPlaylists(req, res) {
    try {
      const userId = req.userId;
      const playlists = await db.Playlist.findAll({ where: { user_id: userId } });
      return res.status(200).json({ status: 200, message: 'Playlists retrieved', result: { playlists } });
    } catch (error) {
      console.error('getPlaylists error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async createPlaylist(req, res) {
    try {
      const userId = req.userId;
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ status: 400, message: 'Name is required' });

      const playlist = await db.Playlist.create({ user_id: userId, name, description });
      return res.status(200).json({ status: 200, message: 'Playlist created', result: { playlist } });
    } catch (error) {
      console.error('createPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async addSongToPlaylist(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { songId } = req.body;

      const playlist = await db.Playlist.findOne({ where: { id, user_id: userId } });
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });

      const song = await db.Song.findOne({ where: { id: songId, isActive: true } });
      if (!song) return res.status(404).json({ status: 404, message: 'Song not found or unavailable' });

      await db.PlaylistSong.findOrCreate({ where: { playlist_id: id, song_id: songId } });
      return res.status(200).json({ status: 200, message: 'Song added to playlist', result: {} });
    } catch (error) {
      console.error('addSongToPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getPlaylistSongs(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const playlist = await db.Playlist.findOne({
        where: { id, user_id: userId },
        include: [{
          model: db.Song,
          as: 'songs'
        }]
      });

      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });
      return res.status(200).json({ status: 200, message: 'Playlist songs retrieved', result: { songs: playlist.songs } });
    } catch (error) {
      console.error('getPlaylistSongs error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }
  async deletePlaylist(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const playlist = await db.Playlist.findOne({ where: { id, user_id: userId } });
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });
      await db.PlaylistSong.destroy({ where: { playlist_id: id } });
      await playlist.destroy();
      return res.status(200).json({ status: 200, message: 'Playlist deleted', result: {} });
    } catch (error) {
      console.error('deletePlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async renamePlaylist(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, description } = req.body;
      const playlist = await db.Playlist.findOne({ where: { id, user_id: userId } });
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });
      if (name) playlist.name = name;
      if (description !== undefined) playlist.description = description;
      await playlist.save();
      return res.status(200).json({ status: 200, message: 'Playlist updated', result: { playlist } });
    } catch (error) {
      console.error('renamePlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async removeSongFromPlaylist(req, res) {
    try {
      const userId = req.userId;
      const { id, songId } = req.params;
      const playlist = await db.Playlist.findOne({ where: { id, user_id: userId } });
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });
      await db.PlaylistSong.destroy({ where: { playlist_id: id, song_id: songId } });
      return res.status(200).json({ status: 200, message: 'Song removed from playlist', result: {} });
    } catch (error) {
      console.error('removeSongFromPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async reorderPlaylistSong(req, res) {
    try {
      const userId = req.userId;
      const { id, songId } = req.params;
      const { position } = req.body;
      const playlist = await db.Playlist.findOne({ where: { id, user_id: userId } });
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });
      const playlistSong = await db.PlaylistSong.findOne({ where: { playlist_id: id, song_id: songId } });
      if (!playlistSong) return res.status(404).json({ status: 404, message: 'Song not found in playlist' });
      playlistSong.position = position;
      await playlistSong.save();
      return res.status(200).json({ status: 200, message: 'Song position updated', result: {} });
    } catch (error) {
      console.error('reorderPlaylistSong error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  // --- LISTEN HISTORY ---

  async recordPlayEvent(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const song = await db.Song.findOne({ where: { id, isActive: true } });
      if (!song) return res.status(404).json({ status: 404, message: 'Song not found' });
      
      // Throttle: don't record if user played this exact song within the last 5 minutes
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentPlay = await db.ListenHistory.findOne({
        where: { user_id: userId, song_id: id, played_at: { [Op.gte]: fiveMinsAgo } }
      });

      if (!recentPlay) {
        await db.ListenHistory.create({ user_id: userId, song_id: id });
      }

      return res.status(200).json({ status: 200, message: 'Play recorded', result: {} });
    } catch (error) {
      console.error('recordPlayEvent error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getRecentlyPlayed(req, res) {
    try {
      const userId = req.userId;
      const { limit = 20 } = req.query;
      
      // We need distinct songs, ordered by MAX(played_at)
      const history = await db.ListenHistory.findAll({
        where: { user_id: userId },
        attributes: [
          'song_id',
          [Sequelize.fn('MAX', Sequelize.col('played_at')), 'lastPlayed']
        ],
        group: ['song_id'],
        order: [[Sequelize.col('lastPlayed'), 'DESC']],
        limit: parseInt(limit, 10),
        raw: true
      });

      if (!history.length) {
        return res.status(200).json({ status: 200, message: 'Recently played', result: { songs: [] } });
      }

      const songIds = history.map(h => h.song_id);
      
      const songsData = await db.Song.findAll({
        where: { id: { [Op.in]: songIds }, isActive: true },
        include: [{
          model: db.User,
          as: 'favoritedBy',
          where: { id: userId },
          required: false,
          attributes: ['id']
        }]
      });

      // Map and sort them according to the history order
      const songsMap = {};
      songsData.forEach(song => {
        const json = song.toJSON();
        json.favorite = !!(json.favoritedBy && json.favoritedBy.length > 0);
        delete json.favoritedBy;
        if (json.coverArtKey) json.coverArtUrl = `/public/artwork/${json.coverArtKey}`;
        songsMap[json.id] = json;
      });

      const songs = songIds.map(id => songsMap[id]).filter(Boolean);

      return res.status(200).json({ status: 200, message: 'Recently played', result: { songs } });
    } catch (error) {
      console.error('getRecentlyPlayed error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  // --- FEATURED / DRIVE PLAYLISTS ---

  async ensureDefaultDrivePlaylists() {
    if (!db.DrivePlaylist) return;
    try {
      await db.DrivePlaylist.sync();
      const count = await db.DrivePlaylist.count();
      if (count === 0) {
        await db.DrivePlaylist.bulkCreate([
          {
            name: 'TaalVibe Special',
            slug: 'taalvibe-special',
            description: 'Handpicked hits, trending beats & exclusive tracks',
            gradient: 'from-[#ff0f7b] to-[#f89b29]',
            iconName: 'Sparkles',
            position: 0,
            isActive: true
          },
          {
            name: 'Old Songs',
            slug: 'old-songs',
            description: 'Golden retro hits, timeless classics & pure nostalgia',
            gradient: 'from-[#4facfe] to-[#00f2fe]',
            iconName: 'Radio',
            position: 1,
            isActive: true
          },
          {
            name: 'Romantic Songs',
            slug: 'romantic-songs',
            description: 'Soulful acoustic & heartwarming love melodies',
            gradient: 'from-[#8E2DE2] to-[#4A00E0]',
            iconName: 'Heart',
            position: 2,
            isActive: true
          },
          {
            name: 'Feel Good & Chill',
            slug: 'feel-good',
            description: 'Uplifting beats, breezy rhythms & relaxing vibes',
            gradient: 'from-[#11998e] to-[#38ef7d]',
            iconName: 'Coffee',
            position: 3,
            isActive: true
          }
        ]);
      }
    } catch (err) {
      console.warn('ensureDefaultDrivePlaylists error:', err.message);
    }
  }

  async getFeaturedPlaylists(req, res) {
    try {
      await this.ensureDefaultDrivePlaylists();

      const playlists = await db.DrivePlaylist.findAll({
        where: { isActive: true },
        order: [['position', 'ASC'], ['id', 'ASC']]
      });

      const result = await Promise.all(playlists.map(async (pl) => {
        const plJson = pl.toJSON();
        let songCount = 0;
        if (pl.folderId) {
          songCount = await db.Song.count({
            where: {
              folderId: pl.folderId,
              isActive: true
            }
          });
        }
        return {
          ...plJson,
          songCount
        };
      }));

      return res.status(200).json({
        status: 200,
        message: 'Featured playlists retrieved',
        result: { playlists: result }
      });
    } catch (error) {
      console.error('getFeaturedPlaylists error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getFeaturedPlaylist(req, res) {
    try {
      const { idOrSlug } = req.params;
      const userId = req.userId;
      await this.ensureDefaultDrivePlaylists();

      const isNumeric = !isNaN(parseInt(idOrSlug, 10)) && /^\d+$/.test(idOrSlug);
      const playlist = await db.DrivePlaylist.findOne({
        where: isNumeric ? { id: parseInt(idOrSlug, 10) } : { slug: idOrSlug }
      });

      if (!playlist) {
        return res.status(404).json({ status: 404, message: 'Playlist not found' });
      }

      let songs = [];
      if (playlist.folderId) {
        const songsData = await db.Song.findAll({
          where: {
            folderId: playlist.folderId,
            isActive: true
          },
          include: [{
            model: db.User,
            as: 'favoritedBy',
            where: { id: userId },
            required: false,
            attributes: ['id']
          }],
          order: [['title', 'ASC']]
        });

        songs = songsData.map(song => {
          const songJSON = song.toJSON();
          songJSON.favorite = song.favoritedBy && song.favoritedBy.length > 0;
          delete songJSON.favoritedBy;
          if (songJSON.coverArtKey) {
            songJSON.coverArtUrl = `/public/artwork/${songJSON.coverArtKey}`;
          }
          return songJSON;
        });
      }

      return res.status(200).json({
        status: 200,
        message: 'Playlist retrieved',
        result: {
          playlist: playlist.toJSON(),
          songs
        }
      });
    } catch (error) {
      console.error('getFeaturedPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async getAdminDriveFolders(req, res) {
    try {
      const folders = await GoogleDriveStorageService.listSubfolders();
      return res.status(200).json({
        status: 200,
        message: 'Drive folders retrieved',
        result: { folders }
      });
    } catch (error) {
      console.error('getAdminDriveFolders error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async createFeaturedPlaylist(req, res) {
    try {
      await this.ensureDefaultDrivePlaylists();
      const { name, slug, description, folderId, gradient, iconName } = req.body;
      if (!name) return res.status(400).json({ status: 400, message: 'Name is required' });

      const autoSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const count = await db.DrivePlaylist.count();

      const playlist = await db.DrivePlaylist.create({
        name,
        slug: autoSlug || `playlist-${Date.now()}`,
        description: description || '',
        folderId: folderId || null,
        gradient: gradient || 'from-[#ff0f7b] to-[#f89b29]',
        iconName: iconName || 'Sparkles',
        position: count,
        isActive: true
      });

      return res.status(200).json({
        status: 200,
        message: 'Playlist created',
        result: { playlist }
      });
    } catch (error) {
      console.error('createFeaturedPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async updateFeaturedPlaylist(req, res) {
    try {
      const { id } = req.params;
      const { name, description, folderId, gradient, iconName, isActive, position } = req.body;

      const playlist = await db.DrivePlaylist.findByPk(id);
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });

      if (name !== undefined) playlist.name = name;
      if (description !== undefined) playlist.description = description;
      if (folderId !== undefined) playlist.folderId = folderId;
      if (gradient !== undefined) playlist.gradient = gradient;
      if (iconName !== undefined) playlist.iconName = iconName;
      if (isActive !== undefined) playlist.isActive = isActive;
      if (position !== undefined) playlist.position = position;

      await playlist.save();

      return res.status(200).json({
        status: 200,
        message: 'Playlist updated',
        result: { playlist }
      });
    } catch (error) {
      console.error('updateFeaturedPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async deleteFeaturedPlaylist(req, res) {
    try {
      const { id } = req.params;
      const playlist = await db.DrivePlaylist.findByPk(id);
      if (!playlist) return res.status(404).json({ status: 404, message: 'Playlist not found' });

      await playlist.destroy();
      return res.status(200).json({
        status: 200,
        message: 'Playlist deleted',
        result: {}
      });
    } catch (error) {
      console.error('deleteFeaturedPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }

  async syncFeaturedPlaylist(req, res) {
    try {
      const { id } = req.params;
      const playlist = await db.DrivePlaylist.findByPk(id);
      if (!playlist || !playlist.folderId) {
        return res.status(400).json({ status: 400, message: 'Playlist folder ID not set' });
      }

      const stats = await GoogleDriveStorageService.syncLibrary(playlist.folderId);
      return res.status(200).json({
        status: 200,
        message: 'Playlist folder synced',
        result: { stats }
      });
    } catch (error) {
      console.error('syncFeaturedPlaylist error:', error);
      return res.status(500).json({ status: 500, message: 'Internal Server Error', error: error.message });
    }
  }
}

const musicControllerInstance = new MusicController();
musicControllerInstance.getFeaturedPlaylists = musicControllerInstance.getFeaturedPlaylists.bind(musicControllerInstance);
musicControllerInstance.getFeaturedPlaylist = musicControllerInstance.getFeaturedPlaylist.bind(musicControllerInstance);
musicControllerInstance.getAdminDriveFolders = musicControllerInstance.getAdminDriveFolders.bind(musicControllerInstance);
musicControllerInstance.createFeaturedPlaylist = musicControllerInstance.createFeaturedPlaylist.bind(musicControllerInstance);
musicControllerInstance.updateFeaturedPlaylist = musicControllerInstance.updateFeaturedPlaylist.bind(musicControllerInstance);
musicControllerInstance.deleteFeaturedPlaylist = musicControllerInstance.deleteFeaturedPlaylist.bind(musicControllerInstance);
musicControllerInstance.syncFeaturedPlaylist = musicControllerInstance.syncFeaturedPlaylist.bind(musicControllerInstance);

export default musicControllerInstance;
