/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const passwordHashing = require("../../utils/password-hashing");
// const nanoid = require('nanoid');
let {
  userService,
  otpService,
  tokenService,
  twilioService,
  notificationService,
  userPreferenceService,
} = require("../../services");
const model = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");
const Api = require("twilio/lib/rest/Api");
const { stat } = require("fs");
const { userPreference } = require("./onboarding.controller");
const { nanoid } = require("nanoid");
const { getObjectSignedUrl } = require("../../utils/s3");
const httpStatus = require("http-status");
const internal = require("stream");
const { request } = require("http");
const userPointsDailyServices = require("../../services/userPointsDaily.services");

class AuthController {
  /**
   * Login via Mobile Number
   */
  login = catchAsync(async (req, res) => {
    const { mobile_number } = req.body;

    throw new ApiError(statusCodes.UNAUTHORIZED,"Couldn't login User",
    );

    let queryOptions = {
      where: {
        mobile_number: mobile_number,
      },
      include: [
        {
          model: model.otps,
          required: true,
          attributes: ["id", "otp"],
        },
      ],
    };
    let user = await userService.findOne(queryOptions);
    if (user) {
      if (!user.is_active) {
        throw new ApiError(
          statusCodes.UNAUTHORIZED,
          "User is made inactive by Admin"
        );
      }

      // const tokens = await tokenService.generateAuthTokens(user);
      queryOptions = {
        where: {
          mobile_number: mobile_number,
        },
      };
      let otp = Math.floor(100000 + Math.random() * 900000);
      let otpData = {
        otp: otp,
        user_id: user.id,
      };
      if (user.id) {
        queryOptions = {
          where: {
            id: user.otp.id,
          },
        };
        await otpService.update(otpData, queryOptions);
      } else {
        await otpService.create(otpData, queryOptions);
      }
    } else {
      let mds_id = nanoid(10);
      queryOptions = {
        mds_id: mds_id,
        mobile_number: mobile_number,
        user_type: 1,
      };
      user = await userService.create(queryOptions);
      let otp = Math.floor(100000 + Math.random() * 900000);
      let otpData = {
        otp: otp,
        user_id: user.id,
      };
      await otpService.create(otpData);
    }
    if (user) {
      const tokens = await tokenService.generateLoginToken(user);
      return res.send(apiResponse("OTP sent successfully.", tokens));
    } else {
      throw new ApiError(statusCodes.UNAUTHORIZED, {
        message: "Couldn't login User",
      });
    }
  });

