/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */
const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
let { userService, mediaService, userPreferenceService, UserMediaProgressService, userCourseService } = require("../../services");
const ApiError = require("../../utils/ApiError");
const model = require("../../models/index");
const { Sequelize } = require("../../models/index");
const levels = require("../../utils/levels");
const { query } = require("express");
const { getObjectSignedUrl } = require("../../utils/s3");
const Api = require("twilio/lib/rest/Api");
const { updateUserPoints, watchTime, updateMediaRating, updateUserPointsDaily,updateCoursePoints, updatePreferencePoints, isCourseCompleted, saveUserActivity } = require("../../utils/helperFunctions");
const moment = require("moment");
const { Op } = require("sequelize");
class MediaController {
  rateMedia = catchAsync(async (req, res) => {
    let { rating,media_id } = req. body;
    const dbTxn = await model.sequelize.transaction();
    let queryOptions = {
      where: {
        media_id: media_id,
        user_id: req.userData.id,
      },
      transaction: dbTxn
    };

    let requestBody = {
      rating: rating
    };

    let userRating = await UserMediaProgressService.update(requestBody, queryOptions);
    if(userRating.length ==0){
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Rating could not be Updated.")
    }
    let updatedRating = await updateMediaRating(media_id, rating);
    if(updatedRating.length==0){
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Rating could not be Updated.")
    }

    dbTxn.commit();
    res.send(apiResponse("Rating created successfully", {'updatedRating': updatedRating}, 200, true ));
  });

  getuserMediaProgress = catchAsync(async (req, res) => {
    let { user_course_id, media_id, preference_id } = req.query;
    let queryOptions, requestBody;
    queryOptions = {
      where:{
        id: media_id,
        is_active :true
      },
    }
    let vidStatus = await mediaService.findOne(queryOptions)
    if(!vidStatus)
    {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media doesn't exist");
    }

    if(user_course_id) {
    queryOptions = {
      attributes: ["id"],
      where: {
        user_id: req.userData.id,
        media_id: media_id
      }
    };

    let findVideo = await UserMediaProgressService.findOne(queryOptions);
    if(!findVideo) {
    const dbTxn = await model.sequelize.transaction();
      requestBody = {
        user_id: req.userData.id,
        media_id: media_id,
      };
      queryOptions = {
        transaction: dbTxn,
      };
      let addUserMediaProgress = await UserMediaProgressService.create(requestBody, queryOptions);
      if(addUserMediaProgress) {
    dbTxn.commit();
      } else{
        dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch video details");
      }
    }
  }
    queryOptions = {
      attributes: [
        "id",
        "user_id",
        "user_course_id",
        "media_id",
        "is_watched",
        "time_elapsed",
        "watch_time",
        "rating",
      ],
      where: {
        user_id: req.userData.id
      },
    };

    if (user_course_id) {
      queryOptions.where.user_course_id = user_course_id;
    }
    let videoDetails = await UserMediaProgressService.findAll(queryOptions);

    let currentVid = videoDetails.filter((item) => item.media_id == media_id || item.user_course_id == user_course_id && item.media_id == media_id );

    if (videoDetails?.length > 0) {
      res.send(apiResponse("User course Video details fetched successfully", {currentVid, videoDetails}));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch details");
    }
  });

  adduserMediaProgress = catchAsync(async (req, res) => {
    let { media_id, user_course_id, preference_id, time_elapsed, watch_time } = req.body;
    let requestBody = {};
    let videoTime
    let queryOptions = {
      attributes: [
        "id",
        "user_id",
        "media_id",
        "is_watched",
        "time_elapsed",
        "watch_time",
        "user_course_id",
        [Sequelize.literal('"medium"."duration"'), "duration"],
      ],
      where: {
        media_id: media_id,
        user_id: req.userData.id,
      },
      include: {
        model: model.media,
        attributes: [],
        where: {
          is_active: true,
        }
      },
    };

    // if (user_course_id) {
    //   queryOptions.where.user_course_id = user_course_id;
    // }

    let findVid = await UserMediaProgressService.findOne(queryOptions);
    const dbTxn = await model.sequelize.transaction();

    if (!findVid) {
      requestBody = {
        user_id: req.userData.id,
        media_id: media_id,
        time_elapsed: time_elapsed,
        watch_time: watch_time,
      };

      if(user_course_id) {
        requestBody.user_course_id = user_course_id
      }

      queryOptions = {
        transaction: dbTxn,
      };
      let addUserMediaProgress = await UserMediaProgressService.create(requestBody, queryOptions);
      
      if (addUserMediaProgress?.length === 0) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Progress could not be created");
      }
    } 
    else {
      if(!findVid.user_course_id && user_course_id) {
        requestBody.user_course_id = user_course_id
      }
      watch_time = findVid.watch_time + watch_time;
      videoTime = watchTime(watch_time, time_elapsed, findVid.duration);

      if (videoTime && !findVid.is_watched) {
        requestBody.is_watched = true;
        requestBody.time_elapsed = time_elapsed;
        requestBody.watch_time = watch_time;
      } else {
        requestBody.time_elapsed = time_elapsed;
        requestBody.watch_time = watch_time;
      }               
      queryOptions = {
        where: {
          user_id: req.userData.id,
          media_id: media_id,
        },
        transaction: dbTxn,
      };
      let updateVideo = await UserMediaProgressService.update(requestBody, queryOptions);
      if (updateVideo[0] === 0) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Could not update video progress");
      }
    }
    queryOptions = {
      where:{
        user_id: req.userData.id,
        updated_at: {[Op.gte]: moment().startOf('day')},
        time_elapsed: {[Op.gt]: '00:00:00'},
      }
    }
    let getRecentVideo = await UserMediaProgressService.findOne(queryOptions);
    if(!getRecentVideo) {
      requestBody = {
        mindful_days: req.userData.mindful_days + 1
      };
      
      queryOptions = {
        where: {
          id: req.userData.id,
          is_active: true
        },
        transaction: dbTxn,
      };
      
      let updateMindfulDays = await userService.update(requestBody, queryOptions);
      if(!updateMindfulDays) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Could not update mindful days");
      }
    }; 

    await dbTxn.commit();

    //course points
    if (user_course_id && videoTime && !findVid.is_watched) {
      await updateUserPoints(req.userData.id, 2);
      await updateUserPointsDaily(req.userData.id, 2);
      await updateCoursePoints(req.userData.id, user_course_id, 2);
      let isCourseDone = await isCourseCompleted(req.userData.id, user_course_id)
      if(isCourseDone){
        await updateCoursePoints(req.userData.id, user_course_id, 3);
        
        //fetch course name
        queryOptions= {
          subQuery:false,
          attributes: [
            'user_id',
            'course_id',
            [Sequelize.literal('"course"."name"'), 'courseName']
          ],
          where:{
            id: user_course_id,   
          },
          include:[{
            require:true,
            model:model.courses,
            attributes:[],
          }]
        }
        let courseName = await userCourseService.findOne(queryOptions);
        let saveUserActivityDescription = `You have completed the course ${courseName.courseName} `
        await saveUserActivity(4, req.userData.id, saveUserActivityDescription)

      }
    }else if (!user_course_id && videoTime && !findVid.is_watched) { // preference videos points
      await updateUserPoints(req.userData.id, 1);
      await updateUserPointsDaily(req.userData.id, 1);
      if(preference_id){
        await updatePreferencePoints(req.userData.id, preference_id, 10);
      }
    }
    res.send(apiResponse("Media progress saved successfully"));
  });
}

module.exports = new MediaController();