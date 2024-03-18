const httpServer = require("./app");
const config = require("./config/config");

const server = httpServer.listen(config.port, () => {
  console.log(`Listening to port ${config.port}`);
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      console.log("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  console.log(error);
  exitHandler();
};