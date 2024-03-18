/*
 * Copper Digital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require('http-status');
const ApiError = require('../utils/apiError');
const {  tokenService } = require('../services');

const verifyAdminToken = async (req, res, next) => {
    res.lang = req.headers.lang ? req.headers.lang : 'en';
    const { authorization  } = req.headers;
    if(!authorization){
     return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
    }
    if(!authorization && authorization.split(' ')[0] === 'Bearer'){
      return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
    }
    const decoded = await tokenService.verifyToken(authorization.split(' ')[1], 1); // app_id - 1 for Admin
    if (!decoded){
      return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
    }
    if (!decoded.status) {
      return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
    }
  
    
    req.userData = {
      id: decoded.id,
      email: decoded.email,
      appId: decoded.app_id,
      first_name: decoded.first_name,
      last_name: decoded.last_name,
      status: decoded.status,
    };
    next();
};

const verifyUserToken = async (req, res, next) => {
  res.lang = req.headers.lang ? req.headers.lang : 'en';
  const { authorization  } = req.headers;
  if(!authorization){
   return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  if(!authorization && authorization.split(' ')[0] === 'Bearer'){
    return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  const decoded = await tokenService.verifyToken(authorization.split(' ')[1], 2); // app_id - 2 for user
  if (!decoded){
    return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  if (!decoded.status) {
    return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }

  
  req.userData = {
    id: decoded.id,
    email: decoded.email,
    appId: decoded.app_id,
    first_name: decoded.first_name,
    last_name: decoded.last_name,
    status: decoded.status,
  };
  next();
};

const verifyUserTokenStatus = async (req, res, next) => {
  res.lang = req.headers.lang ? req.headers.lang : 'en';
  const { authorization  } = req.headers;
  if(!authorization){
   return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  if(!authorization && authorization.split(' ')[0] === 'Bearer'){
    return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  const decoded = await tokenService.verifyToken(authorization.split(' ')[1], 2); // app_id - 2 for user
  if (!decoded){
    return next(new ApiError(statusCodes.UNAUTHORIZED, statusCodes[statusCodes.UNAUTHORIZED]));
  }
  
  req.userData = {
    id: decoded.id,
    email: decoded.email,
    appId: decoded.app_id,
    first_name: decoded.first_name,
    last_name: decoded.last_name,
    status: decoded.status,
  };
  next();
};

module.exports = { 
  verifyAdminToken,
  verifyUserToken,
  verifyUserTokenStatus
};