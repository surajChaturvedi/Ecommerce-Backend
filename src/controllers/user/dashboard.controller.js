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
  userPreferenceService,
  UserPointsMonthService,
  preferenceCategoryMediaService,
  preferenceService,
} = require("../../services");
const ApiError = require("../../utils/ApiError");
const model = require("../../models/index");
const { Sequelize } = require("../../models/index");
const levels = require("../../utils/levels");
const { query } = require("express");
const { getObjectSignedUrl } = require("../../utils/s3");
const userPointsDailyService = require("../../services/userPointsDaily.services");
const { Op } = require("sequelize");
const { userDelete } = require("../admin/users.controller");

class DashboardController {
  userProgress = catchAsync(async (req, res) => {
    let queryOptions = {
      where: {
        id: req.userData.id,
      },
      attributes: ["id", "points"],
    };

    let userDetails = await userService.findOne(queryOptions);

    if (!userDetails) {
      throw new ApiError(statusCodes.BAD_REQUEST, "Could not fetch user.");
    }

    let level = levels.find(
      (level) =>
        userDetails.points >= level.min && userDetails.points <= level.max
    );

    let data = {
      points: userDetails.points,
      level: level.level,
      level_max: level.max,
    };
    if (data) {
      res.send(apiResponse("User progress fetched successfully", data));
    } else {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "User progress could not be fetched."
      );
    }
  });

  /**
   * Get Media according to the preference seleted by the user
   */
  userPreferenceVideos = catchAsync(async (req, res) => {
    let { offset, limit } = req.query;
    let queryOptions, userVideos;

    // find user preference
    queryOptions = {
      where: {
        user_id: req.userData.id,
        is_selected:true,
      },
      offset: offset,
      limit: limit,
    };
    let userPreferenceExists = await userPreferenceService.findAll(
      queryOptions
    );
    // if user has no preferences saved, fetch all the videos
    if (userPreferenceExists.length === 0) {
    
      queryOptions = {
        model: model.preferences,
        attributes: [["id", "preference_id"], "title"],
        required: true,
        include: {
          model: model.preference_media,
          attributes: [
            [
              Sequelize.literal('"preference_media->medium"."title"'),
              "title",
            ],
            [
              Sequelize.literal('"preference_media->medium"."id"'),
              "media_id",
            ],
            [
              Sequelize.literal(
                '"preference_media->medium"."duration"'
              ),
              "duration",
            ],
            [
              Sequelize.literal('"preference_media->medium"."rating"'),
              "rating",
            ],
            [
              Sequelize.literal(
                '"preference_media->medium"."description"'
              ),
              "description",
            ],
            [
              Sequelize.literal(
                '"preference_media->medium"."media_s3_object_id"'
              ),
              "media_link",
            ],
            [
              Sequelize.literal(
                '"preference_media->medium"."thumbnail_s3_object_id"'
              ),
              "thumbnail_link",
            ],
          ],
          required: true,
          include: [
            {
              model: model.media,
              require: true,
              attributes: [],
            },
          ],
        },
        offset: offset,
        limit: limit,
      };
      userVideos = await preferenceService.findAll(queryOptions);
      for (let item of userVideos) {
        for (let Anotheritem of item.preference_media) {
          let thumb = await getObjectSignedUrl(Anotheritem.thumbnail_link);
          let vid = await getObjectSignedUrl(Anotheritem.media_link);
          let rating = parseFloat(Anotheritem.rating);
          (Anotheritem.rating = rating + 0.000001),
            (Anotheritem.thumbnail_link = thumb),
            (Anotheritem.media_link = vid);
        }
      }
      for( let item of userVideos){
        item.preference_category_media = item.preference_media;
        delete item.preference_media;
      }
      res.send(
        apiResponse("User Preference Video Fetched", userVideos, 200, true)
      );
    } else {
      queryOptions = {
        subQuery: false,
        attributes: ["user_id", "preference_id"],
        where: {
          user_id: req.userData.id,
          is_selected:true,
        },
        include: [
          {
            model: model.preferences,
            attributes: [["id", "preference_id"], "title"],
            required: true,
            include: {
              model: model.preference_media,
              attributes: [
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."title"'
                  ),
                  "title",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."id"'
                  ),
                  "media_id",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."duration"'
                  ),
                  "duration",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."rating"'
                  ),
                  "rating",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."description"'
                  ),
                  "description",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."media_s3_object_id"'
                  ),
                  "media_link",
                ],
                [
                  Sequelize.literal(
                    '"preference->preference_media->medium"."thumbnail_s3_object_id"'
                  ),
                  "thumbnail_link",
                ],
              ],
              required: true,
              include: [
                {
                  model: model.media,
                  require: true,
                  where:{
                    is_active:true,
                  },
                  attributes: [],
                },
              ],
            },
          },
        ],
        offset: offset,
        limit: limit,
      };

      userVideos = await userPreferenceService.findAll(queryOptions);
      for (let item of userVideos) {
        for (let Anotheritem of item.preference.preference_media) {
          let thumb = await getObjectSignedUrl(Anotheritem.thumbnail_link);
          let vid = await getObjectSignedUrl(Anotheritem.media_link);
          let rating = parseFloat(Anotheritem.rating);
          (Anotheritem.rating = rating + 0.000001),
            (Anotheritem.thumbnail_link = thumb),
            (Anotheritem.media_link = vid);
        }
      }

      let results = [];
      for (let item of userVideos) {
        results.push(item.preference);
      }
      if (userVideos) {
        for(let item of results){
          item.preference_category_media = item.preference_media;
        delete item.preference_media;
        }
        res.send(
          apiResponse("User Preference Video Fetched", results, 200, true)
        );
      } else {
        throw new ApiError(
          statusCodes.BAD_REQUEST,
          "Couldn't fetch user preference videos."
        );
      }
    }
  });
  /**
   * Get media according to the time of day i.e morning, afternoon, night
   */

  getVideos = catchAsync(async (req, res) => {
    let { time_of_day } = req.query;
    let queryOptions = {
      where: {
        time_of_day: time_of_day,
        is_active: true,
      },
      attributes: [
        ["id", "media_id"],
        ["media_s3_object_id", "media_link"],
        "rating",
        "duration",
        "title",
        "description",
        "time_of_day",
        ["thumbnail_s3_object_id", "thumbnail_link"],
      ],
    };
    let media = await mediaService.findAll(queryOptions);
    if (media.length == 0) {
      throw new ApiError(
        statusCodes.BAD_REQUEST,
        "Could not fetch Videos details might time of day is wrong."
      );
    } else {
      for (let item of media) {
        let thumb = await getObjectSignedUrl(item.thumbnail_link);
        let vid = await getObjectSignedUrl(item.media_link);
        let rating = parseFloat(item.rating);
        (item.rating = rating + 0.000001),
          (item.media_link = vid),
          (item.thumbnail_link = thumb);
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
   * Fetches the Leaderboard daily, monthly and all time data
   */
  leaderboard = catchAsync(async (req, res) => {
    let id,
      queryOptions,
      requestBody,
      limit,
      leaderboardPoints,
      usersPoints,
      dateToday,
      startDate;
    let { duration } = req.query; //1-> Today, 2-> Month, 3-> All time
    id = req.userData.id;

    dateToday = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    /**
     * Today Leaderboard
     */
    if (duration == 1) {
      //leaderboard
      startDate.setDate(startDate.getDate() - 1);
      queryOptions = {
        require:true,
        subQuery:false,
        attributes: [
          "user_id",
          [Sequelize.fn("SUM", (Sequelize.literal("point"))), "points"],
          [Sequelize.literal('"user"."first_name"'), "first_name"],
          [Sequelize.literal('"user"."last_name"'), "last_name"],
          [Sequelize.literal('"user"."mds_id"'), "mds_id"],
          [Sequelize.literal('"user"."social_picture"'), "social_picture"],
          [Sequelize.literal('"user"."profile_picture"'), "profile_picture"],
        ],
        where: {
          created_at: {
            [Op.between]: [startDate, dateToday],
          },
        },
        include:[
          {
            model: model.users,
            require: false,
            attributes: [],
            where:{
              is_active:true
            }
          },  
        ],
        group: [
          "user_id",
          '"user"."id"',
        ],
        order: [["points", "DESC"]],
        limit: 10,
      };

      leaderboardPoints = await userPointsDailyService.findAll(queryOptions);
      // let i = 0;
      // //adding all the points of the user
      // while (i < leaderboardPoints.length - 1) {
      //   if (leaderboardPoints[i].user_id == leaderboardPoints[i + 1].user_id) {
      //     leaderboardPoints[i].points += leaderboardPoints[i + 1].points;
      //     leaderboardPoints.splice(i + 1, 1);
      //   } else {
      //     i++;
      //   }
      // }
      // //sorting them according to their points
      // leaderboardPoints.sort((a, b) => b.points - a.points);

      //user's ranking
      queryOptions = {
        subQuery:false,
        attributes: [
          "user_id",
          [Sequelize.fn("SUM", (Sequelize.literal("point"))), "points"],
          [Sequelize.literal('"user"."first_name"'), "first_name"],
          [Sequelize.literal('"user"."last_name"'), "last_name"],
          [Sequelize.literal('"user"."mds_id"'), "mds_id"],
          [Sequelize.literal('"user"."social_picture"'), "social_picture"],
          [Sequelize.literal('"user"."profile_picture"'), "profile_picture"],
          [
            Sequelize.literal(
              `(with my_ranks as (select user_points_daily.user_id, row_number() over (order by sum(point) desc) as rank from user_points_daily group by user_id )select rank from my_ranks where user_id = ${req.userData.id})`
            ),
            "Usersrank",
          ],
        ],
        where: {
          created_at: {
            [Op.between]: [startDate, dateToday],
          },
          user_id: req.userData.id
        },
        include:[
          {
            model: model.users,
            attributes: [],
            where:{
              is_active:true
            }
          },
        ],
        group: [
          "user_id",
          '"user"."id"',
        ],
        order: [["points", "DESC"]],
      };

      usersPoints = await userPointsDailyService.findAll(queryOptions);
    }

    /**
     * month leaderboard
     */
    if (duration == 2) {
      startDate.setDate(startDate.getDate() - 1);
      queryOptions = {
        subQuery:false,
        attributes: [
          "user_id",
          [Sequelize.fn("SUM", (Sequelize.literal("point"))), "points"],
          [Sequelize.literal('"user"."first_name"'), "first_name"],
          [Sequelize.literal('"user"."last_name"'), "last_name"],
          [Sequelize.literal('"user"."mds_id"'), "mds_id"],
          [Sequelize.literal('"user"."social_picture"'), "social_picture"],
          [Sequelize.literal('"user"."profile_picture"'), "profile_picture"],
        ],
        where: {
          created_at: {
            [Op.between]: [startDate, dateToday],
          },
        },
        include:[
          {
            model: model.users,
            require: false,
            attributes: [],
            where:{
              is_active:true
            }
          },
        ],
        group: [
          "user_id",
          '"user"."id"',
        ],
        order: [["points", "DESC"]],
        limit:10,
      };
      leaderboardPoints = await userPointsDailyService.findAll(queryOptions);

      //user's ranking
      queryOptions = {
        require:true,
        subQuery:false,
        attributes: [
          "user_id",
          [Sequelize.fn("SUM", (Sequelize.literal("point"))), "points"],
          [Sequelize.literal('"user"."first_name"'), "first_name"],
          [Sequelize.literal('"user"."last_name"'), "last_name"],
          [Sequelize.literal('"user"."mds_id"'), "mds_id"],
          [Sequelize.literal('"user"."social_picture"'), "social_picture"],
          [Sequelize.literal('"user"."profile_picture"'), "profile_picture"],
          [
            Sequelize.literal(
              `(with my_ranks as (select user_points_daily.user_id, row_number() over (order by sum(point) desc) as rank from user_points_daily group by user_id )select rank from my_ranks where user_id = ${req.userData.id})`
            ),
            "Usersrank",
          ],
        ],
        where: {
          created_at: {
            [Op.between]: [startDate, dateToday],
          },
          user_id: req.userData.id
        },
        include:[
          {
            model: model.users,
            require: false,
            attributes: [],
            where:{
              is_active:true
            },
          },
        ],
        group: [
          "user_id",
          '"user"."id"',
        ],
        order: [["points", "DESC"]],
      };
        

      usersPoints = await userPointsDailyService.findAll(queryOptions);
    }
    /**
     * all time leaderboard
     */
    if (duration == 3) {
      //Leaderboard Ranking
      queryOptions = {
        attributes: [
          "first_name",
          "last_name",
          "mds_id",
          "points",
          "social_picture",
          "profile_picture",
        ],
        where: {
          user_type: 1,
          is_active: true,
        },
        limit: 10,
        order: [["points", "DESC"], "updated_at"],
        limit:10,
      };
      leaderboardPoints = await userService.findAll(queryOptions);

      //users Ranking
      queryOptions = {
        attributes: [
          ["id", "user_id"],
          "points",
          "first_name",
          "last_name",
          "mds_id",
          "profile_picture",
          "social_picture",
          [
            Sequelize.literal(
              `(with my_ranks as ( select users.id, row_number() over (order by points desc) as rank from users )select rank from my_ranks where id = ${req.userData.id})`
            ),
            "Usersrank",
          ],
        ],
        where: {
          id: req.userData.id,
          is_active:true
        },
      };
      usersPoints = await userService.findAll(queryOptions);
    }

    for (let item of leaderboardPoints) {
      let signedPicUrl;
      if (item.profile_picture == null || item.profile_picture == "") {
        delete item.profile_picture;
        item["profile_picture"] = item["social_picture"];
        delete item.social_picture;
      } else {
        delete item.social_picture;
        signedPicUrl = await getObjectSignedUrl(item.profile_picture);
        item.profile_picture = signedPicUrl;
      }
    }

    // finding the user's profile or social picture
    if (usersPoints[0].profile_picture) {
      let img = await getObjectSignedUrl(usersPoints[0].profile_picture);
      (usersPoints[0].profile_picture = img), delete usersPoints[0].social_picture;
    } else {
      usersPoints[0].profile_picture = usersPoints[0].social_picture;
      delete usersPoints[0].social_picture;
    }
    // let userDetails = [];
    // userDetails.push(usersPoints)
    if (usersPoints || leaderboardPoints) {
      res.send(
        apiResponse(
          "Leaderboard Data Fetched Successfully",
          { usersPoints, leaderboardPoints },
          200,
          true
        )
      );
    } else {
      throw new ApiError(404, "Leaderboard data could not be fetched");
    }
  });
}
module.exports = new DashboardController();