  /**
   *Add mobile_number
   */
  AddMobileNumber = catchAsync(async (req, res) => {
    const { mobile_number } = req.body;
    let queryOptions = {
      where: {     
        id: req.userData.id,        
      },
    };
    let user = await userService.findOne(queryOptions);
    if (user) {
      if (!user.is_active) {
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "your made inactive by Admin"
        );
      }
      
      if(user.mobile_number == mobile_number && user.is_phone_verified==true){ {
        throw new ApiError(statusCodes.BAD_REQUEST, "Mobile Number Already Exists and verified");
      }
    }

      let otp = Math.floor(100000 + Math.random() * 900000);

      let otpData = {
        otp: otp,
        user_id: req.userData.id,
      };
      await otpService.create(otpData);

      queryOptions = {
        where: {
        id: req.userData.id,
        }
      };
      let  requestBody = {
        mobile_number: mobile_number,
      }
      user = await userService.update(requestBody,queryOptions);
    }
    if (user) {
      return res.send(apiResponse("OTP sent successfully."));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, {
        message: "Couldn't Add Mobile Number",
      });
    }
  });

  /**
   * Third Party Sign in
   */
  thirdPartySignIn = catchAsync(async (req, res) => {
    const { type_of_login, social_fname, social_lname, social_picture, email, uid} =
      req.body;

    let mds_id = nanoid(10); 
    // if type_of_login is 1 i.e facebook
    if (type_of_login == 1) {
      let queryOptions = {
        attributes: [
          "id",
          "first_name",
          "last_name",
          "profile_picture",
          "social_picture",
          "mds_id",
          "facebook_uid",
          "points",
          "is_active",
        ],
        where: {
          facebook_uid: uid,
          user_type:1,
        },
      };
      let userExists = await userService.findOne(queryOptions);
      if (userExists) {
        if (!userExists.is_active) {
          throw new ApiError(
            403,
            "User is made inactive by Admin"
          );
        }
        const tokens = await tokenService.generateAuthTokens(userExists);
        if (userExists.profile_picture) {
          if (userExists.profile_picture.startsWith("users/profile-photo/")) {
            userExists.profile_picture = await getObjectSignedUrl(
              userExists.profile_picture
            );
          }
        } else {
          userExists.profile_picture = userExists.social_picture;
          delete userExists.social_picture;
        }
        //log 0 points for signin in
        let requestBody= {
          user_id:userExists.id,
          point:0,
          points_type:0, // signin
        }
        await userPointsDailyServices.create(requestBody);
        
        res.send(apiResponse("User Already Exists", { userExists, ...tokens }));
      } else {
        let createUser = {
          first_name: social_fname,
          last_name: social_lname,
          social_fname: social_fname,
          social_lname: social_lname,
          social_picture: social_picture,
          facebook_uid: uid,
          email:email,
          mds_id: mds_id,
          user_type: 1,
        };
        const dbTxn = await model.sequelize.transaction();
        queryOptions = {
          transaction: dbTxn,
        };
        let user = await userService.create(createUser, queryOptions);
        if (!user) {
          await dbTxn.rollback();
          throw new ApiError(statusCodes.FORBIDDEN, "User can't be created");
        } else {
          await dbTxn.commit();

          let queryOptions = {
            where: {
              facebook_uid: uid,
            },
            attributes: [
              "id",
              "first_name",
              "last_name",
              ["social_picture", "profile_picture"],
              "mds_id",
              "facebook_uid",
              "email",
              "points",
              "is_active"
            ],
          };
          let createdUser = await userService.findOne(queryOptions);
          const tokens = await tokenService.generateAuthTokens(user);
          // add points to user_points_daily
          let requestBody= {
            user_id: createdUser.id,
            point:0,
            points_type:0, // signin
          }
          await userPointsDailyServices.create(requestBody);
          res.send(
            apiResponse("User Created Successfully", {
              ...createdUser,
              ...tokens,
            })
          );
        }
      }
    }

    // if type_of_login is 2 i.e google
    if (type_of_login == 2) {
      let queryOptions = {
        attributes: [
          "id",
          "first_name",
          "last_name",
          "profile_picture",
          "social_picture",
          "mds_id",
          "google_uid",
          "points",
          "is_active"
        ],
        where: {
          google_uid: uid,
          user_type:1,
        },
      };
      let userExists = await userService.findOne(queryOptions);
      if (userExists) {
        if (!userExists.is_active) {
          throw new ApiError(
            403,
            "User is made inactive by Admin"
          );
        }
        const tokens = await tokenService.generateAuthTokens(userExists);
        if (userExists.profile_picture != null && !userExists.profile_picture) {
          if (userExists.profile_picture.startsWith("users/profile-photo/")) {
            userExists.profile_picture = await getObjectSignedUrl(
              userExists.profile_picture
            );
          }
        } else {
          userExists.profile_picture = userExists.social_picture;
          delete userExists.social_picture;
        }
        //log 0 points for signin in
        let requestBody= {
          user_id: userExists.id,
          point:0,
          points_type:0, // signin
        }
        await userPointsDailyServices.create(requestBody);
        res.send(apiResponse("User Already Exists", { userExists, ...tokens }));
      } else {
        let createUser = {
          first_name: social_fname,
          last_name: social_lname,
          social_fname: social_fname,
          social_lname: social_lname,
          social_picture: social_picture,
          google_uid: uid,
          email: email,
          mds_id: mds_id,
          user_type: 1,
        };
        const dbTxn = await model.sequelize.transaction();
        queryOptions = {
          transaction: dbTxn,
        };
        let user = await userService.create(createUser, queryOptions);
        if (!user) {
          await dbTxn.rollback();
          throw new ApiError(statusCodes.BAD_REQUEST, "User can't be created");
        } else {
          await dbTxn.commit();

          let queryOptions = {
            where: {
              google_uid: uid,
            },
            attributes: [
              "id",
              "first_name",
              "last_name",
              ["social_picture", "profile_picture"],
              "mds_id",
              "email",
              "google_uid",
              "points",
              "is_active"
            ],
          };
          let createdUser = await userService.findOne(queryOptions);
          const tokens = await tokenService.generateAuthTokens(user);
          //log 0 points for signin in
        let requestBody= {
          user_id: createdUser.id,
          point:0,
          points_type:0, // signin
        }
        await userPointsDailyServices.create(requestBody);
          res.send(
            apiResponse("User Created Successfully", {
              ...createdUser,
              ...tokens,
            })
          );
        }
      }
    }

    // if type_of_login is 3 i.e apple
    if (type_of_login == 3) {
      let queryOptions = {
        attributes: [
          "id",
          "first_name",
          "last_name",
          "profile_picture",
          "social_picture",
          "mds_id",
          "apple_uid",
          "points",
          "is_active"
        ],
        where: {
          apple_uid: uid,
          user_type:1,

        },
      };
      let userExists = await userService.findOne(queryOptions);
      if (userExists) {
        if(!userExists.is_active){
          throw new ApiError(403, "User is made inactive by Admin");
      }
        const tokens = await tokenService.generateAuthTokens(userExists);
        if (userExists.profile_picture != null && !userExists.profile_picture) {
          if (userExists.profile_picture.startsWith("users/profile-photo/")) {
            userExists.profile_picture = await getObjectSignedUrl(
              userExists.profile_picture
            );
          }
        } else {
          userExists.profile_picture = userExists.social_picture;
          delete userExists.social_picture;
        }
        //log 0 points for signin in
        let requestBody= {
          user_id: userExists.id,
          point:0,
          points_type:0, // signin
        }
        await userPointsDailyServices.create(requestBody);
        res.send(apiResponse("User Already Exists", { userExists, ...tokens }));
      } else {
        let createUser = {
          first_name: social_fname,
          last_name: social_lname,
          social_fname: social_fname,
          social_lname: social_lname,
          social_picture: social_picture,
          apple_uid: uid,
          mds_id: mds_id,
          user_type: 1,
        };
        const dbTxn = await model.sequelize.transaction();
        queryOptions = {
          transaction: dbTxn,
        };
        let user = await userService.create(createUser, queryOptions);
        if (!user) {
          await dbTxn.rollback();
          throw new ApiError(statusCodes.BAD_REQUEST, "User can't be created");
        } else {
          await dbTxn.commit();

          let queryOptions = {
            where: {
              apple_uid: uid,
            },
            attributes: [
              "id",
              "first_name",
              "last_name",
              ["social_picture", "profile_picture"],
              "mds_id",
              "apple_uid",
              "points",
              "is_active"
            ],
          };
          let createdUser = await userService.findOne(queryOptions);
          const tokens = await tokenService.generateAuthTokens(user);
          //log 0 points for signin in
        let requestBody= {
          user_id: createdUser.id,
          point:0,
          points_type:0, // signin
        }
        await userPointsDailyServices.create(requestBody);
          res.send(
            apiResponse("User Created Successfully", {
              ...createdUser,
              ...tokens,
            })
          );
        }
      }
    }
  });

  /**
   * Verify OTP
   */
  verifyOtp = catchAsync(async (req, res) => {
    const { otp } = req.body;
    let requestBody, queryOptions;
    // check if user exists or not
    queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "profile_picture",
        "mds_id",
        "points",
        "is_phone_verified",
        "is_active"
      ],
      where: {
        id: req.userData.id,
        is_active: true,
      },
    };

    let user = await userService.findOne(queryOptions);

    if (!user) {
      throw new ApiError(404, "User not found");
    }
    // delete password key
    // delete user.password;
    // Fetch user's email otp for verification
    queryOptions = {
      where: {
        user_id: req.userData.id,
      },
      order: [["updated_at", "DESC"]],
    };

    let otpData = await otpService.getOTP(queryOptions);
    if (!otpData || otpData.otp != otp) {
      throw new ApiError(statusCodes.CONFLICT, "Invalid OTP");
    } 
    const tokens = await tokenService.generateAuthTokens(user);
    if (user.profile_picture) {
    let pic = await getObjectSignedUrl(user.profile_picture);
      user.profile_picture = pic;
    }
    if(user.is_phone_verified){
      //log 0 points for signin in
      requestBody= {
        user_id: user.id,
        point:0,
        points_type:0, // signin
      }
      await userPointsDailyServices.create(requestBody);
      return res.send(apiResponse("User Already Exists", { user, tokens }))
    }
    requestBody={
      is_phone_verified:true,
    }
    queryOptions={
      where:{
        id:req.userData.id,
        mobile_number:req.userData.mobile_number,
      }
    }
    //verify phone number
    await userService.update(requestBody, queryOptions)
    queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "profile_picture",
        "mds_id",
        "points",
        "is_phone_verified",
      ],
      where: {
        id: req.userData.id,
        is_active: true,
      },
    };

    user = await userService.findOne(queryOptions);
    //log 0 points for signin in
    requestBody= {
      user_id:req.userData.id,
      point:0,
      points_type:0, // signin
    }
    await userPointsDailyServices.create(requestBody);
    res.send(apiResponse("Logged In successfully.", { user, tokens }));
  
  });

    /**
   * Verify OTP and phone number
   */

  verifyPhoneNumber = catchAsync(async (req, res) => {
    const { otp } = req.body;
    let requestBody, queryOptions;
    // check if user exists or not
    queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "profile_picture",
        "mds_id",
        "points",
        "is_phone_verified",
        "is_active"
      ],
      where: {
        id: req.userData.id,
        is_active: true,
      },
    };

    let user = await userService.findOne(queryOptions);

    if (!user) {
      throw new ApiError(statusCodes.BAD_REQUEST, "User not found");
    }
    // delete password key
    // delete user.password;
    // Fetch user's email otp for verification
    queryOptions = {
      where: {
        user_id: req.userData.id,
      },
      order: [["updated_at", "DESC"]],
    };

    let otpData = await otpService.getOTP(queryOptions);
    if (!otpData || otpData.otp != otp) {
      throw new ApiError(statusCodes.CONFLICT, "Invalid OTP");
    } 
    if (user.profile_picture) {
    let pic = await getObjectSignedUrl(user.profile_picture);
      user.profile_picture = pic;
    }
    if(user.is_phone_verified){
      return res.send(apiResponse("phone number verified", { user}))
    }
    requestBody={
      is_phone_verified:true,
    }
    queryOptions={
      where:{
        id:req.userData.id,
        mobile_number:req.userData.mobile_number,
      }
    }
    //verify phone number
    await userService.update(requestBody, queryOptions)
    queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "profile_picture",
        "email",
        "mds_id",
        "points",
        "is_phone_verified",
      ],
      where: {
        id: req.userData.id,
        is_active: true,
      },
    };

    user = await userService.findOne(queryOptions);
    res.send(apiResponse("phone number verified", { user}));
  
  });


  // temporary controller
  showOtp = catchAsync(async (req, res) => {
    // check if user exists or not
    // let id  = req.userData.id;

    let queryOptions = {
      order: [["updated_at", "DESC"]],
    };
    let user = await otpService.getOTP(queryOptions);

    if (!user) {
      throw new ApiError(statusCodes.BAD_REQUEST, "User not found");
    } else {
      res.send(apiResponse(" Hence OTP", user.otp));
    }
  });
  /**
   * Log out
   */
  logOut = catchAsync(async (req, res) => {
    let id = req.userData.id;
    let queryOptions = {
      where: {
        user_id: id,
      },
    };
    await tokenService.destroy(queryOptions);
    res.send(apiResponse("Logged out successfully"));
  });
}
module.exports = new AuthController();
