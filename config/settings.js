require("dotenv").config();

module.exports = {
  PERSIST_INTERVAL: process.env.PERSIST_INTERVAL || 60, // Default 1 hour
  POPULARITY_COUNT: parseInt(process.env.POPULARITY_COUNT, 10) || 1000, // Default 1000
  MAX_IN_MEMORY_GAMES: parseInt(process.env.MAX_IN_MEMORY_GAMES, 10) || 100, // Default 100
};
