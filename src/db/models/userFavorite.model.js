'use strict'
export default (sequelize, DataTypes) => {
  const UserFavorite = sequelize.define(
    'UserFavorite',
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
        allowNull: false,
        field: 'user_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      songId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'song_id',
        references: {
          model: 'songs',
          key: 'id'
        }
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
      tableName: 'user_favorites',
      timestamps: true,
      indexes: [
        {
          name: 'user_favorites_pkey',
          unique: true,
          fields: [{ name: 'id' }]
        },
        {
          name: 'user_favorites_user_id_song_id_uk',
          unique: true,
          fields: [{ name: 'user_id' }, { name: 'song_id' }]
        }
      ]
    }
  )

  UserFavorite.associate = function(models) {
    UserFavorite.belongsTo(models.User, { foreignKey: 'userId', as: 'user' })
    UserFavorite.belongsTo(models.Song, { foreignKey: 'songId', as: 'song' })
  }

  return UserFavorite
}
