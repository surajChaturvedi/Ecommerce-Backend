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
  mediaService,
  tokenService,
  preferenceService,
  courseMediaService,
  preferenceMediaService,
  categoryMediaService,
} = require("../../services");
const { getObjectSignedUrl, putPreferencePhotoObject, putMediaThumbnailPhotoObject, deleteS3Object } = require("../../utils/s3");
const { Model } = require("sequelize");
const model = require("../../models/index");
const { Sequelize } = require("../../models/index");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");
const s3 = require("@aws-sdk/client-s3");
const client = new s3.S3Client({ region: "us-east-1" });
const config = require("./../../config/config");
const axios = require("axios");

class AdminVideosController {
  /**
   *Fetch Videos List
   */
  list = catchAsync(async (req, res) => {
    let {
      offset,
      limit,
      search,
      order_by,
      order_type,
      preference_id,
      course_id,
      time_of_day,
    } = req.query;
    let queryOptions = {
      subQuery: false,
      required: true,
      where: {
        is_useable: true,
      },
      attributes: [
        ["id", "media_id"],
        ["media_s3_object_id", "media_link"],
        "title",
        ["thumbnail_s3_object_id", "thumbnail_link"],
        "description",
        "is_active",
        "time_of_day",
        "duration",
        [Sequelize.literal('"course_media->course"."name"'), "course_name"],
        [Sequelize.literal('"course_media->course"."id"'), "course_id"],
        [
          Sequelize.literal('"preference_media->preference"."title"'),
          "preference_name",
        ],
        [
          Sequelize.literal('"preference_media->preference"."id"'),
          "preference_id",
        ],
        [
          Sequelize.literal('"category_media->category"."id"'),
          "category_id",
        ],
        [
          Sequelize.literal('"category_media->category"."title"'),
          "category_title",
        ],
      ],
      include: [
        {
          model: model.preference_media,
          attributes: [],
          where:{},
          required: false,
          include: {
            model: model.preferences,
            attributes: [],
             required: false,
          },
        },
        {
          model: model.category_media,
          attributes: [],
           required: false,
          include:[ {
            model: model.categories,
            attributes: [],
             required: false,
          },]
        },
        {
          model: model.course_media,
           attributes: [],
          required: false,
          include: [
            {
              model: model.courses,
               attributes: [],
               required: false,
            },
          ],
        },
      ],
      offset: offset,
      limit: limit,
    };

    // if searching
    if (search?.length > 0) {
      Object.assign(queryOptions.where, {
        [Op.or]: [
          Sequelize.where(
            Sequelize.literal('"media"."title"'),
            // Sequelize.col("title"),
            {
              [Op.iLike]: `%${search}%`,
            }
          ),
          Sequelize.where(Sequelize.literal('"media"."description"'), {
            [Op.iLike]: `%${search}%`,
          }),
        ],
      });
    }

    // sorting on preference, time_of_day, course
    if (
      order_by != undefined &&
      order_by.toString() != "" &&
      order_type.toString() != "" &&
      order_by != "null" &&
      order_type != "null"
    ) {
      if (order_by != "id") {
        queryOptions.order = [[Sequelize.col(order_by)]];
      } else {
        queryOptions.order = [[order_by, order_type]];
      }
    } else {
      queryOptions.order = [["id", "DESC"]];
    }
    if (preference_id) {
      Object.assign(queryOptions.include[0], {required:true});
      Object.assign(queryOptions.include[0].where, {
       preference_id 
      });
    }
    if (course_id) {
      Object.assign(queryOptions.where, {
        [Op.or]: [
          Sequelize.where(
            Sequelize.literal('"course_media->course"."id"'),
            // Sequelize.col("title"),
            {
              [Op.eq]: course_id,
            }
          ),
        ],
      });
    }
    if (time_of_day) {
      Object.assign(queryOptions.where, {
        [Op.or]: [
          Sequelize.where(
            Sequelize.literal('"media"."time_of_day"'),
            // Sequelize.col("title"),
            {
              [Op.eq]: time_of_day,
            }
          ),
        ],
      });
    }

    let media = await mediaService.findAll(queryOptions);

    if (media.length == 0) {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Could not fetch Videos details."
      );
    } else {
     
      for (let item of media) {
        if(item.thumbnail_link){
        let thumb = await getObjectSignedUrl(item.thumbnail_link);
        (item.thumbnail_link = thumb);
      }
      if(item.media_link){
        let vid = await getObjectSignedUrl(item.media_link);
        (item.media_link = vid)
      }
    }
      
      if (media) {
        res.send(
          apiResponse("Videos and thumbnails fetched successfully", media)
        );
      } else {
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Could not fetch Videos details"
        );
      }
    }
  });

  /**
   *Update Videos Status
   */

  mediaStatus = catchAsync(async (req, res) => {
    let { media_id, is_active } = req.query;
    let queryOptions = {
      where: {
        id: media_id,
      },
    };
    let media = await mediaService.findOne(queryOptions);
    if (media) {
      let requestBody = {
        is_active: is_active,
      };
      const dbTxn = await model.sequelize.transaction();
      queryOptions = {
        where: {
          id: media_id,
        },
        transaction: dbTxn,
      };
      let mediaUpdate = await mediaService.update(requestBody, queryOptions);
      if (mediaUpdate[0] != 0) {
        await dbTxn.commit();
        res.send(apiResponse("media status updated successfully"));
      } else {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Media status could not be updated "
        );
      }
    } else {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media doesn't exist");
    }
  });

  editMedia = catchAsync(async (req, res) => {
    let {
      media_id,
      is_media_uploaded,
      is_thumbnail_uploaded,
      media_title,
      description,
      preference_id,
      category_id,
      course_id,
      media_type,
      time_of_day,
      duration,
    } = req.body;

    let queryOptions = {
      where: {
        id: media_id,
      },
    };
    const findMedia = await mediaService.findOne(queryOptions);
    if (!findMedia) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media not found");
    }
    if (is_media_uploaded=='false') {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media not uploaded please upload it first");
    }
    if (is_thumbnail_uploaded=='false') {
      throw new ApiError(statusCodes.BAD_REQUEST, "Thumbnail not uploaded");
    }
    const dbTxn = await model.sequelize.transaction();
    if (
      findMedia?.title != media_title ||
      findMedia?.description != description ||
      findMedia?.time_of_day != time_of_day
    ) {
      let requestBody = {
        title: media_title,
        description: description,
        time_of_day: time_of_day,
        media_type: media_type,
        duration: duration,
        is_useable:true
      };
      let queryOptions = {
        where: {
          id: media_id,
        },
        transaction: dbTxn,
      };

      let updateMedia = await mediaService.update(requestBody, queryOptions);
      if (!updateMedia) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "media can't be updated");
      }
    }
    if (course_id) {
      let requestBody = {
        course_id: course_id,
        media_id: media_id,
      };
      let queryOptions = {
        where: {
          media_id: media_id,
        },
        transaction: dbTxn,
      };

      let deleteCourseMedia = await courseMediaService.destroy(queryOptions);
      queryOptions = {
        transaction: dbTxn,
      };
      let updateCourseMedia = await courseMediaService.create(
        requestBody,
        queryOptions
      );
      if (!updateCourseMedia) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "course can't be updated duplicate values exist"
        );
      }
    }

    if (preference_id){
      let requestBody = {
        preference_id: preference_id,
        media_id: media_id,
      };
      let queryOptions = {
        where: {
          media_id: media_id,
        },
        transaction: dbTxn,
      };

      let deletePreferenceMedia = await preferenceMediaService.destroy(
        queryOptions
      );
      let createPreferenceMedia = await preferenceMediaService.create(
        requestBody
      );
      if (!createPreferenceMedia) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference can't be updated"
        );
      }
  if(category_id){
      requestBody = {
        category_id: category_id,
        media_id: media_id,
      };
      queryOptions = {
        where: {
          media_id: media_id,
        },
        transaction: dbTxn,
      };
      let deleteCategoryMedia = await categoryMediaService.destroy(
        queryOptions
      );
      let updateCategoryMedia = await categoryMediaService.create(requestBody);
      if (!updateCategoryMedia){
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Category can't be updated"
        );
      }
    }

    }
    await dbTxn.commit();
    res.send(apiResponse("Media updated successfully"));
  });

  startUpload = catchAsync(async (req, res) => {
    const { videoTitle } = req.body;
    let key = `Videos/${videoTitle}`;
    const multipartParams = {
    Bucket: config.aws.awsBucket,
    Key: key
  };
    let multipartUpload;
    try {
      multipartUpload = await client.send(new s3.CreateMultipartUploadCommand(multipartParams));
      res.send({ fileId: multipartUpload.UploadId, fileKey: videoTitle, });
    } catch (err) {
      console.error(err);
      const abortCommand = new s3.AbortMultipartUploadCommand({
        Bucket: multipartUpload.UploadId,
        Key: key,
        UploadId: uploadId,
      });
      await client.send(abortCommand);
    }
  });

  uploadPart = catchAsync(async (req, res) => {
    // 1000 is 1 sec
  req.setTimeout(1000*3600);
  const { videoTitle, file, uploadId, partNumber } = req.body;
  let buffer = req.file.buffer
  let key = `Videos/${videoTitle}`;
  const options = {
    Body: buffer,
    Bucket: config.aws.awsBucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber
  }
  const uploadPart = await client.send(new s3.UploadPartCommand(options));

    res.send(apiResponse({ PartNumber: partNumber, ETag: uploadPart.ETag }));
  });

  completeUpload = catchAsync(async (req, res) => {
    req.setTimeout(1000*10);
    // media id optional (only for edit media)
    const { videoTitle, uploadId, uploadedParts, media_id} = req.body;
    let requestBody, queryOptions;

    let key = `Videos/${videoTitle}`;
    const options = {
      Bucket: config.aws.awsBucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: uploadedParts,
      },
    };

    const completeData = await client.send(new s3.CompleteMultipartUploadCommand(options));

    let video_title = videoTitle.substr(0, videoTitle.length-4);
    if(media_id){ //video is edited
      requestBody = {
        title: video_title,
        media_type: 1,
        media_s3_object_id: key,
        is_active: false,
        is_useable: false,
      }
      queryOptions={
        where: {
          id: media_id,
        }
      }
      let updateVideoKey = await mediaService.update(requestBody, queryOptions);
      return res.send(apiResponse("Video updated successfully", {media_id: updateVideoKey.id, completeData}));
    }

    //create entry at media-db
    requestBody= {
      title: video_title,
      media_type: 1,
      media_s3_object_id: key,
      is_active: false,
      is_useable:false
    }
    let saveVideoKey = await mediaService.create(requestBody);
    
    res.send(apiResponse("Video uploaded successfully",
     {media_id: saveVideoKey.id, completeData}));
  });

  abortUpload = catchAsync(async (req, res) => {
    const { videoTitle, uploadId } = req.body;
    let key = `Videos/${videoTitle}`;
    const abortCommand = new s3.AbortMultipartUploadCommand({
      Bucket: config.aws.awsBucket,
      Key: key,
      UploadId: uploadId,
    });

    await client.send(abortCommand);

    res.send("Video upload aborted")
  });

  deleteMedia = catchAsync(async (req, res) => {
    let { media_id } = req.query;
    let queryOptions,  deletefromS3;
    queryOptions = {
      where: {
        id: media_id,
      },
    };
    const findMedia = await mediaService.findOne(queryOptions);
    if (!findMedia) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media not found");
    }
    const dbTxn = await model.sequelize.transaction();
    queryOptions = {
      where: {
        id: media_id,
      },
      // paranoid: false,
      transaction: dbTxn,
    };
    deletefromS3 = await deleteS3Object(findMedia.media_s3_object_id);
    deletefromS3 = await deleteS3Object(findMedia.thumbnail_s3_object_id);
    

    let deleteMedia = await mediaService.destroy(queryOptions);
    queryOptions = {
      where: {
        media_id: media_id,
      },
      transaction: dbTxn,
    };
    let deleteCourseMedia = await courseMediaService.destroy(queryOptions);
    let deleteCategoryMedia = await categoryMediaService.destroy(queryOptions);
    let deletePreferenceMedia = await preferenceMediaService.destroy(
      queryOptions
    );

    if (!deleteMedia) {
      await dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not delete media");
    }
    await dbTxn.commit();
    res.send(apiResponse("Media deleted successfully"));
  });

  // Save upload media
  saveUploadMedia = catchAsync(async (req, res) => {
    let {
      media_id,
      is_media_uploaded,
      is_thumbnail_uploaded,
      media_title,
      description,
      preference_id,
      category_id,
      course_id,
      time_of_day,
      duration,
      is_useable
    } = req.body;

    let queryOptions = {
      where: {
        id: media_id,
      },
    };

    const findMedia = await mediaService.findOne(queryOptions);
    if (!findMedia) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media not found");
    }
    if (is_media_uploaded=='false') {
      throw new ApiError(statusCodes.BAD_REQUEST, "Media not uploaded please upload it first");
    }
    if (is_thumbnail_uploaded=='false') {
      throw new ApiError(statusCodes.BAD_REQUEST, "Thumbnail not uploaded");
    }

    const dbTxn = await model.sequelize.transaction();
    let requestBody = {
      title: media_title,
      description: description,
      time_of_day: time_of_day,
      duration: duration,
      is_useable: true,
      is_active: true
    };
     queryOptions = {
      where: {
        id: media_id,
      },
      transaction: dbTxn,
    };

    let updateMedia = await mediaService.update(requestBody, queryOptions);
    if (!updateMedia) {
      await dbTxn.rollback();
      throw new ApiError(statusCodes.BAD_REQUEST, "media can't be updated");
    }
    if (course_id) {
      //to check that same media cant be added again and only new media can associated
       queryOptions = {
        where: {
          media_id: media_id,
        },
      };
      const findMedia = await courseMediaService.findOne(queryOptions);
      if (findMedia) {
        throw new ApiError(statusCodes.BAD_REQUEST, "Media already joined course please add only new media");
      }

      let requestBody = {
        course_id: course_id,
        media_id: media_id,
      }
      queryOptions = {
        transaction: dbTxn,
      };
      let createCourseMedia = await courseMediaService.create(
        requestBody,
        queryOptions
      );
      if (!createCourseMedia) {
        await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "course media can't be created");
      }      
    };

    if (preference_id) {
      queryOptions = {
        where: {
          media_id: media_id,
        },
      };
      const findMedia = await preferenceMediaService.findOne(queryOptions);
      if (findMedia) {
        throw new ApiError(statusCodes.BAD_REQUEST, "Media already joined preference please add only new media");
      }
      let requestBody = {
        preference_id: preference_id,
        media_id: media_id,
      };
      
      let createPreferenceMedia = await preferenceMediaService.create(
        requestBody
      );
      if (!createPreferenceMedia) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Preference can't be created"
        );
      }

      if(category_id){
      requestBody = {
        category_id: category_id,
        media_id: media_id,
      };

      let createCategoryMedia = await categoryMediaService.create(requestBody);
      if (!createCategoryMedia) {
        await dbTxn.rollback();
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Category can't be updated"
        );
      }
    }
    }

    await dbTxn.commit();
    res.send(apiResponse("Media Saved successfully"));
  });

  // upload media thumbnail 
  uploadMediaThumbnail = catchAsync( async (req,res) => {
    let { media_id } = req.body;
    let file = req.file;
    if (file.mimetype !== "image/jpg" && file.mimetype !== "image/jpeg"){
      return res.send(apiResponse("Only jpeg or jpg format is allowed", [], 400, true));
    }
    let queryOptions, requestBody, theMedia, saveThumbnail;
    queryOptions = {
      where:{
        id: media_id,
      }
    }
    theMedia = await mediaService.findOne(queryOptions);
    if(!theMedia){
      throw new ApiError(statusCodes[404], "Media doesn't exist");
    }

    let fileData = file.buffer;
    let filename = `${theMedia.title}.jpeg`;
    let s3DestinationUrl = await putMediaThumbnailPhotoObject(
      filename,
      "image/jpeg image/jpg" 
    );
    await axios.put(s3DestinationUrl, fileData, {
      headers : {"Content-Type": "appliation/octet-string"},
    })

    let Key= `Videos/${filename}`;
    const dbTxn = await model.sequelize.transaction();
    requestBody = {
      thumbnail_s3_object_id: Key,
    }
    queryOptions = {
      where:{
        id: media_id,
      },
      transaction: dbTxn,
    }
    saveThumbnail = await mediaService.update(requestBody, queryOptions);
    if(!saveThumbnail){
      await dbTxn.rollback();
        throw new ApiError(statusCodes.BAD_REQUEST, "Preference image could not be uploaded ");
    }
    await dbTxn.commit();
    let theThumbnailLink = await getObjectSignedUrl(Key)
    res.send(apiResponse("Thumbnail Uploaded", {Thumbnail: theThumbnailLink}, 200, true));

  })

}


module.exports = new AdminVideosController();
