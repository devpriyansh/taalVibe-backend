'use strict';

export default (sequelize, DataTypes) => {
  const DrivePlaylist = sequelize.define('DrivePlaylist', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    folderId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'folder_id'
    },
    gradient: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'from-[#ff0f7b] to-[#f89b29]'
    },
    iconName: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Sparkles',
      field: 'icon_name'
    },
    coverUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'cover_url'
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'drive_playlists',
    underscored: true,
    timestamps: true
  });

  DrivePlaylist.associate = function(models) {
    // If needed in future, associate with songs
  };

  return DrivePlaylist;
};
