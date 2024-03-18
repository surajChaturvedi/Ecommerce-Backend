/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const passwordHashing = require("../../utils/password-hashing");
let { userService, otpService, tokenService } = require("../../services");
const model = require("../../models/index");
const { nanoid } = require("nanoid");
const sendOTPVerificationEmail = require("../../utils/node-mailer");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");
const { Op } = require("sequelize");
const { Sequelize } = require("../../models/index");
const { getObjectSignedUrl } = require("../../utils/s3");
const { error } = require("winston");
const Api = require("twilio/lib/rest/Api");
const httpStatus = require("http-status");

class AdminUsersController {
  /**
   * Get All Users
   */
  userList = catchAsync(async (req, res) => {
    let { search, limit, offset, order_type, order_by } = req.query;

    limit = limit || 10;
    offset = offset || 0;
    let queryOptions = {
      attributes: [
        ["id", "user_id"],
        "first_name",
        "last_name",
        "mds_id",
        "email",
        "mobile_number",
        "user_type",
        "is_active",
      ],
      where: {
        id: { [Op.not]: req.userData.id },
      },
      offset: offset,
      limit: limit,
      order: [["updated_at", "DESC"]],
    };

    // searching
    if (search?.length > 0) {
      Object.assign(queryOptions.where, {
        [Op.or]: [
          Sequelize.where(
            Sequelize.fn(
              "concat",
              Sequelize.col("first_name"),
              " ",
              Sequelize.col("last_name")
            ),
            {
              [Op.iLike]: `%${search}%`,
            }
          ),
          Sequelize.where(
            Sequelize.fn(
              "concat",
              Sequelize.col("last_name"),
              " ",
              Sequelize.col("first_name")
            ),
            {
              [Op.iLike]: `%${search}%`,
            }
          ),
          Sequelize.where(
            Sequelize.fn(
              "concat",
              Sequelize.col("first_name"),
              "",
              Sequelize.col("last_name")
            ),
            {
              [Op.iLike]: `%${search}%`,
            }
          ),
          Sequelize.where(
            Sequelize.fn(
              "concat",
              Sequelize.col("last_name"),
              "",
              Sequelize.col("first_name")
            ),
            {
              [Op.iLike]: `%${search}%`,
            }
          ),
          Sequelize.where(Sequelize.col("email"), {
            [Op.iLike]: `%${search}%`,
          }),
          Sequelize.where(Sequelize.col("mobile_number"), {
            [Op.iLike]: `%${search}%`,
          }),
        ],
      });
    }
    // sorting on user_id, first_name, last_name, email
    order_by = parseInt(order_by, 10);
    order_type = parseInt(order_type, 10);

    if(order_by == 1) {//first_name 
      queryOptions.order = [['first_name', order_type ? 'DESC' : 'ASC']]; 
    }
    if(order_by == 2) {//mds_id
      queryOptions.order = [['mds_id', order_type ? 'DESC' : 'ASC']];
    }
    if(order_by == 3) {//mobile_number
        queryOptions.order = [['mobile_number', order_type ? 'DESC' : 'ASC']];
      }
      if(order_by == 4) {//email
        queryOptions.order = [['email', order_type ? 'DESC' : 'ASC']]; 
      }
      if(order_by == 5) {//user_type
        queryOptions.order = [['user_type', order_type ? 'DESC' : 'ASC']];
      }
      if(order_by == 6) {//is_active
          queryOptions.order = [['is_active', order_type ? 'DESC' : 'ASC']];
        }
    
    let users = await userService.findAndCountAll(queryOptions);
    if (users) {
      res.send(apiResponse("Users fetched successfully", users));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch users");
    }
  });

