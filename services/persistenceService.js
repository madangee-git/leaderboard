const redisClient = require("../database/redis");
const LeaderboardModel = require("../models/leaderboard");

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

        // Convert Redis data into an array of { userId, score } objects
        const leaderboardEntries = [];
        for (let i = 0; i < redisData.length; i += 2) {
          leaderboardEntries.push({
            userId: redisData[i],
            score: Number(redisData[i + 1]),
          });
        }

        // Persist each leaderboard entry to the database
        for (const { userId, score } of leaderboardEntries) {
          try {
            await LeaderboardModel.upsert(
              { gameId, userId, score },
              { conflictFields: ["gameId", "userId"] },
            );
          } catch (dbError) {
            console.error(
              `Database error while persisting leaderboard for gameId: ${gameId}, userId: ${userId}`,
              dbError,
            );
          }
        }
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
