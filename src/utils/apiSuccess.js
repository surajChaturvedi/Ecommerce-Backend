/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const apiSuccess = (message, data = null, code = 200, success = true) => {
  return {
    message,
    data,
    code,
    success,
  };
};

module.exports = apiSuccess;
