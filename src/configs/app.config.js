import convict from 'convict'
import dotenv from 'dotenv'
import fs from 'fs'

if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'))

  for (const key in envConfig) {
    process.env[key] = envConfig[key]
  }
}

const config = convict({
  app: {
    name: {
      doc: 'Name of the service',
      format: String,
      default: 'eazy6-dfs-user-backend'
    },
    url: {
      doc: 'URL of the service',
      format: String,
      default: 'user-backend:8003',
      env: 'APP_URL'
    },
    appName: {
      doc: 'Name of the application',
      format: String,
      default: 'Eazy6',
      env: 'APP_NAME'
    }
  },

  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'staging', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },

  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT'
  },

  automatic_transactions: {
    doc: 'Automatic manage db transaction or not',
    format: Boolean,
    default: 'true',
    env: 'AUTOMATIC_TRANSACTIONS'
  },

  db: {
    name: {
      doc: 'Database Name',
      format: String,
      default: 'api',
      env: 'DB_NAME'
    },
    username: {
      doc: 'Database user',
      format: String,
      default: 'postgres',
      env: 'DB_USERNAME'
    },
    password: {
      doc: 'Database password',
      format: '*',
      default: 'postgres',
      env: 'DB_PASSWORD'
    },
    host: {
      doc: 'DB host',
      format: String,
      default: '127.0.0.1',
      env: 'DB_HOST'
    },
    port: {
      doc: 'DB PORT',
      format: 'port',
      default: '5432',
      env: 'DB_PORT'
    }
  },

  // redis_db: {
  //   password: {
  //     doc: 'Redis Database password',
  //     format: '*',
  //     default: '',
  //     env: 'REDIS_DB_PASSWORD',
  //   },
  //   host: {
  //     doc: 'Redis DB host',
  //     format: String,
  //     default: '127.0.0.1',
  //     env: 'REDIS_DB_HOST',
  //   },
  //   port: {
  //     doc: 'Redis DB PORT',
  //     format: 'port',
  //     default: 6379,
  //     env: 'REDIS_DB_PORT',
  //   },
  // },

  jwt: {
    loginTokenSecret: {
      default: '82349dfsi435i3d923n29ed2mrj3',
      env: 'JWT_LOGIN_SECRET'
    },
    loginTokenExpiry: {
      default: '2d',
      env: 'JWT_LOGIN_TOKEN_EXPIRY'
    },
    verificationTokenSecret: {
      default: '89234nsda995tmrsda9we',
      env: 'VERIFICATION_TOKEN_SECRET'
    },
    verificationTokenExpiry: {
      default: '120s',
      env: 'VERIFICATION_TOKEN_EXPIRY'
    },
    refreshTokenSecret: {
      default: '82349dfsi435i3d923n29ed2mrj3',
      env: 'JWT_REFRESH_SECRET'
    },
    refreshTokenExpiry: {
      default: '7d',
      env: 'JWT_REFRESH_TOKEN_EXPIRY'
    },
    extendedRefreshTokenExpiry: {
      default: '30d',
      env: 'JWT_EXTENDED_REFRESH_TOKEN_EXPIRY'
    },
    lookupTokenSecret: {
      default: '9dk38fjs93jf82kd9skf83j2kdsf9sdf',
      env: 'JWT_LOOKUP_SECRET'
    },
    lookupTokenExpiry: {
      default: '5m',
      env: 'JWT_LOOKUP_TOKEN_EXPIRY'
    }
  },

  pub_sub_redis_db: {
    url: {
      doc: 'Redis full URL',
      format: String,
      default: '',
      env: 'REDIS_URL'
    },
    password: {
      doc: 'Redis Database password',
      format: '*',
      default: '',
      env: 'PUB_SUB_REDIS_DB_PASSWORD'
    },
    host: {
      doc: 'Redis DB host',
      format: String,
      default: '127.0.0.1',
      env: 'PUB_SUB_REDIS_DB_HOST'
    },
    port: {
      doc: 'Redis DB PORT',
      format: 'port',
      default: 6379,
      env: 'PUB_SUB_REDIS_DB_PORT'
    }
  },
  aws: {
    region: {
      doc: 'AWS Region for services',
      format: String,
      default: 'us-east-1',
      env: 'AWS_REGION'
    },
    s3Bucket: {
      doc: 'AWS S3 Bucket Name',
      format: String,
      default: 'aws-default',
      env: 'AWS_S3_BUCKET'
    }
  },
  azure: {
    accountName: {
      doc: 'Azure Storage Account Name',
      format: String,
      default: 'appraphiikp',
      env: 'AZURE_STORAGE_ACCOUNT'
    },
    containerName: {
      doc: 'Azure Blob Container Name',
      format: String,
      default: 'oakridgedevuecontainer',
      env: 'AZURE_BLOB_CONTAINER'
    },
    clientId: {
      doc: 'Azure Client ID (for EnvironmentCredential)',
      format: String,
      default: '',
      env: 'AZURE_CLIENT_ID'
    },
    tenantId: {
      doc: 'Azure Tenant ID',
      format: String,
      default: '',
      env: 'AZURE_TENANT_ID'
    },
    tokenFilePath: {
      doc: 'Azure Federated Token File Path',
      format: String,
      default: '',
      env: 'AZURE_FEDERATED_TOKEN_FILE'
    },
    authorityHost: {
      doc: 'Azure Authority Host URL',
      format: String,
      default: 'https://login.microsoftonline.com/',
      env: 'AZURE_AUTHORITY_HOST'
    }
  },
  r2: {
    accountId: {
      doc: 'Cloudflare R2 Account ID',
      format: String,
      default: '',
      env: 'R2_ACCOUNT_ID'
    },
    accessKeyId: {
      doc: 'Cloudflare R2 Access Key ID',
      format: String,
      default: '',
      env: 'R2_ACCESS_KEY_ID'
    },
    secretAccessKey: {
      doc: 'Cloudflare R2 Secret Access Key',
      format: String,
      default: '',
      env: 'R2_SECRET_ACCESS_KEY'
    },
    bucketName: {
      doc: 'Cloudflare R2 Bucket Name',
      format: String,
      default: 'sonora-music',
      env: 'R2_BUCKET_NAME'
    }
  },
  // zoho: {
  //   clientId: {
  //     doc: 'Client ID for Zoho CRM API',
  //     format: String,
  //     default: 'your_client_id',
  //     env: 'ZOHO_CLIENT_ID',
  //   },
  //   clientSecret: {
  //     doc: 'Client Secret for Zoho CRM API',
  //     format: String,
  //     default: 'your_client_secret',
  //     env: 'ZOHO_CLIENT_SECRET',
  //   },
  //   refreshToken: {
  //     doc: 'Refresh token for Zoho CRM API authentication',
  //     format: String,
  //     default: 'your_refresh_token',
  //     env: 'ZOHO_REFRESH_TOKEN',
  //   },
  //   baseUrl: {
  //     doc: 'Base URL for Zoho CRM API',
  //     format: String,
  //     default: 'https://www.zohoapis.in/crm/v5',
  //     env: 'ZOHO_BASE_URL',
  //   },
  //   tokenUrl: {
  //     doc: 'URL for refreshing Zoho CRM access tokens',
  //     format: String,
  //     default: 'https://accounts.zoho.in/oauth/v2/token',
  //     env: 'ZOHO_TOKEN_URL',
  //   },
  //   accessToken: {
  //     doc: 'Access token for Zoho CRM API requests (dynamically updated)',
  //     format: String,
  //     default: '',
  //     env: 'ZOHO_ACCESS_TOKEN',
  //   },
  // },

  mail: {
    mailer: {
      doc: 'Mail delivery service',
      format: String,
      default: 'smtp',
      env: 'MAIL_MAILER'
    },
    host: {
      doc: 'Mail server host',
      format: String,
      default: '',
      env: 'MAIL_HOST'
    },
    port: {
      doc: 'Mail server port',
      format: 'port',
      default: 587,
      env: 'MAIL_PORT'
    },
    username: {
      doc: 'Mail server username',
      format: String,
      default: '',
      env: 'MAIL_USERNAME'
    },
    password: {
      doc: 'Mail server password',
      format: '*',
      default: '',
      env: 'MAIL_PASSWORD'
    },
    encryption: {
      doc: 'Mail server encryption',
      format: String,
      default: 'tls',
      env: 'MAIL_ENCRYPTION'
    },
    fromAddress: {
      doc: 'Default email sender address',
      format: String,
      default: '',
      env: 'MAIL_FROM_ADDRESS'
    },
    fromName: {
      doc: 'Default email sender name',
      format: String,
      default: 'Eazy6',
      env: 'MAIL_FROM_NAME'
    }
  },

  log_level: {
    doc: 'Level of logs to show',
    format: String,
    default: 'debug',
    env: 'LOG_LEVEL'
  },
  google: {
    clientId: {
      doc: 'Google OAuth2 Client ID',
      format: String,
      default: '',
      env: 'GOOGLE_CLIENT_ID'
    },
    clientSecret: {
      doc: 'Google OAuth2 Client Secret',
      format: String,
      default: '',
      env: 'GOOGLE_CLIENT_SECRET'
    },
    redirectUri: {
      doc: 'Google OAuth2 Redirect URI',
      format: String,
      default: 'http://localhost:8080/api/v1/music/auth/google/callback',
      env: 'GOOGLE_REDIRECT_URI'
    }
  },

  apple: {
    bundleId: {
      doc: 'Apple Bundle ID',
      format: String,
      default: '',
      env: 'APPLE_BUNDLE_ID'
    }
  },
  vonage: {
    apiKey: {
      doc: 'Vonage API Key',
      format: String,
      default: '',
      env: 'VONAGE_SMS_API_KEY'
    },
    apiSecret: {
      doc: 'Vonage API Secret',
      format: String,
      default: '',
      env: 'VONAGE_SMS_API_SECRET'
    }
  },

  sumsub: {
    appToken: {
      doc: 'SumSub App Token',
      format: String,
      default: '',
      env: 'SUMSUB_TOKEN'
    },
    secretKey: {
      doc: 'SumSub Secret Key for HMAC signing',
      format: '*',
      default: '',
      env: 'SUMSUB_SECRET_KEY'
    }
  }
})

config.validate({ allowed: 'strict' })

export default config
