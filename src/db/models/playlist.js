'use strict';
export default (sequelize, DataTypes) => {
  const Playlist = sequelize.define('Playlist', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: DataTypes.STRING,
    cover_art_url: DataTypes.STRING
  }, {
    tableName: 'playlists',
    underscored: true
  });

  Playlist.associate = function(models) {
    Playlist.belongsTo(models.User, { foreignKey: 'user_id' });
    Playlist.belongsToMany(models.Song, {
      through: models.PlaylistSong,
      foreignKey: 'playlist_id',
      otherKey: 'song_id',
      as: 'songs'
    });
  };

  return Playlist;
};