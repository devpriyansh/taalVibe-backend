'use strict';
export default (sequelize, DataTypes) => {
  const PlaylistSong = sequelize.define('PlaylistSong', {
    playlist_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    song_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    position: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'playlist_songs',
    underscored: true
  });

  PlaylistSong.associate = function(models) {
    PlaylistSong.belongsTo(models.Playlist, { foreignKey: 'playlist_id' });
    PlaylistSong.belongsTo(models.Song, { foreignKey: 'song_id' });
  };

  return PlaylistSong;
};