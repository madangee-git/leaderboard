const redisClient = require("../database/redis");
const { POPULARITY_COUNT, MAX_POPULAR_GAMES } = require("../config/settings");

const leaderboards = new Map(); // In-memory cache for popular games
const accessOrder = new Set(); // Track access order for LRU eviction

/**
 * Update score for a user in a game.
 * Updates the score in Redis, tracks active users, and caches in-memory if popular.
 */
async function updateScore(gameId, userId, score) {
  if (!gameId || !userId) {
    throw new Error("gameId and userId should be provided");
  }

  try {
    await redisClient.zadd(`leaderboard:${gameId}`, score, userId);
    await redisClient.sadd(`game:${gameId}:activeUsers`, userId);

    // Need not re-cache this whenever there is an update to popular game
    // The current approach is simple but could lead to inefficiencies in high-traffic scenarios.
    // LRU strategy will take care of clearing the cache when the game becomes less accessed

    if (await isPopularGame(gameId)) {
      await cacheLeaderboardInMemory(gameId);
    }
  } catch (error) {
    console.error(`Error updating score for game ${gameId}:`, error);
    throw new Error("Failed to update score due to an internal error.");
  }
}

/**
 * Fetch leaderboard for a game.
 * Retrieves data from in-memory cache if available, otherwise from Redis.
 */
async function getLeaderboard(gameId, limit = 10) {
  if (!gameId) {
    throw new Error("gameId is required");
  }

  // Popular games will have the data in-memory
  if (leaderboards.has(gameId)) {
    console.log(`Fetching leaderboard from memory for game ${gameId}`);
    return getLeaderboardFromMemory(gameId, limit);
  }

  try {
    console.log(`Fetching leaderboard from Redis for game ${gameId}`);
    return await getLeaderboardFromRedis(gameId, limit);
  } catch (error) {
    console.error(
      `Error fetching leaderboard from Redis for game ${gameId}:`,
      error,
    );
    return [];
  }
}

/**
 * Fetch leaderboard from Redis.
 * Returns formatted leaderboard or an empty list if Redis operation fails.
 */
async function getLeaderboardFromRedis(gameId, limit) {
  try {
    const redisData = await redisClient.zrevrange(
      `leaderboard:${gameId}`,
      0,
      limit - 1,
      "WITHSCORES",
    );
    return formatLeaderboard(redisData);
  } catch (error) {
    console.error(
      `Error fetching leaderboard from Redis for game ${gameId}:`,
      error,
    );
    return [];
  }
}

/**
 * Fetch leaderboard from in-memory cache.
 * Ensures sorted order before returning results.
 */
function getLeaderboardFromMemory(gameId, limit) {
  const leaderboard = leaderboards.get(gameId) || new Map();
  return Array.from(leaderboard.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId, score]) => ({ userId, score }));
}

/**
 * Check if a game is popular based on the number of active users.
 * Returns `true` if popular, otherwise `false`.
 */
async function isPopularGame(gameId) {
  try {
    const activeUsers = await redisClient.scard(`game:${gameId}:activeUsers`);
    return activeUsers && parseInt(activeUsers, 10) > POPULARITY_COUNT;
  } catch (error) {
    console.error(`Error checking popularity for game ${gameId}:`, error);
    return false;
  }
}

/**
 * Cache leaderboard in memory for popular games.
 * Stores leaderboard data in a local Map and maintains LRU eviction.
 */
async function cacheLeaderboardInMemory(gameId) {
  console.log(`Caching leaderboard in memory for game ${gameId}`);

  try {
    const redisData = await redisClient.zrevrange(
      `leaderboard:${gameId}`,
      0,
      -1,
      "WITHSCORES",
    );
    const leaderboard = new Map();

    for (let i = 0; i < redisData.length; i += 2) {
      leaderboard.set(redisData[i], Number(redisData[i + 1]));
    }

    leaderboards.set(gameId, leaderboard);
    accessOrder.delete(gameId);
    accessOrder.add(gameId);
    evictIfNeeded();
  } catch (error) {
    console.error(
      `Error caching leaderboard in memory for game ${gameId}:`,
      error,
    );
  }
}

/**
 * Evict least recently used game from memory if the cache exceeds the limit.
 */
function evictIfNeeded() {
  if (leaderboards.size > MAX_POPULAR_GAMES) {
    const oldestGame = accessOrder.values().next().value;
    if (oldestGame) {
      console.log(`Evicting least recently used game: ${oldestGame}`);
      leaderboards.delete(oldestGame);
      accessOrder.delete(oldestGame);
    }
  }
}

/**
 * Format Redis data into an array of objects.
 * Ensures structured leaderboard output.
 */
function formatLeaderboard(redisData) {
  const formatted = [];
  for (let i = 0; i < redisData.length; i += 2) {
    formatted.push({ userId: redisData[i], score: Number(redisData[i + 1]) });
  }
  return formatted;
}

module.exports = {
  updateScore,
  getLeaderboard,
  leaderboards,
  isPopularGame,
  evictIfNeeded,
};
