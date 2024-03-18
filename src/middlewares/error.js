/*
 * Copper Digital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require('http-status');
const config = require('../config/config');
// const logger = require('../config/logger');
const ApiError = require('../utils/apiError');

const errorConverter = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || statusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || statusCodes[statusCode];
    error = new ApiError(statusCode, message, false, err.stack);
  }
  next(error);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  if (config.env === 'production' && !err.isOperational) {
    statusCode = statusCodes.INTERNAL_SERVER_ERROR;
    message = statusCodes[statusCodes.INTERNAL_SERVER_ERROR];
  }

  res.locals.errorMessage = err.message;

  const response = {
    code: statusCode,
    message,
    ...(config.env !== 'production' && { stack: err.stack }),
  };

  if (config.env !== 'production') {
    logger.error(err);
  }

  res.status(statusCode).send(response);
};

module.exports = {
  errorConverter,
  errorHandler,
};
