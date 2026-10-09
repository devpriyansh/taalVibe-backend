'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add role to users
    await queryInterface.addColumn('users', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'USER'
    });

    // 2. Add is_system and make user_id nullable on google_drive_connections
    await queryInterface.addColumn('google_drive_connections', 'is_system', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.changeColumn('google_drive_connections', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });
    // Remove the unique constraint on user_id in google_drive_connections
    // We will do this carefully by finding the constraint name or catching if it fails
    try {
      await queryInterface.removeConstraint('google_drive_connections', 'google_drive_connections_user_id_key');
    } catch (e) {
      console.log('Unique constraint google_drive_connections_user_id_key not found or already removed.');
    }

    // 3. Create user_favorites table
    await queryInterface.createTable('user_favorites', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      song_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'songs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add unique constraint for (user_id, song_id)
    await queryInterface.addConstraint('user_favorites', {
      fields: ['user_id', 'song_id'],
      type: 'unique',
      name: 'user_favorites_user_id_song_id_uk'
    });

    // 4. Migrate existing favorites from songs to user_favorites
    await queryInterface.sequelize.query(`
      INSERT INTO user_favorites (user_id, song_id, created_at, updated_at)
      SELECT user_id, id, NOW(), NOW()
      FROM songs
      WHERE favorite = true;
    `);

    // 5. Update songs table (drop favorite, make user_id nullable, add is_active)
    await queryInterface.removeColumn('songs', 'favorite');
    
    await queryInterface.changeColumn('songs', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });

    await queryInterface.addColumn('songs', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
    
    // Add unique constraint for external_id to prevent duplicates in shared catalog
    // We assume external_id + storage_provider makes it globally unique
    try {
      await queryInterface.addConstraint('songs', {
        fields: ['storage_provider', 'external_id'],
        type: 'unique',
        name: 'songs_storage_provider_external_id_uk'
      });
    } catch (e) {
      console.log('Warning: Could not add unique constraint to songs, possibly due to existing duplicates.', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reverse operations
    await queryInterface.removeConstraint('songs', 'songs_storage_provider_external_id_uk').catch(() => {});
    await queryInterface.removeColumn('songs', 'is_active');
    
    // Restore favorite column to songs
    await queryInterface.addColumn('songs', 'favorite', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    
    // Migrate data back (lossy if multiple users favorited the same song, we just set favorite=true if ANY user favorited it)
    await queryInterface.sequelize.query(`
      UPDATE songs s
      SET favorite = true
      FROM user_favorites uf
      WHERE s.id = uf.song_id;
    `);
    
    await queryInterface.changeColumn('songs', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: false
    });

    await queryInterface.dropTable('user_favorites');

    // google_drive_connections reverse
    await queryInterface.changeColumn('google_drive_connections', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: false
    });
    await queryInterface.removeColumn('google_drive_connections', 'is_system');
    
    // users reverse
    await queryInterface.removeColumn('users', 'role');
  }
};
