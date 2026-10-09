'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('listen_histories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      played_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
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

    await queryInterface.addIndex('listen_histories', ['user_id', 'song_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('listen_histories');
  }
};