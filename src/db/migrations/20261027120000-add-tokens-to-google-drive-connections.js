'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('google_drive_connections');
    if (!tableInfo.access_token) {
      await queryInterface.addColumn('google_drive_connections', 'access_token', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
    if (!tableInfo.token_expiry) {
      await queryInterface.addColumn('google_drive_connections', 'token_expiry', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('google_drive_connections');
    if (tableInfo.access_token) {
      await queryInterface.removeColumn('google_drive_connections', 'access_token');
    }
    if (tableInfo.token_expiry) {
      await queryInterface.removeColumn('google_drive_connections', 'token_expiry');
    }
  }
};
