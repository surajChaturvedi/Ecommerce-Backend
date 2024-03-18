/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const { Sequelize } = require("../../models/index");
let {
  putProfilePhotoObject,
  putPreferencePhotoObject,
  getObjectSignedUrl,
} = require("../../utils/s3");
const { Op } = require("sequelize");
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
  preferenceMediaService,
} = require("../../services");
const model = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");
const axios = require("axios");

class AdminPreferenceController {
  /**
   * Get All Preferences
   */
  preferenceList = catchAsync(async (req, res) => {
    let { offset, limit, search, order_by, order_type } = req.query;
    let queryOptions = {
      subQuery: false,
      attributes: [
        "id",
        ["title", "preference_title"],
        "is_active",
        "logo",
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.fn(
              "DISTINCT",
              Sequelize.literal('"preference_media"."id"')
            )
          ),
          "media_count",
        ],
      ],
      include: [
        {
          model: model.preference_categories,
          separate: true,
          attributes: [
            [Sequelize.literal('"category"."title"'), "category_title"],
            [Sequelize.literal('"category"."id"'), "category_id"],
          ],
          include: [
            {
              model: model.categories,
              attributes: [],
            },
            // {
            //   model: model.preference_media,
            //   attributes: [
            //     [
            //       Sequelize.literal('"preference_media->medium"."title"'),
            //       "media_title",
            //     ],
            //   ],
            //   include: [
            //     {
            //       model: model.media,
            //       attributes: [],
            //     },
            //   ],
            // },
          ],
        },
        {
          model: model.preference_media,
          attributes: [],
        },
      ],
      group: ['"preferences"."id"'],
    };

    order_by = parseInt(order_by, 10);
    order_type = parseInt(order_type, 10);

    if (order_by == 1) {
      //name
      queryOptions.order = [["title", order_type ? "DESC" : "ASC"]];
    }

    if (order_by == 2) {
      //is_active
      queryOptions.order = [["is_active", order_type ? "DESC" : "ASC"]];
    }

    if (!order_by) {
      queryOptions.order = [["created_at", "DESC"]];
    }
    if (search?.length > 0) {
      queryOptions.where = { title: { [Op.iLike]: `%${search}%` } };
    }

    let findPreferences = await preferenceService.findAll(queryOptions);

    findPreferences.forEach(async (item) => {
      // let preference_media = [];
      // let preference_categories = [];
      if (item.logo) {
        let logo = await getObjectSignedUrl(item.logo);
        item.logo = logo;
      }
      // let count = 0;
      // item.preference_categories.forEach((item1) => {
      //   item1.preference_media.forEach((item2) => {
      //     count += 1;
      //   });
      //   preference_media.push(...item1.preference_media);
      //   let category_object = {};
      //   category_object.category_title = item1.category_title;
      //   category_object.category_id = item1.category_id;
      //   preference_categories.push(category_object);
      // });
      // item.preference_media = preference_media;
      // item.preference_category = preference_categories;
      // delete item.preference_categories;
      // item.media_count = count;
    });

    if (order_by == 3) {
      if (order_type == 0) {
        findPreferences.sort(function (a, b) {
          if (a.media_count < b.media_count) {
            return -1;
          }
        });
      } else {
        findPreferences.sort(function (a, b) {
          if (a.media_count > b.media_count) {
            return -1;
          }
        });
      }
    }

    let originalLength = findPreferences.length;
    if (offset > originalLength) {
      offset = 0;
    }
    let findPreference = findPreferences.slice(
      parseInt(offset),
      parseInt(limit) + parseInt(offset)
    );

    delete queryOptions.attributes;
    delete queryOptions.limit;
    delete queryOptions.offset;
    delete queryOptions.group;
    queryOptions.distinct = true;
    let findPreferencesCount = await preferenceService.count(queryOptions);