  /**
   * Update User Status
   */
  userUpdateStatus = catchAsync(async (req, res) => {
    let { user_id, is_active } = req.query;
    let requestBody = {
      is_active: is_active,
    };
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        id: user_id,
      },
      transaction: dbTxn,
    };
    let user = await userService.update(requestBody, queryOptions);
    if (user) {
      await dbTxn.commit();
      res.send(apiResponse("User status updated successfully", [], 200, true));
    } else {
      await dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "User status could not be updated"
      );
    }
  });

  /**
   * Add New Admin
   */
  addAdmin = catchAsync(async (req, res) => {
    const { first_name, last_name, email, mobile_number } = req.body;
    let queryOptions = {
      where: {
        email: email,
      },
    };
    let user = await userService.findOne(queryOptions);
    if (user) {
      throw new ApiError(statusCodes.BAD_REQUEST, "User Already Exists");
    }
    const dbTxn = await model.sequelize.transaction();
    let mds_id = nanoid(10);
    let requestBody = {
      first_name: first_name,
      last_name: last_name,
      email: email,
      mobile_number: mobile_number,
      user_type: 2,
      mds_id: mds_id,
    };
    const newUser = await userService.create(requestBody, queryOptions);
    if (!newUser) {
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "User could not be created");
    }
    dbTxn.commit();
    res.send(apiResponse("User created successfully", newUser));
  });

  /**
   * Edit User
   */
  editUser = catchAsync(async (req, res) => {
    const { user_id, first_name, last_name, email, mobile_number } = req.body;
    let requestBody = {
      user_id: user_id,
      first_name: first_name,
      last_name: last_name,
      email: email,
      mobile_number: mobile_number,
    };
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        id: user_id,
      },
      transaction: dbTxn,
    };
    let user = await userService.update(requestBody, queryOptions);
    if (user) {
      dbTxn.commit();
      res.send(apiResponse("User updated successfully", [], 200, true));
    } else {
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "User could not be updated");
    }
  });

  /**
   * Delete User
   */
  userDelete = catchAsync(async (req, res) => {
    let { user_id } = req.query;
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        id: user_id,
      },
      transaction: dbTxn,
    };
    let user = await userService.destroy(queryOptions);
    if (user) {
      if(user.profile_picture){
        // delete user's picture from s3
      let deletefromS3 = await deleteS3Object(user.profile_picture);
      }
      dbTxn.commit();
      res.send(apiResponse("User deleted successfully", [], 200, true));
    } else {
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "User could not be deleted");
    }
  });

  /**
   * Get Admin's Details
   */
  getAdminProfile = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "email",
        "profile_picture",
      ],
      where: {
        id: req.userData.id,
      },
    };
    let admin = await userService.findOne(queryOptions);
    if (admin.profile_picture) {
      let pic = await getObjectSignedUrl(admin.profile_picture);
      console.log("pic", pic);
      admin.profile_picture = pic;
    }
    if (admin) {
      res.send(apiResponse("Admin's Detail", admin, 200, true));
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Admin's Detail Could not be fetched"
      );
    }
  });

  /**
   * Get Admin's Profile
   */
  editAdminProfile = catchAsync(async (req, res) => {
    let { first_name, last_name, email, mobile_number } = req.body;
    let dbTxn, queryOptions, requestBody;
    dbTxn = await model.sequelize.transaction();
    queryOptions = {
      where: {
        id: req.userData.id,
      },
      transaction: dbTxn,
    };
    requestBody = {
      first_name: first_name,
      last_name: last_name,
      email: email,
      mobile_number: mobile_number,
    };
    let updateAdminDetail = await userService.update(requestBody, queryOptions);
    if (updateAdminDetail) {
      await dbTxn.commit();
      res.send(apiResponse("Profile Data has been updated", [], 200, true));
    } else {
      await dbTxn.rollback();
      throw new ApiError(httpStatus.BAD_REQUEST, "Data couldn't be updated");
    }
  });

  changeUserStatus = catchAsync(async (req, res) => {
   let {user_id,is_active} = req.query   
   let dbTxn = await model.sequelize.transaction();
   let Inactive = 0
    if(is_active == 'false'){
    let queryOptions = {
      where: {
        user_id: user_id,
      },
      transaction: dbTxn,
    };
     await tokenService.destroy(queryOptions);   
     Inactive = 1
    }
  let requestBody = {
    is_active: is_active,
  };
   let queryOptions = {
      where: {
        id: user_id,
      },
      transaction: dbTxn,
    }; 
   let statusUpdate= await userService.update(requestBody, queryOptions);
   if(!statusUpdate)
   {
    await dbTxn.rollback();
    res.send(apiResponse("User status cant be updated"));
   }
   if(Inactive==1){
    dbTxn.commit();
    res.send(apiResponse("Inactive User"));
    }
    if(Inactive == 0)
    {
      dbTxn.commit();
      res.send(apiResponse("User activated"));
    }
  });
}

module.exports = new AdminUsersController();
