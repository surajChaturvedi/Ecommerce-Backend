/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const apiResponse = (message, data = [], code = 200, success = true) => {
  return {
    message,
    data,
    code,
  };
};

module.exports = apiResponse;