    if (findPreference) {
      res.send(
        apiResponse("Preferences fetched successfully", {
          count: findPreferencesCount,
          rows: findPreference,
        })
      );
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Could not fetch preferences"
      );
    }
  });

  /**
   * Upload Preference Image
   */

  uploadPreferenceImage = catchAsync(async (req, res) => {
    let { preference_title } = req.body;

    let queryOptions = {
      where: {
        title: {
          [Op.iLike]: `%${preference_title}%`,
        },
      },
    };
    let prefrenceExists = await preferenceService.findOne(queryOptions);
    let file = req.file;
    if (file.mimetype != "image/svg+xml") {
      throw new ApiError(statusCodes.BAD_REQUEST, "Only SVG File is allowed");
    }
    let fileData = file.buffer;

    let filename = `${preference_title}.svg`;
    let s3DestinationUrl = await putPreferencePhotoObject(
      filename,
      "image/svg+xml image/png image/jpeg"
    );
    await axios.put(s3DestinationUrl, fileData, {
      headers: { "Content-Type": "image/svg+xml" },
    });
    let Key = `preference-list-logo/${filename}`;
    const dbTxn = await model.sequelize.transaction();
    let requestBody = {
      logo: Key,
    };
    queryOptions = {
      where: {
        title: preference_title,
      },
      transaction: dbTxn,
    };
    //save key to database
    if (prefrenceExists) {
      let updatePreference = await preferenceService.update(
        requestBody,
        queryOptions
      );
      if (updatePreference.length == 0) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference image could not be uploaded"
        );
      }
    } else {
      queryOptions = {
        transaction: dbTxn,
      };
      requestBody = {
        title: preference_title,
        logo: Key,
        is_active:false,
      };
      let createPreferenceImage = await preferenceService.create(
        requestBody,
        queryOptions
      );
      if (!createPreferenceImage) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference image could not be uploaded"
        );
      }
    }
    await dbTxn.commit();
    queryOptions = {
      where: {
        title: {
          [Op.iLike]: `%${preference_title}%`,
        },
      },
    };
    prefrenceExists = await preferenceService.findOne(queryOptions);
    let photoUrl = await getObjectSignedUrl(Key);
    res.send(
      apiResponse(
        "Photo Uploaded",
        { photoUrl: photoUrl, prefrence_id: prefrenceExists.id },
        200,
        true
      )
    );
  });
  /**
   * Add New Preference
   */
  addPreference = catchAsync(async (req, res) => {
    const { preference_id, is_preference_image_uploaded, category_ids } =
      req.body;
    // const category_ids
    if (is_preference_image_uploaded == "") {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Please Upload Preference Image first"
      );
    }
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      attributes: ["id"],
      where: {
        preference_id: preference_id,
      },
    };
    let preferenceCategory = await preferenceCategoryService.findOne(
      queryOptions
    );
    if (preferenceCategory) {
      queryOptions = {
        where: {
          preference_id: preference_id,
        },
        transaction: dbTxn,
      };
      let deletePreference = await preferenceCategoryService.destroy(
        queryOptions
      );
      if (!deletePreference) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference could not be deleted"
        );
      }
    }

    queryOptions = {
      transaction: dbTxn,
    };
    let requestBody = [];
    if (category_ids?.length > 0) {
      requestBody = category_ids.map((item) => {
        return {
          preference_id: preference_id,
          category_id: item,
        };
      });
    }
    let createPreferenceCategory = await preferenceCategoryService.bulkCreate(
      requestBody,
      queryOptions
    );

    // mark used Categories is_idle false
    requestBody = {
      is_idle: false,
    };

    queryOptions = {
      where: {
        id: category_ids,
      },
      transaction: dbTxn,
    };
    await categoryService.update(requestBody, queryOptions);

    if (!createPreferenceCategory) {
      await dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Preference could not be created"
      );
    }
    await dbTxn.commit();
    res.send(apiResponse("Preference created successfully", [], 200, true));
  });

  /**
   * Edit Preference
   */
  editPreference = catchAsync(async (req, res) => {
    let { preference_id, preference_title, category_ids } = req.body;
    let requestBody;
    let queryOptions = {
      where: {
        id: preference_id,
      },
    };
    let findPreference = await preferenceService.findOne(queryOptions);
    if (!findPreference) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Preference not found");
    }
    const dbTxn = await model.sequelize.transaction();

    queryOptions = {
      attributes: ["id", "category_id"],
      where: {
        preference_id: preference_id,
      },
    };
    // find the preference category
    let preferenceCategory = await preferenceCategoryService.findAll(
      queryOptions
    );

    for (let i = 0; i < preferenceCategory.length; i++) {
      queryOptions = {
        where: {
          id: preferenceCategory[i].category_id,
        },
        transaction: dbTxn,
      };
     requestBody = {
        is_idle: true,
      };
      let is_idleCategory = await categoryService.update(
        requestBody,
        queryOptions
      );
      if (!is_idleCategory) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference could not be deleted"
        );
      }
    }

    if (preferenceCategory.length != 0) {
      queryOptions = {
        where: {
          preference_id: preference_id,
        },
        transaction: dbTxn,
      };

      let deletePreference = await preferenceCategoryService.destroy(
        queryOptions
      );
      if (!deletePreference) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference could not be edited"
        );
      }
    }

    //update the title
     requestBody = {
      title: preference_title,
    };
    queryOptions = {
      where: {
        id: preference_id,
      },
      transaction: dbTxn,
    };
    let newpreference = await preferenceService.update(
      requestBody,
      queryOptions
    );
    if (!newpreference) {
      await dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Preference could not be Updated"
      );
    }

    //updating new category in preference
    requestBody = [];
    category_ids.forEach((id) => {
      requestBody.push({
        preference_id: preference_id,
        category_id: id,
      });
    });

    queryOptions = {
      transaction: dbTxn,
    };
    let updatePreference = await preferenceCategoryService.bulkCreate(
      requestBody,
      queryOptions
    );
    if (!updatePreference) {
      await dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Preference could not be updated"
      );
    }

    //mark categories as not idle
    requestBody = {
      is_idle: false,
    };
    queryOptions = {
      where: {
        id: category_ids,
      },
      transaction: dbTxn,
    };
    await categoryService.update(requestBody, queryOptions);

    await dbTxn.commit();
    res.send(apiResponse("Preference edit successfully", [], 200, true));
  });

  /**
   * delete Preference
   */
  deletePreference = catchAsync(async (req, res) => {
    let { preference_id } = req.query;
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        id: preference_id,
      },
      transaction: dbTxn,
    };
    let deletePreference = await preferenceService.destroy(queryOptions);
    queryOptions = {
      where: {
        preference_id: preference_id,
      },
      transaction: dbTxn,
    };
    let deletePreferenceCategory = await preferenceCategoryService.destroy(
      queryOptions
    );
    queryOptions = {
      where: {
        preference_id: preference_id,
      },
      transaction: dbTxn,
    };
    let deletePreferenceMedia = await preferenceMediaService.destroy(
      queryOptions
    );
    if (deletePreference || deletePreferenceCategory || deletePreferenceMedia) {
      await dbTxn.commit();
      res.send(apiResponse("Preference deleted successfully", [], 200, true));
    } else {
      await dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Preference could not be deleted"
      );
    }
  });

  preferenceStatus = catchAsync(async (req, res) => {
    let { preference_id, is_active } = req.query;
    let queryOptions = {
      where: {
        id: preference_id,
      },
    };
    let preference = await preferenceService.findOne(queryOptions);
    if (preference) {
      let requestBody = {
        is_active: is_active,
      };
      const dbTxn = await model.sequelize.transaction();
      queryOptions = {
        where: {
          id: preference_id,
        },
        transaction: dbTxn,
      };
      let preferenceUpdate = await preferenceService.update(
        requestBody,
        queryOptions
      );
      if (preferenceUpdate[0] != 0) {
        await dbTxn.commit();
        res.send(apiResponse("preference status updated successfully"));
      } else {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "preference status could not be updated "
        );
      }
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "preference doesn't exist");
    }
  });
}

module.exports = new AdminPreferenceController();
