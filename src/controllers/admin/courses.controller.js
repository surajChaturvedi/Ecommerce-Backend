/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

const statusCodes = require("http-status");
const apiResponse = require("../../utils/ApiResponse");
const catchAsync = require("../../utils/catchAsync");
let { userService, mediaService, courseService,  } = require("../../services");
const { getObjectSignedUrl } = require("../../utils/s3");
const { Model } = require("sequelize");
const model = require("../../models/index");
const { Sequelize } = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");
const { query } = require("express");
const { object } = require("joi");
const { get } = require("http");
const courseServices = require("../../services/course.services");
const courseMediaService = require("../../services/courseMedia.services");

class CoursesController {
    /**
     * Get All Courses
     */
    getCoursesList = catchAsync(async (req, res)=>{
        let { search, offset, limit, order_by, order_type } = req.query;

        let queryOptions, coursesList;

        queryOptions = {
            subQuery:false,
            attributes : [
                ['id','course_id'],
                ['name', 'course_name'],
                ['author', 'author_name'],
                'description',
                'is_active',
            ],
            include: [
                {   
                    model: model.course_media,
                    required: false,
                    attributes:[
                        [Sequelize.literal('"course_media->medium"."title"'),"media_title"]
                    ],
                    include: [
                        {
                            model: model.media,
                            required: false,
                            attributes: []
                        }
                    ]
                }
            ],
        }

    order_by = parseInt(order_by, 10);
    order_type = parseInt(order_type, 10);

    if(order_by == 1) {//Course name 
      queryOptions.order = [['name', order_type ? 'DESC' : 'ASC']]; 
    }
    if(order_by == 2) {//Author name
      queryOptions.order = [['author', order_type ? 'DESC' : 'ASC']];
    }
    if(order_by == 3) {//Status
        queryOptions.order = [['is_active', order_type ? 'DESC' : 'ASC']];
      }

    if(!order_by) {
      queryOptions.order = [['created_at', 'DESC']];
    }
    if (search?.length > 0) {
      queryOptions.where = {name: {[Op.iLike]: `%${search}%`},
      };
    }
    
    coursesList = await courseService.findAll(queryOptions);
    let count = coursesList.length

    let originalLength = coursesList.length
    if(offset > originalLength){
      offset = 0;
    }
    coursesList.forEach((item)=> {
      item.media_count = item.course_media.length   
  });
    let listCourses = coursesList.slice(parseInt(offset),parseInt(limit)+parseInt(offset));

    if(order_by == 4){
        if(order_type == 0){
          listCourses.sort(function(a, b){ if(a.media_count<b.media_count){ return -1;}});
        }else{
          listCourses.sort(function(a, b){ if(a.media_count>b.media_count){ return -1;}});
        }
      }
      res.send(apiResponse("Courses fetched successfully", {count: count, rows: listCourses}, 200, true));
    })

     /**
   * Create Course
   */
    addCourse = catchAsync(async (req, res) => {
      const {course_name,description,author_name} = req.body;
      let queryOptions = {
        where: {
          name: {
            [Op.iLike]: `%${course_name}%`,
          },
        },
      };
      let courseExists = await courseService.findAll(queryOptions);
      if (courseExists?.length > 0) {
        throw new ApiError(statusCodes.BAD_REQUEST, "Course Already exists");
      }
      const dbTxn = await model.sequelize.transaction();
        let requestBody = {
          name: course_name,
          description: description,
          author: author_name
        };
        queryOptions = {
          transaction: dbTxn,
        }
        let newCourse = await courseService.create(requestBody,queryOptions);
        if (!newCourse) {
          await dbTxn.rollback();
          throw new ApiError(statusCodes.BAD_REQUEST, "Course could not be created");
        }else{
      await dbTxn.commit();
      res.send(apiResponse("Course created successfully", [], 200, true));
     }
    });
       /**
   * get Course
   */
    getCourse = catchAsync(async (req, res) => { 
      let queryOptions = {
        subQuery: false,
        attributes: [
          "id",
          "name",
          "author",
          "description"
        ],
        where: {
          id: req.query.course_id,
        },
        include: [
          {
            model: model.course_media,
            attributes:[
                [Sequelize.literal('"course_media->medium"."id"'), "media_id"],
                [Sequelize.literal('"course_media->medium"."title"'),"media_title"],
                [Sequelize.literal('"course_media->medium"."media_type"'),"media_type"],
                [Sequelize.literal('"course_media->medium"."thumbnail_s3_object_id"'), "thumbnail_link"],
                [Sequelize.literal('"course_media->medium"."media_s3_object_id"'), "media_link"],
            ],
            include: [
                {
                    model: model.media,
                    attributes: []
                }
            ]
          }
        ]
      };
      let course = await courseServices.findOne(queryOptions);

      if (!course) {
        throw new ApiError(statusCodes.NOT_FOUND, "Course not found");
      }

      for (let item of course.course_media) {
        let thumb = await getObjectSignedUrl(item.thumbnail_link);
        let vid = await getObjectSignedUrl(item.media_link);
        (item.thumbnail_link = thumb), (item.media_link = vid);
      }  

      if(course){
      res.send(apiResponse( "Course fetched successfully",course,200, true));
      }
    }) 
      
