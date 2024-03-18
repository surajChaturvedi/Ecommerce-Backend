/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */
const { profile } = require("console");
const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
let { userService, userCourseService, ReminderService, schedulerService, schedulerJobService, userPreferenceService } = require("../../services");
let { putProfilePhotoObject, getObjectSignedUrl } = require("../../utils/s3");
const { update } = require("../../services/user.services");
const ApiError = require("../../utils/ApiError");
const model = require("../../models/index");
const axios = require("axios");
const http = require("http");
const userMediaProgressService = require("../../services/userMediaProgress.services");
const fs = require("fs");
const levels = require("../../utils/levels");
const { Sequelize } = require("../../models/index");
const { get } = require("https");
const path = require("path");
const httpStatus = require("http-status");
const reminderServices = require("../../services/reminder.services");
const userActivityServices = require("../../services/userActivity.services");
const { saveUserActivity } = require("../../utils/helperFunctions")
class ProfileController {
  /**
   * Get User's Profile
   */
  getUserProfile = catchAsync(async (req, res) => {
    let queryOptions;
    queryOptions = {
      attributes: [
        "id",
        "first_name",
        "last_name",
        "mobile_number",
        "mds_id",
        "email",
        "social_picture",
        "profile_picture",
        "points",
        "facebook_uid",
        "google_uid",
        "apple_uid",
        "is_phone_verified",
      ],
      where: {
        id: req.userData.id,
        mds_id: req.userData.mds_id,
        is_active: true
      },
      include: [
        {
          model: model.user_preferences,
          attributes: ["preference_id"],
          where:{
            is_selected:true
          },
          required:false
        },
      ],
      paranoid: false,
    };
    let user = await userService.findOne(queryOptions);
    if (user.mobile_number) {
      user.typeOflogin = 0;
    }
    if (user?.facebook_uid || user.google_uid || user.apple_uid) {
      user.typeOflogin = 1;
    }
    if (user.profile_picture) {
      let pic = await getObjectSignedUrl(user.profile_picture);
      user.profile_picture = pic;
    } else {
      user.profile_picture = user.social_picture;
      delete user.social_picture;
    }
    if (user) {
      delete user?.facebook_uid;
      delete user?.google_uid;
      delete user?.apple_uid;
      res.send(apiResponse("User Data Fetched", user, 200, true));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Couldn't Fetch user data");
    }
  });

