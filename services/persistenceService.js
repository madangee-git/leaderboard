const redisClient = require("../database/redis");
const LeaderboardModel = require("../models/leaderboard");
const { sequelize } = require("../database/postgres");

// TODO Need to move this to a separate container so that this runs as a singleton

async function persistLeaderboards() {
  console.log("Persisting leaderboards...");

  try {
    // Fetch all game leaderboard keys from Redis
    const gameKeys = await redisClient.keys("leaderboard:*");

    if (!Array.isArray(gameKeys) || gameKeys.length === 0) {
      console.log("No leaderboard data to persist.");
      return;
    }

    for (const gameKey of gameKeys) {
      const gameId = gameKey.split(":")[1]; // Extract gameId from key

      try {
        // Fetch leaderboard data from Redis
        const redisData = await redisClient.zrange(
          gameKey,
          0,
          -1,
          "WITHSCORES",
        );

        if (!Array.isArray(redisData) || redisData.length === 0) {
          console.warn(
            `No leaderboard data found in Redis for gameId: ${gameId}`,
          );
          continue;
        }

        // Convert Redis data into an array of { gameId, userId, score } objects
        const leaderboardEntries = redisData.reduce((acc, val, idx, arr) => {
          if (idx % 2 === 0) {
            acc.push({ gameId, userId: val, score: Number(arr[idx + 1]) });
          }
          return acc;
        }, []);

        // Persist entries in a batch transaction
        await sequelize.transaction(async (transaction) => {
          await LeaderboardModel.bulkCreate(leaderboardEntries, {
            updateOnDuplicate: ["score"], // Ensure it updates existing entries
            transaction,
          });
        });

        console.log(`Successfully persisted leaderboard for gameId: ${gameId}`);
      } catch (redisError) {
        console.error(
          `Redis error while fetching leaderboard for gameId: ${gameId}`,
          redisError,
        );
      }
    }
  } catch (error) {
    console.error(
      "Critical error while fetching leaderboard keys from Redis:",
      error,
    );
  }
}

module.exports = { persistLeaderboards };
