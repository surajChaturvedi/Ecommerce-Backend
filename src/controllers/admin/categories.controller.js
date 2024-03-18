/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
const { Sequelize } = require("../../models/index");
const { Op } = require("sequelize");
let {
  categoryService,
  preferenceCategoryService,
  categoryMediaService,
  preferenceCategoryMediaService,
} = require("../../services");
const model = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");

class AdminCategoriesController {
  /**
   * Get All Categories
   */
  categoryList = catchAsync(async (req, res) => {
    let { offset, limit, search, order_by, order_type } = req.query;
    let queryOptions = {
      subQuery: false,

      attributes: [
        ["id", "category_id"], ["title", "category_title"],
        [Sequelize.literal('"preference_category->preference"."id"'),"preference_id"],
        [Sequelize.literal('"preference_category->preference"."title"'),"preference_name"],
        [Sequelize.fn("COUNT", Sequelize.fn("DISTINCT", Sequelize.literal('"category_media"."category_id"'))), "media_count"],
        
      ],
      include: [
        {
          model: model.category_media,          
           attributes:[],
          include: [
            {
              model: model.media,
              attributes: []
            }
          ],
        },
        {   
          model: model.preference_categories,
          attributes: [],
          include: [      
            {
              model: model.preferences,
              attributes: [],
            }
          ]
        },
      ],
      group: ['"category_media"."category_id"', "categories.id", "preference_category->preference.id"], 
    };

    order_by = parseInt(order_by, 10);
    order_type = parseInt(order_type, 10);

    if(order_by == 1) {//name
      queryOptions.order = [['title', order_type ? 'DESC' : 'ASC']];
    }     
    if(order_by == 2) {//preference name
      queryOptions.order = [['preference_name', order_type ? 'DESC' : 'ASC']];
    }

    if(!order_by) {
      queryOptions.order = [['created_at', 'DESC']];
    }
    if (search?.length > 0) {
      queryOptions.where = {title: {[Op.iLike]: `%${search}%`},
      };
    }

    let findCategories = await categoryService.findAll(queryOptions);

    // findCategories.forEach((item)=>{
    //   let count=0;
    //   item?.preference_category?.category_media?.forEach((item1)=> {
    //     count+=1
    //   })
    //   item.media_count = count
    //   item.category_media = item?.preference_category?.category_media
    //   delete item.preference_category
    // })

    if(order_by == 3){
      if(order_type == 0){
        findCategories.sort(function(a, b){ if(a.media_count<b.media_count){ return -1;}});
      }else{
        findCategories.sort(function(a, b){ if(a.media_count>b.media_count){ return -1;}});
      }
    }

    let originalLength = findCategories.length
    if(offset > originalLength){
      offset = 0;
    }
    let findCategory = findCategories.slice(parseInt(offset),parseInt(limit)+parseInt(offset));

    delete queryOptions.attributes;
    delete queryOptions.group;
    queryOptions.distinct = true;
    let findCategoriesCount = await categoryService.count(queryOptions);

    if (findCategories) {
      res.send(
        apiResponse("Categories fetched successfully", { count: findCategoriesCount, rows: findCategory }));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch Categories");
    }
  });

  /**
   * Create Category
   */
  addCategory = catchAsync(async (req, res) => {
    const {title} = req.body;
    let queryOptions = {
      where: {
        title: {
          [Op.iLike]: `%${title}%`,
        },
      },
    };
    let categoryExists = await categoryService.findAll(queryOptions);
    if (categoryExists?.length > 0) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Category Already exists");
    }
    const dbTxn = await model.sequelize.transaction();
      let requestBody = {
        title: title,
        is_idle:true
      };
      queryOptions = {
        transaction: dbTxn,
      }
      let newCategory = await categoryService.create(requestBody,queryOptions);
      if (!newCategory) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Category could not be created");
      };
    await dbTxn.commit();
    res.send(apiResponse("Category created successfully", [], 200, true));
  });

  editCategory = catchAsync(async (req, res) => {
    let { category_title, category_id} = req.body;
    let requestBody;

    let queryOptions = {
      where: {
        id: category_id
      },
    };

    const findCategory = await categoryService.findOne(queryOptions);
    if (!findCategory) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Category not found");
    };

    const dbTxn = await model.sequelize.transaction();

    if(findCategory?.title != category_title) {
      requestBody = {
        title: category_title
      };
      let queryOptions = {
        where: {
          id: category_id
        },
        transaction: dbTxn,
      };
      const updateCategoryTitle = await categoryService.update(requestBody, queryOptions);
      if (!updateCategoryTitle) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Category title could not be updated");
      };
    };


  await dbTxn.commit();
  res.send(apiResponse("Category edited successfully"));

  });

  deleteCategory = catchAsync(async (req, res) => {
    let { category_id } = req.query;
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        id: category_id,
      },
      transaction: dbTxn,
    };
    let deleteCategory = await categoryService.destroy(queryOptions);
     queryOptions = {
      where: {
        category_id: category_id,
      },
      transaction: dbTxn,
    };
    let deleteCategoryMedia = await categoryMediaService.destroy(queryOptions);

    let deletepreferenceCategory = await preferenceCategoryService.destroy(queryOptions);

    // let deletepreferenceCategoryMedia = await preferenceCategoryMediaService.destroy(queryOptions);

    if (!deleteCategory && !deleteCategoryMedia && !deletepreferenceCategory && !deletepreferenceCategoryMedia) {
      await dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not delete category");
    }
      await dbTxn.commit();
      res.send(apiResponse("Category deleted successfully"));
  });
}

module.exports = new AdminCategoriesController();
