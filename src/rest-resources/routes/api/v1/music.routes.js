import express from 'express';
import MusicController from '../../../controllers/music.controller';
import responseValidationMiddleware from '../../../middlewares/responseValidation.middleware';
import { isUserAuthenticated } from '../../../middlewares/isUserAuthenticated.middleware';
import { isAdmin } from '../../../middlewares/isAdmin.middleware';

const musicRoutes = express.Router();

const standardResponseSchema = {
  responseSchema: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        message: { type: 'string' },
        result: { type: 'object' }
      },
      required: ['status', 'message', 'result']
    },
    400: {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        message: { type: 'string' }
      },
      required: ['status', 'message']
    },
    401: {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        message: { type: 'string' },
        code: { type: 'string' },
        error: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        message: { type: 'string' },
        error: { type: 'string' }
      }
    }
  }
};

// --- OAUTH CALLBACK (NO AUTH REQUIRED) ---
musicRoutes.route('/auth/google/callback').get(
  MusicController.googleAuthCallback
);

// All other music routes require authentication
musicRoutes.use(isUserAuthenticated);

// --- OAUTH INIT & SYNC ROUTES ---
musicRoutes.route('/auth/google').get(
  isAdmin,
  MusicController.googleAuthInit
);

musicRoutes.route('/drive/status').get(
  isAdmin,
  MusicController.getDriveStatus,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/drive/folder').post(
  isAdmin,
  MusicController.setDriveFolder,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/sync').post(
  isAdmin,
  MusicController.syncLibrary,
  responseValidationMiddleware(standardResponseSchema)
);

// --- SONGS ---
musicRoutes.route('/songs').get(
  MusicController.getSongs,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/artists').get(
  MusicController.getArtists,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/albums').get(
  MusicController.getAlbums,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/genres').get(
  MusicController.getGenres,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/decades').get(
  MusicController.getDecades,
  responseValidationMiddleware(standardResponseSchema)
);

// Note: Streaming route does NOT use the standard JSON response validation middleware
// because it returns a raw binary stream, not JSON.
musicRoutes.route('/songs/:id/stream').get(
  MusicController.streamSong
);

// --- FAVORITES ---
musicRoutes.route('/songs/:id/favorite').patch(
  MusicController.toggleFavorite,
  responseValidationMiddleware(standardResponseSchema)
);

// --- FEATURED / DRIVE PLAYLISTS ---
musicRoutes.route('/featured-playlists').get(
  MusicController.getFeaturedPlaylists,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/featured-playlists/:idOrSlug').get(
  MusicController.getFeaturedPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

// Admin Featured Playlists Management
musicRoutes.route('/admin/drive-folders').get(
  isAdmin,
  MusicController.getAdminDriveFolders,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/admin/featured-playlists').post(
  isAdmin,
  MusicController.createFeaturedPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/admin/featured-playlists/:id').put(
  isAdmin,
  MusicController.updateFeaturedPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/admin/featured-playlists/:id').delete(
  isAdmin,
  MusicController.deleteFeaturedPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/admin/featured-playlists/:id/sync').post(
  isAdmin,
  MusicController.syncFeaturedPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

// --- PLAYLISTS ---
musicRoutes.route('/playlists').get(
  MusicController.getPlaylists,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists').post(
  MusicController.createPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id/songs').get(
  MusicController.getPlaylistSongs,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id/songs').post(
  MusicController.addSongToPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id').delete(
  MusicController.deletePlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id').patch(
  MusicController.renamePlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id/songs/:songId').delete(
  MusicController.removeSongFromPlaylist,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/playlists/:id/songs/:songId/reorder').patch(
  MusicController.reorderPlaylistSong,
  responseValidationMiddleware(standardResponseSchema)
);

// --- LISTEN HISTORY ---
musicRoutes.route('/songs/:id/play').post(
  MusicController.recordPlayEvent,
  responseValidationMiddleware(standardResponseSchema)
);

musicRoutes.route('/history/recently-played').get(
  MusicController.getRecentlyPlayed,
  responseValidationMiddleware(standardResponseSchema)
);

export default musicRoutes;
