/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */
const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
let {
  userCourseService,
  courseService,
  UserMediaProgressService,
  courseMediaService,
} = require("../../services");
const ApiError = require("../../utils/ApiError");
const model = require("../../models/index");
const { Sequelize } = require("../../models/index");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getObjectSignedUrl } = require("../../utils/s3");
const { watchTime, videoElapsedTime, saveUserActivity } = require("../../utils/helperFunctions");
const { Op } = require("sequelize");

class CourseController {
  listCourses = catchAsync(async (req, res) => {
    let queryOptions;
    queryOptions = {
      subQuery: false,
      raw: true,
      attributes: [
        "id",
        "name",
        [Sequelize.fn("COUNT", Sequelize.fn("DISTINCT", Sequelize.literal('"course_media"."id"'))), "media_count"],
        [Sequelize.fn("COUNT", Sequelize.fn("DISTINCT", Sequelize.literal('"user_courses"."id"'))), "user_count"],
      ],
      where: {
        is_active: true,
      },
      include: [
        {
          model: model.user_courses,
          attributes: [],
          required: false,
        },
        {
          model: model.course_media,
          attributes: [],
          required: false,
        },
      ],
      group: ['"courses"."id"'],
      order: [['id', 'ASC']]
    };
    let courses = await courseService.findAll(queryOptions);
    if (courses) {
      queryOptions={
        attributes: ['id', 'user_id', 'course_id'],
        where:{
          user_id: req.userData.id,
        },
        order: [['course_id', 'ASC']],
      }
      let userCourses =await userCourseService.findAll(queryOptions)

      let i=0, j=0; //i pointer for course and j for user's course
      while(i<courses.length && j<userCourses.length){
        if(courses[i].id == userCourses[j].course_id){
          courses[i].is_joined = true;
          i++
          j++
        }else{
          courses[i].is_joined = false;
          i++;
        }
      }
      //loop at the rest array
      while(i<courses.length){
        courses[i].is_joined = false;
        i++;
      }

      res.send(apiResponse("Courses fetched successfully", courses));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch courses");
    }
  });

  joinCourse = catchAsync(async (req, res) => {
    let { course_id } = req.body;

    let queryOptions = {
      where: {
        user_id: req.userData.id,
        course_id: course_id,
      },
      attributes: [],
      include: {
        model: model.courses,
        attributes: [],
        where: {
          is_active:true
        },
        required: false,
      }
    };
    let findUserCourse = await userCourseService.findOne(queryOptions);

    if (findUserCourse) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Course already joined.");
    }
    const dbTxn = await model.sequelize.transaction();

    // Create user course
    queryOptions = {
      transaction: dbTxn,
    };
    let requestBody = {
      user_id: req.userData.id,
      course_id: course_id,
    };
    let joinCourse = await userCourseService.create(requestBody, queryOptions);

    if (!joinCourse) {
      await dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "User course cannot be created.");
    }
    let joinedCourse = await courseService.findOne({
      where:{
        id: course_id,
        is_active:true,
      }
    })
    let activity_description = `You have joined the course ${joinedCourse.name}`;
    await saveUserActivity(1, req.userData.id, activity_description);
 
    queryOptions = {
      where: {
        course_id: course_id,
      },
      include: [
        {
          model: model.media,
          attributes: [],
          where:{
              is_active:true
          },
          required: false,
        }
      ]
    };

    let getCourseMedia = await courseMediaService.findAll(queryOptions);
    
    queryOptions = {
      where: {
        user_id: req.userData.id,
        media_id: getCourseMedia.map((item) => item.media_id),
      },
    };

    let getMedia = await UserMediaProgressService.findAll(queryOptions);

