/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
let {
  userService,
  userPreferenceService,
  preferenceService,
} = require("../../services");
const fs = require("fs");
const path = require("path");
const httpStatus = require("http-status");
const model = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { query } = require("express");
const { getObjectSignedUrl } = require("./../../utils/s3")
const { saveUserActivity } = require("../../utils/helperFunctions");
const { findAll } = require("../../services/user.services");


/**
 * What's on your mind?
 */
class OnboardingController {
  /**
   *  updates user's preferences
   */
  userPreference = catchAsync(async (req, res) => {
    let { preference_id } = req.body;
    let queryOptions, requestBody, existingUserPreferences;

    //find existing user_preferences
    queryOptions = {
      where: {
        user_id: req.userData.id,
      }
      }
    existingUserPreferences = await userPreferenceService.findAll(queryOptions);

    let existingPreferenceIds = existingUserPreferences.map(item => item.preference_id);
    let newPreferenceIds = preference_id.filter((item) => !existingPreferenceIds.includes(item));
    
      queryOptions = { 
        where: { 
          preference_id,
          user_id: req.userData.id
        },
        updateOnDuplicate: ["is_selected"]
      }      
      requestBody = []
      
      existingUserPreferences.forEach((Item)=>{
        let isExist = preference_id.find((item)=> item == Item.preference_id)
        if(isExist){
          requestBody.push({
            id: Item.id,
            is_selected: true,
            user_id: req.userData.id
          })
        }
        else{
          requestBody.push({
            id: Item.id,
            is_selected: false,
            user_id: req.userData.id
          })
        }        
      });
      if(newPreferenceIds) {
        newPreferenceIds.map((item)=> {
          requestBody.push({
            user_id: req.userData.id,
            preference_id: item,
            is_selected: true
          })
        })
      }
      let updateExistingPreferences = await userPreferenceService.bulkCreate(requestBody,queryOptions);
      res.send(apiResponse("Preference Updated Successfully", [], 200, true));
  });
    
  /**
   * Updates user's experience level
   */
  userExperience = catchAsync(async (req, res) => {
    let { experience_level } = req.body;
    let dbtxn = await model.sequelize.transaction();
    let requestBody = {
      experience_level: experience_level,
    };
    let queryOptions = {
      where: {
        mds_id: req.userData.mds_id,
        is_active : true,
      },
    };
    let updateExperience = await userService.update(requestBody, queryOptions);
    if (updateExperience[0]) {
      await dbtxn.commit();
      res.send(apiResponse("User Experience Saved", [], 200, true));
    } else {
      await dbtxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Experience could not be updated"
      );
    }
  });

  /**
   * Updates user's touchpoint
   */
  userTouchpoint = catchAsync(async (req, res) => {
    let dbtxn = await model.sequelize.transaction();
    let { touchpoint } = req.body;
    let requestBody = {
        touchpoint: touchpoint,
      };
    let queryOptions = {
      where: {
        mds_id: req.userData.mds_id,
        is_active : true,
      },
    };
   
   let updateTouchpoint = await userService.update(requestBody, queryOptions);
    if(updateTouchpoint[0]){
        await dbtxn.commit();
        res.send(apiResponse("User Touchpoint Saved", [], 200, true));
      }else{
        await dbtxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Touchpoint could not be updated");
      }
  });

  /**
   * Fetches the complete Preference List
   */
  PreferenceList = catchAsync(async (req, res) => {
    let queryOptions = {
      attributes: ["id", "title", "logo"],
      order: [
        ['id', 'ASC'],
      ],
      where:{
        is_active:true
      }
    };
    let list = await preferenceService.findAll(queryOptions);
    // let preference_list = [
    //   "AngerManagement",
    //   "BeingMoreActive",
    //   "Happiness",
    //   "ManagingAnxiety&Stress",
    //   "RelaxingMusic",
    //   "SleepingBetter",
    //   "StayingFocused",
    // ];
    // for (let i = 0; i < 7; i++) {
    //   const contents = fs.readFileSync(
    //     path.join(__dirname,`../../../static_files/preference_list_logo/${preference_list[i]}.svg`),{ encoding: "base64" });
    //   let thebase64 = contents.toString("base64");
    //   list[i]["SVGinBase64"] = thebase64;
    // }
    for (let item of list){
      if(item.logo && item.logo!=""){
        let theurl = await getObjectSignedUrl(item.logo);
        item.logo = theurl
      }
    }
    res.send(
      apiResponse("List Fetched Successfully", list, 200, true)
    );
  });
}

module.exports = new OnboardingController();
