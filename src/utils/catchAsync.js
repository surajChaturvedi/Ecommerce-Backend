/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

module.exports = catchAsync;