    /**
   * Edit Course
   */
    editCourse = catchAsync(async (req, res) => {
      let {course_id,course_name,description,author_name} = req.body;
      let requestBody;
      let queryOptions = {
        where: {
          id: course_id
        }
      };
      const findCourse = await courseService.findOne(queryOptions);
      if (!findCourse ) {
        throw new ApiError(statusCodes.BAD_REQUEST, "Course not found");
      };
  
      const dbTxn = await model.sequelize.transaction();
  
      if(findCourse?.name != course_name || findCourse?.description != description || findCourse?.author != author_name) {
        requestBody = {
          name: course_name,
          description: description,
          author: author_name
        };
        let queryOptions = {
          where: {
            id: course_id
          },
          transaction: dbTxn,
        };
        const updateCourseName = await courseService.update(requestBody, queryOptions);
        if (!updateCourseName) {
          await dbTxn.rollback();
          throw new ApiError(statusCodes.BAD_REQUEST, "Course could not be updated");
        };
      };    
    await dbTxn.commit();
    res.send(apiResponse("Course edited successfully"));   
});
   /**
   * Delete Course
   */
    deleteCourse = catchAsync(async (req, res) => {
      let { course_id } = req.query;
      let queryOptions = {
        where: {
          id: course_id
        }
      };
      const findCourse = await courseService.findOne(queryOptions);

      if (!findCourse ) {
        throw new ApiError(statusCodes.BAD_REQUEST, "Course not found");
      };
      const dbTxn = await model.sequelize.transaction();
       queryOptions = {
        where: {
          id: course_id,          
        },
        // paranoid: false, 
        transaction: dbTxn,
      };
      let deleteCourse = await courseService.destroy(queryOptions);
      queryOptions={
        where:{
          course_id: course_id,
        }
      }
      let deleteCourseMedia = await courseMediaService.destroy(queryOptions);
  
      if (!deleteCourse) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Could not delete course");
      }
        await dbTxn.commit();
        res.send(apiResponse("Course deleted successfully"));
    });

    
  /**
   *Update Course Status  
   */

  courseStatus = catchAsync(async (req, res) => {
    let { course_id, is_active } = req.query;
    let queryOptions = {
      where: {
        id: course_id,
      },
    };
    let course = await courseService.findOne(queryOptions);
    if (course) {
      let requestBody = {
        is_active: is_active,
      };
      const dbTxn = await model.sequelize.transaction();
      queryOptions = {
        where: {
          id: course_id,
        },
        transaction: dbTxn,
      };
      let mediaUpdate = await courseService.update(requestBody, queryOptions);
      if (mediaUpdate[0] != 0) {
        await dbTxn.commit();
        res.send(
          apiResponse("course status updated successfully", [], 200, true)
        );
      } else {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Course status could not be updated "
        );
      }
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Course doesn't exist");
    }
  });
  }    



module.exports = new CoursesController();