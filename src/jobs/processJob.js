require("dotenv").config();
const { Queue } = require("bullmq");

const connection = {
  connection: {
    url: process.env.REDIS_URL
  }
};

const processJobQueue = new Queue("process_job", connection);

module.exports = { processJobQueue };