  /**
   * Update User's Profile
   */
  updateProfile = catchAsync(async (req, res) => {
    let { first_name, last_name, email } = req.body;
    let dbTxn = await model.sequelize.transaction();
    let requestBody, queryOptions;
    queryOptions = {
      where: {
        id: req.userData.id,
        is_active: true
      },
      transaction: dbTxn,
    };
    requestBody = {
      first_name: first_name,
      last_name: last_name,
      email: email,
    };
    let updateUserProfile = await userService.update(requestBody, queryOptions);
    if (updateUserProfile[0]) {
      dbTxn.commit();
      await saveUserActivity(3, req.userData.id, 'You have updated your profile')
      queryOptions = {
        attributes: [
          "id",
          "mobile_number",
          "profile_picture",
          "social_picture",
          "email",
          "first_name",
          "last_name",
          "mds_id",
        ],
        where: {
          id: req.userData.id,
          is_active: true,
        },
      };
      let user = await userService.findOne(queryOptions);
      if (user.profile_picture) {
        let pic = await getObjectSignedUrl(user.profile_picture);
        user.profile_picture = pic;
      } else {
        user.profile_picture = user.social_picture;
        delete user.social_picture;
      }
      res.send(apiResponse("User Profile Updated", user, 200, true));
    } else {
      dbTxn.rollback();
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Profile could not be updated"
      );
    }
  });

  /**
   * Upload User's profile photo to aws
   */
  uploadProfilePhoto = catchAsync(async (req, res) => {
    let file = req.file;
    let fileData = file.buffer;
    let queryOptions = {
      where: {
        mds_id: req.userData.mds_id,
        is_active: true
      },
    };
    const user = await userService.findOne(queryOptions);
    if (user) {
      let filename = `${user.mds_id}.jpeg`;
      let s3DestinationUrl = await putProfilePhotoObject(
        filename,
        "image/jpeg image/png image/svg+xml"
      );

      await axios.put(s3DestinationUrl, fileData, {
        headers: { "Content-Type": "application/octet-string" },
      });
      let Key = `users/profile-photo/${filename}`;
      let requestBody = {
        profile_picture: Key,
      };
      //save key to database
      await userService.update(requestBody, queryOptions);
      let photoUrl = await getObjectSignedUrl(Key);
      await saveUserActivity(3, req.userData.id, "You have updated your profile photo");
      res.send(
        apiResponse("Photo Uploaded", { photoUrl: photoUrl }, 200, true)
      );
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Photo couldn't be uploaded for the User"
      );
    }
  });

  /**
   * Favorite course
   */
  getFavouriteCourses = catchAsync(async (req, res) => {
    let queryoptions = {
      subQuery: false,
      attributes: [],
      where: {
        user_id: req.userData.id,
        is_favorite: true,
      },
      include: [
        {
        model: model.courses,
        attributes: [
          "id",
          "name",
          "author",
          "is_free",
          "experience",
          "is_active",
           [Sequelize.fn("COUNT", Sequelize.fn("DISTINCT", Sequelize.col('"course->course_media"."id"'))), "media_count"],
        ],
        include:[
          {
            model: model.course_media,
            attributes: [],
            required: false
          }
        ]
        } 
    ],
     group: ['"course"."id"','"user_courses"."id"'] ,
    //  group: []
    };

    let favouriteCourses = await userCourseService.findAll(queryoptions);

    if (!favouriteCourses) {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Favourite courses could not be fetched."
      );
    }
    res.send(
      apiResponse(
        "Favourite courses fetched successfully.",
        favouriteCourses,
        200,
        true
      )
    );
  });

  /**
   * Get user Progress
   */
  getUserProgress = catchAsync(async (req, res) => {
    let queryOptions = {
      subQuery: false,
      required:true,
      where: {
        id: req.userData.id,
      },
      attributes: [
        "id",
        "points",
        "mindful_days",
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.fn("DISTINCT", Sequelize.literal('"user_courses"."id"'))
          ),
          "total_courses",
        ],
        [
          Sequelize.fn(
            "SUM",
            Sequelize.literal(
              '"user_courses->user_media_progresses"."watch_time"'
            )
          ),
          "total_minutes",
        ],
      ],
      include: [
        {
          model: model.user_courses,
          required: false,
          attributes: [],
          include: [
            {
              model: model.user_media_progress,
              required: false,
              attributes: [],
            },
          ],
        },
      ],
   
      group: ['"users"."id"'],
    };

    let userDetails = await userService.findOne(queryOptions);
    if (!userDetails) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch user.");
    }

    let level = levels.find(
      (level) =>
        userDetails.points >= level.min && userDetails.points <= level.max
    );

    userDetails.points = userDetails.points;
    userDetails.level = level.level;
    userDetails.level_max = level.max;
    userDetails.total_courses = parseInt(userDetails.total_courses);
    if (userDetails.total_minutes == null) {
      userDetails.total_minutes = 0;
    }
    userDetails.total_minutes = Math.floor(userDetails.total_minutes / 60);

    if (userDetails) {
      res.send(apiResponse("User progress fetched successfully", userDetails));
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "User progress could not be fetched."
      );
    }
  });

  userPointsBreakup = catchAsync(async (req,res) => {
    let  queryOptions,pointsFromCourse, pointsFromPreference, pointsBreakup;
    queryOptions = {
      required:true,
      attributes:[
        [Sequelize.literal('"course"."name"'), "course_name"],
        "course_points",
      ],
        where: {
        user_id: req.userData.id,
      },
      include: [{
        model: model.courses, 
        attributes:[],
      }]
    }
    pointsFromCourse = await userCourseService.findAll(queryOptions);
    queryOptions = {
      required:true,
      attributes:[
        [Sequelize.literal('"preference"."title"'), "preference_name"],
        "preference_points",
      ],
      where:{
        user_id:req.userData.id,
      },
      include: [{
        model: model.preferences,
        attributes:[],
      }]
    }
    pointsFromPreference = await userPreferenceService.findAll(queryOptions);
    
    pointsBreakup = { pointsFromCourse, pointsFromPreference};
    if(pointsFromCourse.length == 0 && pointsFromPreference.length == 0){
      return res.send(apiResponse("0 Points", pointsBreakup, 200, true));
    }
    if(!pointsBreakup){
      throw new ApiError(httpStatus.BAD_REQUEST, "Could not fetch points");
    }
    res.send(apiResponse("Points fetched successfully", pointsBreakup, 200, true));
  })

  userRecentlyPlayedVideo = catchAsync(async (req, res) => {
    let { offset, limit } = req.query;
    let queryOptions;
    offset = offset || 0;
    limit = limit || 10;
    // history for the videos
    queryOptions = {
      where: {
        user_id: req.userData.id,
      },
      attributes: [
        "media_id",
        "is_watched",
        "time_elapsed",
        [Sequelize.literal("medium.title"), "media_title"],
        [Sequelize.literal("medium.rating"), "rating"],
        [Sequelize.literal("medium.description"), "description"],
        [Sequelize.literal("medium.duration"), "duration"],
        [Sequelize.literal("medium.thumbnail_s3_object_id"), "thumbnail_link"],
        [Sequelize.literal("medium.media_s3_object_id"), "media_link"],
      ],
      include: [
        {
          require: true,
          model: model.media,
          attributes: [],
          where: {
            is_active: true,
          }
        },
      ],
      offset: offset,
      limit: limit,
      order: [["updated_at", "DESC"]],
    };
    const userRecentlyPlayedVideos = await userMediaProgressService.findAll(
      queryOptions
    );
    if (userRecentlyPlayedVideos) {
      for (let item of userRecentlyPlayedVideos) {
        let vid = await getObjectSignedUrl(item.media_link);
        let thumbnail = await getObjectSignedUrl(item.thumbnail_link);
        item.media_link = vid;
        item.thumbnail_link = thumbnail;
      }

      res.send(
        apiResponse(
          "User's Recently Played Videos Fetched Successfully",
          userRecentlyPlayedVideos,
          200,
          true
        )
      );
    } else {
      throw new ApiError(http.BAD_REQUEST, "video List Couldn't be fetched");
    }
  });

  userEditProfile = catchAsync(async (req, res) => {
    let { first_name, last_name, email } = req.body;
    let queryOptions, requestBody, updateUser;
    let dbTxn = await model.sequelize.transaction();
    if(req.userData.google_uid && email.length==0){
      throw new ApiError(httpStatus.BAD_REQUEST, "Action not allowed");
    }
    queryOptions = {
      where: {
        id: req.userData.id,
        is_active:true,
      },
      transaction: dbTxn,
    };
    requestBody = {
      first_name: first_name,
      last_name: last_name,
      email: email,
    };
    updateUser = await userService.update(requestBody, queryOptions);
    if (updateUser) {
      await saveUserActivity(3, req.userData.id, 'You have updated your profile')
      dbTxn.commit();
      res.send(apiResponse("user data saved", [], 200, true));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not save user data");
    }
  });

  getPrivacyPolicy = catchAsync(async (req, res) => {
    const content = fs.readFileSync(
      path.join(__dirname, "../../../static_files/data/PrivacyPolicy.html"),
      { encoding: "utf8" }
    );
    if (content) {
      res.send(
        apiResponse("Privacy Policy Fetched Successfully", content, 200, true)
      );
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, "Something Went Wrong");
    }
  });

  /**
   * Get contact us text
   */
  getContactUs = catchAsync(async (req, res) => {
    const content = fs.readFileSync(
      path.join(__dirname, "../../../static_files/data/ContactUs.html"),
      { encoding: "utf8" }
    );
    if (content) {
      res.send(
        apiResponse(
          "Contact Us Details Fetched Successfully",
          content,
          200,
          true
        )
      );
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, "Something Went Wrong");
    }
  });

  /**
   * Add reminder
   */
  addReminder = catchAsync(async (req, res) => {
    let { title, scheduled_time } = req.body;
    let queryOptions, requestBody, dbTxn;
    dbTxn = await model.sequelize.transaction();

    queryOptions = {
      transaction: dbTxn,
    };
    requestBody = {
      user_id: req.userData.id,
      title: title,
      scheduled_time: scheduled_time,
    };
    let createReminder = await ReminderService.create(
      requestBody,
      queryOptions
    );
    if (!createReminder) {
      await dbTxn.rollback();
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Reminder Could Not be creator"
      );
    }
    
    //setup schedulers 
    queryOptions = { 
      where: { 
        trigger_at: scheduled_time
      }
    }

    // TODO: Create a function to check the below code
    let findExistingScheduler = await schedulerService.findOne(queryOptions);

    if(findExistingScheduler){ 
      requestBody = { 
        scheduler_id: findExistingScheduler.id,
        trigger_type: 1
      }
      queryOptions = { 
        transaction: dbTxn
      }

      let createSchedulerJobs = await schedulerJobService.create(requestBody,queryOptions);
      if(!createSchedulerJobs){
        await dbTxn.rollback();
        throw new ApiError(httpStatus.BAD_REQUEST, "Reminder could not be created")
      }
    }
    else{ 
      requestBody = { 
        trigger_at: scheduled_time,
        trigger_type: 1
      }
      queryOptions = { 
        transaction: dbTxn
      }

      let createSchedulers = await schedulerService.create(requestBody,queryOptions);
      if(!createSchedulers){
        await dbTxn.rollback();
        throw new ApiError(httpStatus.BAD_REQUEST, "Reminder could not be created")
      }

      requestBody = { 
        scheduler_id: createSchedulers.id,
        trigger_type: 1
      }
      
      let createSchedulerJobs = await schedulerJobService.create(requestBody,queryOptions);
      if(!createSchedulerJobs){
        await dbTxn.rollback();
        throw new ApiError(httpStatus.BAD_REQUEST, "Reminder could not be created")
      }
      
    }
    
    await saveUserActivity(6, req.userData.id, 'You have set a reminder')
    await dbTxn.commit();
    await schedulerService.scheduleJobs();
   
    res.send(apiResponse("Reminder Saved",[],200, true));
  })

  /**
   * Get User's Reminders
   */

  getReminders = catchAsync( async(req,res) => {
    let queryOptions, userReminders;
    queryOptions ={
      attributes:[
        ['id', 'reminder_id'],
        'user_id',
        'scheduled_time',
        'title',
      ],
      where:{
        user_id: req.userData.id,
      },
      order:[['scheduled_time', 'ASC']]
    },
  
    // queryOptions = {
    //   attributes: [
    //     [
    //       Sequelize.literal(`to_jsonb(to_char("scheduled_time", 'YYYY-MM-DD'))`),
    //       'date',
    //     ],
    //     [Sequelize.literal(`jsonb_agg(jsonb_build_object('title'))`), 'events'],
    //   ],
    //   group: [Sequelize.literal(`to_char("scheduled_time", 'YYYY-MM-DD')`)],
    //   order: [Sequelize.col('scheduled_time')],
    // }
    userReminders = await reminderServices.findAll(queryOptions);
  
    if(!userReminders){
      throw new ApiError("Couldn't Fetch User's Reminders", statusCodes.BAD_REQUEST);
    }
    
    for(let i=1; i<userReminders.length+1; i++){
      let date1 = new Date(userReminders[i-1])
      let date2 = new Date(userReminders[i])
      let year1 = date1.getFullYear();
      let year2 = date1.getFullYear();
      let month1 = date1.getMonth()+1;
      let month2 = date2.getMonth()+1;
      let day1 = date1.getDate();
      let day2 = date2.getDate();

      if(year1 == year2 && month1 == month2 && day1 == day2){
        
      }
    }

    res.send(apiResponse("Reminders Fetched Successfully", userReminders, 200, true));
  })

  /**
   * delete Reminder
   */
  deleteReminder = catchAsync( async(req,res) => {
    let queryOptions, deleteReminder;
    let { reminder_id } = req.query
    const dbTxn = await model.sequelize.transaction();
    queryOptions = {
      where:{
        id: reminder_id,
        user_id: req.userData.id,
      },
      transaction:dbTxn,
      
    }
    deleteReminder = await reminderServices.destroy(queryOptions);
    if(!deleteReminder){
      dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST,"Could not delete the reminder");
    }
    dbTxn.commit();
    res.send(apiResponse("Reminder Deleted", {status:'done'}, 200, true));
  })

  /**
   * Get activity history
   */
  getActivityHistory = catchAsync(async(req,res)=>{
    let queryOptions, userActivityHistory;
    queryOptions ={
      attributes:[
        'created_at',
        [Sequelize.literal('"activity_type"."title"'), 'title'],
        'activity_type_id',
        'description'
      ],
      include:[{
        model: model.activity_types,
        attributes:[],
      }],
      where: {
        user_id: req.userData.id,
      },
      order: [['created_at','DESC']],
    };
    userActivityHistory = await userActivityServices.findAll(queryOptions);
    if(!userActivityHistory && userActivityHistory.length == 0){
      throw new ApiError("Couldn't Fetch Activity History");
    }
    res.send(apiResponse("Activity History Fetched Successfully", userActivityHistory, 200, true));
  })
}
module.exports = new ProfileController();
