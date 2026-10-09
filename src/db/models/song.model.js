'use strict'
export default (sequelize, DataTypes) => {
  const Song = sequelize.define(
    'Song',
    {
      id: {
        autoIncrement: true,
        autoIncrementIdentity: true,
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'user_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      artist: {
        type: DataTypes.STRING,
        allowNull: true
      },
      album: {
        type: DataTypes.STRING,
        allowNull: true
      },
      albumArtist: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'album_artist'
      },
      year: {
        type: DataTypes.STRING,
        allowNull: true
      },
      decade: {
        type: DataTypes.STRING,
        allowNull: true
      },
      genre: {
        type: DataTypes.STRING,
        allowNull: true
      },
      duration: {
        type: DataTypes.INTEGER, // duration in seconds
        allowNull: true
      },
      storageKey: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'storage_key'
      },
      externalId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'external_id'
      },
      folderId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'folder_id'
      },
      storageProvider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'GOOGLE_DRIVE',
        field: 'storage_provider'
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'mime_type'
      },
      fileSize: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'file_size'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      coverArtKey: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'cover_art_key'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at'
      }
    },
    {
      sequelize,
      underscored: true,
      tableName: 'songs',
      timestamps: true,
      indexes: [
        {
          name: 'songs_pkey',
          unique: true,
          fields: [{ name: 'id' }]
        },
        {
          name: 'songs_user_id_idx',
          fields: [{ name: 'user_id' }]
        },
        {
          name: 'songs_storage_provider_external_id_uk',
          unique: true,
          fields: [{ name: 'storage_provider' }, { name: 'external_id' }]
        }
      ]
    }
  )

  Song.associate = function(models) {
    Song.belongsTo(models.User, { foreignKey: 'userId', as: 'user' })
    Song.belongsToMany(models.Playlist, {
      through: models.PlaylistSong,
      foreignKey: 'song_id',
      otherKey: 'playlist_id',
      as: 'playlists'
    })
    Song.belongsToMany(models.User, {
      through: models.UserFavorite,
      foreignKey: 'song_id',
      otherKey: 'user_id',
      as: 'favoritedBy'
    })
  }

  return Song
}
