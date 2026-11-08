const { Queue } = require('bullmq');
const redisClient = require('../config/redis');

const scorecardQueue = new Queue('scorecard-processing', {
  connection: redisClient
});

module.exports = scorecardQueue;
