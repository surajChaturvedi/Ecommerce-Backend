const express = require("express")
const path = require("path")
const { createServer } = require("http");
const statusCodes = require("http-status");
const ApiError = require("./utils/apiError");
const { access } = require("fs");
const { errorConverter, errorHandler } = require("./middlewares/error");
const config = require("./config/config");
const cors = require("cors");

const app = express();

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

const httpServer = createServer(app);

app.use(function (req, res, next) {
  res.header("Content-Type", "application/json");
  next();
});

let corsOptions;
if (config.env === "development" || config.env === "localhost") {
  corsOptions = config.developmentCORSOptions;
}

app.options("*", cors());
app.use(cors(corsOptions));

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(statusCodes.NOT_FOUND, statusCodes[statusCodes.NOT_FOUND]));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = httpServer;