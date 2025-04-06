const { leaderboards } = require("./leaderboardService");
const LeaderboardModel = require("../models/leaderboard");

// This function persists the leaderboard data to the database.
// It iterates through the in-memory leaderboards and updates the database.

async function persistLeaderboards() {
  console.log("Persisting leaderboards...");
  if (leaderboards.size === 0) {
    console.log("No leaderboard data to persist.");
    return;
  }

  for (const [gameId, scores] of leaderboards.entries()) {
    for (const [userId, score] of scores.entries()) {
      try {
        await LeaderboardModel.upsert(
          { gameId, userId, score },
          { conflictFields: ["gameId", "userId"] },
        );
      } catch (error) {
        console.error(
          `Failed to persist leaderboard for gameId: ${gameId}, userId: ${userId}`,
          error,
        );
      }
    }
  }
}

module.exports = { persistLeaderboards };
