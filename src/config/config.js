const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    // common config
    NODE_ENV: Joi.string().valid('development', 'localhost'),
    PORT: Joi.number().default(3000),
    REST_API_KEY: Joi.string(),
    ENCRYPTION_KEY: Joi.string(),

    // database config
    DB_DEBUG: Joi.boolean().required(),
    DB_POOL_MAX: Joi.number().required().default(5),
    DB_POOL_MIN: Joi.number().required().default(0),
    DB_POOL_ACQUIRE: Joi.number().required(),
    DB_POOL_IDLE: Joi.number().required(),
    DB_DIALECT: Joi.string().required(),
    DB_PORT: Joi.number(),

    // local config
    LOCALHOST_DB_USER: Joi.string().required(),
    LOCALHOST_DB_PASSWORD: Joi.string().required(),
    LOCALHOST_DB_NAME: Joi.string().required(),
    LOCALHOST_DB_HOST: Joi.string().required(),

    // javascript web token config
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  apikey: envVars.REST_API_KEY,
  encryptionKey: envVars.ENCRYPTION_KEY,
  localhost: {
    username: envVars.LOCALHOST_DB_USER,
    password: envVars.LOCALHOST_DB_PASSWORD,
    database: envVars.LOCALHOST_DB_NAME,
    host: envVars.LOCALHOST_DB_HOST,
    port: envVars.DB_PORT,
    dialect: envVars.DB_DIALECT,
  },
  
  dbConfig: {
    dialect: envVars.DB_DIALECT,
    debug: envVars.DB_DEBUG,
    pool: {
      max: parseInt(envVars.DB_POOL_MAX, 10),
      min: parseInt(envVars.DB_POOL_MIN, 10),
      acquire: parseInt(envVars.DB_POOL_ACQUIRE, 10),
      idle: parseInt(envVars.DB_POOL_IDLE, 10),
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  devAppLinks : {
    androidLink : envVars.DEV_ANDROID_LINK,
    iosLink : envVars.DEV_IOS_LINK
  },
  encryption: { 
    pepper: envVars.PEPPER,
    key: envVars.KEY
  }
};