    if (!getMedia?.length) {
      requestBody = [];

      getCourseMedia.forEach((media) => {
        requestBody.push({
          user_id: req.userData.id,
          media_id: media.media_id,
          user_course_id: joinCourse.id,
        });
      });

      queryOptions = {
        transaction: dbTxn,
      };
      let addUserMediaProgress = await UserMediaProgressService.bulkCreate(requestBody, queryOptions);
      if (addUserMediaProgress?.length > 0) {
        await dbTxn.commit();
        res.send(apiResponse("Course joined successfully"));
      }
    } else {
      requestBody = [];
      let mediaIds = getCourseMedia.filter((item) => {
        return !getMedia.some((item1) => item.media_id === item1.media_id);
      });
      getMedia?.forEach((media) => {
        requestBody.push({
          id: media.id,
          user_course_id: joinCourse.id,
        });
      });
      //Bulk insert media progress as 0 in usermediaprogress

      mediaIds?.forEach((media) => {
        requestBody.push({
          user_id: req.userData.id,
          media_id: media.media_id,
          user_course_id: joinCourse.id,
        });
      });

      queryOptions = {
        transaction: dbTxn,
        updateOnDuplicate: ["user_course_id"],
      };

      let addUserMediaProgress = await UserMediaProgressService.bulkCreate(requestBody, queryOptions);

      if (addUserMediaProgress?.length > 0) {
        await dbTxn.commit();
        res.send(apiResponse("Course joined successfully", joinCourse));
      } else {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Could not join the course");
      }
    }
  });

  courseDetails = catchAsync(async (req, res) => {
    let { course_id } = req.query;

    let queryOptions = {
      subQuery: false,
      attributes: [
        "id",
        "name",
        "author",
        [Sequelize.literal('"user_courses"."id"'), "user_course_id"],
      ],
      where: {
        id: course_id,
        is_active: true,
      },
      include: [
        {
          model: model.course_media,
          attributes: [
            [Sequelize.literal('"course_media->medium"."id"'), "media_id"],
            [Sequelize.literal('"course_media->medium"."title"'), "title"],
            [Sequelize.literal('"course_media->medium"."media_type"'),"media_type"],
            [Sequelize.literal('"course_media->medium"."rating"'), "rating"],
            [Sequelize.literal('"course_media->medium"."duration"'), "duration"],
            [Sequelize.literal('"course_media->medium"."description"'), "description"],
            [Sequelize.literal('"course_media->medium"."is_free"'), "is_free"],
            [Sequelize.literal('"course_media->medium"."time_of_day"'), "time_of_day"],
            [Sequelize.literal('"course_media->medium"."thumbnail_s3_object_id"'), "thumbnail_link"],
            [Sequelize.literal('"course_media->medium"."media_s3_object_id"'), "media_link"],
            [Sequelize.literal('"course_media->medium"."is_active"'), "is_active"],
          ],
          where: {
            course_id: course_id,
          },
          required: false,
          include: {
            model: model.media,
            attributes: [],
            required: false,
          },
        },
        {
          model: model.user_courses,
          required: false,
          where: {
            course_id: course_id,
            user_id: req.userData.id,
          },
          attributes: ["is_favorite"],
        },
      ],
    };

    let courseDetails = await courseService.findOne(queryOptions);

    if (!courseDetails) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Course not found.");
    }
    
    for (let item of courseDetails.course_media) {
      let thumb = await getObjectSignedUrl(item.thumbnail_link);
      let vid = await getObjectSignedUrl(item.media_link);
      (item.thumbnail_link = thumb), (item.media_link = vid);
    }

    if (courseDetails?.user_courses?.length > 0) {
      courseDetails.is_joined = true;
      courseDetails.is_favorite = courseDetails.user_courses[0].is_favorite;
    } else {
      courseDetails.is_joined = false;
      courseDetails.is_favorite = false;
    }
    delete courseDetails.user_courses;
    
    if(!courseDetails.course_media || courseDetails.course_media.length == 0){
      return res.send(apiResponse("This Course has no video as of now", courseDetails));
    }

    if (courseDetails) {
      res.send(apiResponse("Course details fetched successfully", courseDetails));
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch course details");
    }
  });
  /**
   * Favorite a Course
   */
  favouriteCourse = catchAsync(async (req, res) => {
    let { course_id, is_favorite } = req.body;

    const dbTxn = await model.sequelize.transaction();

    let queryOptions = {
      where: {
        user_id: req.userData.id,
        course_id: course_id,
      },
      transaction: dbTxn,
    };
    let requestBody = {
      is_favorite: is_favorite,
    };
    let favouriteCourse = await userCourseService.update(requestBody, queryOptions);

    if (favouriteCourse) {
      await dbTxn.commit();
      if(is_favorite){
        let favoritedCourse = await courseService.findOne({
          where:{
            id: course_id,
            is_active:true,
          }
        })
        let activity_description = `You have liked the course ${favoritedCourse.name}`
        await saveUserActivity(2, req.userData.id, activity_description)  
      }
      res.send(apiResponse("Course favorite successfully"));
    } else {
      await dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not favorite the course");
    }
  });
}
module.exports = new CourseController();
