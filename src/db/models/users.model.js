'use strict'
export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        autoIncrement: true,
        autoIncrementIdentity: true,
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true
      },
      userName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'user_name'
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'first_name'
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'last_name'
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'email',
        unique: true
      },
      phoneCountryCode: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'phone_country_code'
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'phone'
      },
      profilePicture: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'profile_picture'
      },
      geminiApiKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'gemini_api_key'
      },
      resetToken: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'reset_token'
      },
      resetTokenExpires: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'reset_token_expires'
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'USER'
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
      tableName: 'users',
      timestamps: true,
      indexes: [
        {
          name: 'users_pkey',
          unique: true,
          fields: [
            {
              name: 'id'
            }
          ]
        }
      ]
    }
  )

  User.associate = function(models) {
    if (models.Song) {
      User.hasMany(models.Song, { foreignKey: 'userId', as: 'songs' })
    }
    if (models.Playlist) {
      User.hasMany(models.Playlist, { foreignKey: 'user_id', as: 'playlists' })
    }
    if (models.UserFavorite) {
      User.hasMany(models.UserFavorite, { foreignKey: 'userId', as: 'favorites' })
    }
  }

  return User
}
