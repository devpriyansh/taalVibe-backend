'use strict';
export default (sequelize, DataTypes) => {
  const ListenHistory = sequelize.define('ListenHistory', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    song_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    played_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'listen_histories',
    underscored: true,
    timestamps: true
  });

  ListenHistory.associate = function(models) {
    ListenHistory.belongsTo(models.User, { foreignKey: 'user_id' });
    ListenHistory.belongsTo(models.Song, { foreignKey: 'song_id' });
  };

  return ListenHistory;
};