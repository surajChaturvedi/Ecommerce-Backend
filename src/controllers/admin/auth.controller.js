/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const passwordHashing = require("../../utils/password-hashing");
const { nanoid } = require("nanoid");
let { userService, otpService, tokenService } = require("../../services");
const model = require("../../models/index");
const sendOTPVerificationEmail = require("../../utils/node-mailer");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");

class AdminAuthController {
  /**
   * Login
   */
  signIn = catchAsync(async (req, res) => {
    const { email, password } = req.body;

    let queryOptions = {
      where: {
        email: email
      },
    };
    let user = await userService.findOne(queryOptions);
    if (!user && user.user_type != 2 ) {
      throw new ApiError(statusCodes.NOT_FOUND, "Entered wrong credentials.");
    }
    if (!user.is_active) {
      throw new ApiError(statusCodes.UNAUTHORIZED, "You have been made inactive by the Admin.",false);
    }

    if(!user.password){
      throw new ApiError(statusCodes.UNAUTHORIZED, "Invalid credentials",false);
    }

    if (!passwordHashing.ComparePassword(password, user.password)) {
      throw new ApiError(statusCodes.UNAUTHORIZED, "Invalid credentials",false);
    }
    const tokens = await tokenService.generateAuthTokens(user);
    res.send(apiResponse("Logged in successfully", tokens));
  });

  /**
   * logOut
   */
  logOut = catchAsync(async (req, res) => {
    let { id } = req.userData;
    let queryOptions = {
      where: {
        user_id: id,
      },
    };
    await tokenService.destroy(queryOptions);
    res.send(apiResponse("Logged out successfully"));
  });

  /**
   * forget password
   */
  forgetPassword = catchAsync(async (req, res) => {
    const { email } = req.body;
    let queryOptions = {
      where: {
        email: email,
        user_type: 2,
      },
    };
    let admin = await userService.findOne(queryOptions);
    if (admin) {
      let otp = `${Math.floor(100000 + Math.random() * 9000)}`;
      const otpData = {
        user_id: admin.id,
        otp: otp,
      };
      queryOptions = {
        where: {
          user_id: admin.id,
        },
      };
      const otpCheck = await otpService.getOTP(queryOptions);
      if (otpCheck) {
        queryOptions = {
          where: {
            user_id: admin.id,
          },
        };
        console.log("user found");
        await otpService.update(otpData, queryOptions);
      } else {
        queryOptions = {
          where: {
            id: admin.id,
          },
        };
        console.log("user not found");
        await otpService.create(otpData, queryOptions);
      }
      res.send(apiResponse("OTP sent.", { user_id: admin.id }));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Invalid Email");
    }
  });

  /**
   * verify otp
   */
  verifyOtp = async (req, res) => {
    try {
      const { user_id, otp } = req.body;

      if (!user_id || !otp) {
        throw Error("Empty otp details are not allowed");
      } else {
        let queryOptions = {
          where: {
            user_id: user_id,
          },
        };

        let otpCheck = await otpService.getOTP(queryOptions);
        if (!otpCheck) {
          res.json({
            message: "Account record doesn't exist ",
          });
        } else {
          if (otp != otpCheck.otp) {
            //supplied worng otp
            throw new Error(
              "Invalid otp please check email and enter correct otp"
            );
          } else {
            res.send(apiResponse("OTP verified"));
          }
        }
      }
    } catch (error) {
      res.json({
        status: "FAILED",
        message: error.message,
      });
    }
  };

  /**
   * resend otp
   */
  resendOtp = catchAsync(async (req, res) => {
    try {
      const { user_id } = req.body;
      let queryOptions = {
        where: {
          id: user_id,
          user_type: 2,
        },
      };
      let admin = await userService.findOne(queryOptions);
      if (admin) {
        let otp = `${Math.floor(100000 + Math.random() * 9000)}`;
        const otpData = {
          user_id: admin.id,
          otp: otp,
        };
      }
      if (admin) {
        let otp = `${Math.floor(100000 + Math.random() * 9000)}`;
        const otpData = {
          user_id: admin.id,
          otp: otp,
        };

        queryOptions = {
          where: {
            user_id: admin.id,
          },
        };
        const otpCheck = await otpService.getOTP(queryOptions);
        if (otpCheck) {
          queryOptions = {
            where: {
              user_id: admin.id,
            },
          };
          await otpService.update(otpData, queryOptions);
        } else {
          queryOptions = {
            where: {
              id: admin.id,
            },
          };
          await otpService.create(otpData, queryOptions);
        }
        res.send(apiResponse("Otp resent"));
      } else {
        throw new ApiError(statusCodes.BAD_REQUEST, "Id deos'nt exist");
      }
    } catch (error) {
      res.json({
        status: "FAILED",
        message: error.message,
      });
    }
  });

  /**
   * show admin otp
   */
showOtpAdmin = catchAsync(async (req, res) => {
  // check if user exists or not
  let {user_id} = req.query;
  let queryOptions = {
    where: {
      user_id: user_id
    }
  };
  let user = await otpService.getOTP(queryOptions)

    if (!user) {
      throw new ApiError(statusCodes.BAD_REQUEST, "User not found");
    } else {
      res.send(apiResponse(`OTP is ${user.otp}`));
    }
  });

  createNewPassword = catchAsync(async (req, res) => {
    const { user_id, password, confirmNewPassword } = req.body;
    let queryOptions = {
      where: {
        id: user_id,
        user_type: 2,
      },
    };
    const dbTxn = await model.sequelize.transaction();
    if (password != confirmNewPassword) {
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Password does not match");
    } else {
      let hashedPassword = passwordHashing.CreateHash(password);
      let requestBody = {
        password: hashedPassword,
      };
      const newUser = await userService.update(requestBody, queryOptions);
      res.send(apiResponse("Password updated"));
      dbTxn.commit();
    }
  });

  verifyPassword = catchAsync(async (req, res) => {
    let { password } = req.body;
    let queryOptions = {
      where: {
        id: req.userData.id,
        user_type: 2,
      },
    };

    let user = await userService.findOne(queryOptions);
    const dbTxn = await model.sequelize.transaction();
    if (!passwordHashing.ComparePassword(password, user.password)) {
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Invalid credentials");
    } else {
      res.send(apiResponse("Password verified"));
    }
  });
}

module.exports = new AdminAuthController();
