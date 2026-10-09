'use strict'
export default (sequelize, DataTypes) => {
  const GoogleDriveConnection = sequelize.define(
    'GoogleDriveConnection',
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
      googleAccountId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'google_account_id'
      },
      refreshToken: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'refresh_token'
      },
      scope: {
        type: DataTypes.STRING,
        allowNull: true
      },
      folderId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'folder_id'
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'CONNECTED'
      },
      isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_system'
      },
      lastSyncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_synced_at'
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
      tableName: 'google_drive_connections',
      timestamps: true,
      indexes: [
        {
          name: 'google_drive_connections_pkey',
          unique: true,
          fields: [{ name: 'id' }]
        }
      ]
    }
  )

  GoogleDriveConnection.associate = function(models) {
    GoogleDriveConnection.belongsTo(models.User, { foreignKey: 'userId', as: 'user' })
  }

  return GoogleDriveConnection
}
