import config from './app.config.js'

const commonSetting = {
  username: config.get('db.username'),
  password: config.get('db.password'),
  database: config.get('db.name'),
  host: config.get('db.host'),
  port: config.get('db.port'),
  dialect: 'postgres',
  dialectOptions: {
    application_name: config.get('app.name'),
    ssl: {
      require: true,
      rejectUnauthorized: false
    },
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 20000
  },
  define: {
    underscored: true,
    timestamps: true
  },
  pool: {
    max: 50,
    min: 0,
    idle: 5000,
    evict: 5000,
    acquire: 200000
  }
}

export const development = {
  ...commonSetting
}

export const test = {
  ...commonSetting
}

export const staging = {
  ...commonSetting
}

export const production = {
  ...commonSetting
}

const configs = {
  development,
  test,
  staging,
  production
};

export default configs;
