/*
* Coppermobile Inc
* Copyright (c) 2022-Present Copper Mobile
* Contact at copper mobile dot com
*/

const statusCodes = require('http-status');
const ApiError = require('../utils/apiError');
const config = require('../config/config')

const verifyRestAPIKey = async (req, res, next) => {
    const restAPIKey = req.headers['rest-api-key']
    if (config.apikey!=restAPIKey){
        next( new ApiError(statusCodes.BAD_REQUEST, 'rest-api-key is wrong'));
    }
    next();
};

module.exports = { verifyRestAPIKey };
