/*
 * CopperDigital Inc
 * Copyright (c) 2023-Present Copper Digital
 * Contact at copper digital dot com
 */

//user Controllers
module.exports.userAuthController = require("./user/auth.controller");
module.exports.userOnboardingController = require("./user/onboarding.controller");
module.exports.userProfileController = require("./user/profile.controller");
module.exports.userCourseController = require("./user/course.controller");
module.exports.userDashboardController = require("./user/dashboard.controller");
module.exports.userMediaController = require("./user/media.controller");

// admin controllers
module.exports.adminAuthController = require("./admin/auth.controller");
module.exports.adminUsersController = require("./admin/users.controller");
module.exports.adminPreferencesController = require("./admin/preferences.controller");
module.exports.adminCategoriesController = require("./admin/categories.controller");
module.exports.adminMediaController = require("./admin/media.controller");
module.exports.adminCommonController = require("./admin/common.controller");
module.exports.adminCoursesController = require("./admin/courses.controller")