/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const courseServices = require("../../services/course.services");
const { Sequelize } = require("../../models/index");
const {
  AdminCategoriesController,
} = require("./categories.controller");
let {
  userService,
  mediaService,
  userPreferenceService,
  preferenceService,
  categoryService,
  preferenceCategoryService,
  tokenService
} = require("../../services");
const model = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");
const { Op } = require("sequelize");
const { getObjectSignedUrl } = require("../../utils/s3");

class AdminCommonController {
  /**
   * All Preferences
   */
  allPreferences = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: ["id", "title", "logo"],
      order: [["id", "ASC"]],
    };
    let list = await preferenceService.findAll(queryOptions);
    for (let item of list) {
      let theurl = await getObjectSignedUrl(item.logo);
      item.logo = theurl;
    }
    if (list) {
      res.send(apiResponse("Preferences fetched successfully", list));
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Could not fetch preferences"
      );
    }
  });

  /**
   * All Categories
   */
  allCategories = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: ["id", "title"],
      order: [["id", "ASC"]],
    };
    let list = await categoryService.findAll(queryOptions);
    if (list) {
      res.send(apiResponse("Categories fetched successfully", list));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch categories");
    }
  });

  /**
   * idle Categories
   */
  idleCategories = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: ["id", "title"],
      where: {
        is_idle: true,
      },
      order: [["id", "ASC"]],
    };
    let list = await categoryService.findAll(queryOptions);
    if (list) {
      res.send(apiResponse("Categories fetched successfully", list));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch categories");
    }
  })

  allCourses = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: [
        "id",
        "name",
        "author",
        "is_free",
        "is_active",
        "description",
      ],
      order: [["id", "ASC"]],
    };
    let list = await courseServices.findAll(queryOptions);
    if (list) {
      res.send(apiResponse("Course fetched successfully", list));
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Course not fetch categories"
      );
    }
  });

  categoriesInPreference = catchAsync(async (req, res) => {
    let { preference_id } = req.query;
    let queryOptions = {
      subQuery: false,
      attributes: ["id",
    ],
      where: {
        id: preference_id,
      },
      include: [
        {
          model: model.preference_categories,
          attributes: [
            [Sequelize.literal('"preference_categories->category"."id"'), "category_id"],
            [Sequelize.literal('"preference_categories->category"."title"'), "category_title"]
          ],
          include: [
            {
              model: model.categories,
            },
          ],
        },
      ],
    };
    let findCategories = await preferenceService.findAll(queryOptions);
    if (!findCategories) {
      throw new ApiError(statusCodes.BAD_REQUEST, "categories not found");
    } else if (findCategories) {
      res.send(apiResponse("categories", findCategories, 200, true));
    }
  });
  }

module.exports = new AdminCommonController();
