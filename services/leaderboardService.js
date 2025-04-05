const redisClient = require("../database/redis");
const { POPULARITY_COUNT } = require("../config/settings");

const leaderboards = new Map(); // In-memory leaderboard storage

// This function updates the score for a user in a game.
// It checks if the game is popular and caches the score in Redis if it is.
// It also updates the in-memory leaderboard.
// If the game is not popular, it updates the in-memory leaderboard only.

async function updateScore(gameId, userId, score) {
    if (!gameId) {
        throw new Error("gameId cannot be null or undefined");
    }
    if (!userId) {
        throw new Error("userId cannot be null or undefined");
    }
    // Update in-memory leaderboard    
    if (!leaderboards.has(gameId)) {
        leaderboards.set(gameId, new Map());
    }
    leaderboards.get(gameId).set(userId, score);

    // If game is popular, update Redis cache
    try {
        if (await isPopularGame(gameId)) {
            console.log(`Caching score for popular game ${gameId}`);
            try {
                await redisClient.zadd(`leaderboard:${gameId}`, score, userId);
            } catch (error) {
                console.error(`Error caching score for game ${gameId}:`, error);
            }
        }
    } catch (error) {
        console.error(`Error checking if game ${gameId} is popular:`, error);
    }
}

// This function retrieves the leaderboard for a game.
// It checks if the leaderboard is cached in Redis.
// If it is, it fetches the leaderboard from Redis.
// If not, it checks if the game is popular.
// If it is, it caches the entire leaderboard in Redis.
// If the game is not popular, it fetches the leaderboard from in-memory storage.

async function getLeaderboard(gameId, limit = 10) {
    try {
        await updateGamePopularity(gameId);
    } catch (error) {
        console.error(`Error updating game popularity for game ${gameId}:`, error);
    }

    try {
        if (await redisClient.exists(`leaderboard:${gameId}`)) {
            console.log(`Fetching leaderboard from Redis for game ${gameId}`);
            try {
                return await getLeaderboardFromRedis(gameId, limit);
            } catch (error) {
                console.error(`Error fetching leaderboard from Redis for game ${gameId}:`, error);
            }
        }
    } catch (error) {
        console.error(`Error checking Redis existence for game ${gameId}:`, error);
    }

    try {
        if (await isPopularGame(gameId)) {
            console.log(`Caching entire leaderboard for popular game ${gameId}`);
            try {
                await cacheEntireLeaderboard(gameId);
            } catch (error) {
                console.error(`Error caching entire leaderboard for game ${gameId}:`, error);
            }
        }
    } catch (error) {
        console.error(`Error checking if game ${gameId} is popular:`, error);
    }

    console.log(`Game not popular yet - fetching leaderboard from memory for game ${gameId}`);
    return getLeaderboardFromMemory(gameId, limit);
}

// This function retrieves the leaderboard from Redis.
// It fetches the top N entries from the sorted set in Redis.
// The leaderboard is sorted by score in descending order.

async function getLeaderboardFromRedis(gameId, limit) {
    const redisData = await redisClient.zrevrange(`leaderboard:${gameId}`, 0, limit - 1, "WITHSCORES");
    return formatLeaderboard(redisData);
}

// This function retrieves the leaderboard from in-memory storage.
// It sorts the entries by score in descending order and limits the result to the top N entries.
// The leaderboard is stored in a Map, where the key is the userId and the value is the score.
// The function converts the Map to an array of objects with userId and score properties.

function getLeaderboardFromMemory(gameId, limit) {
    const leaderboard = leaderboards.get(gameId) || new Map();

    // Convert map to sorted array (fast extraction of top N)
    const sortedEntries = Array.from(leaderboard.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by score descending
        .slice(0, limit); // Limit to top N

    return sortedEntries.map(([userId, score]) => ({ userId, score }));
}

// This function formats the Redis data into an array of objects.

function formatLeaderboard(redisData) {
    const formatted = [];
    for (let i = 0; i < redisData.length; i += 2) {
        formatted.push({
            userId: redisData[i],
            score: Number(redisData[i + 1])
        });
    }
    return formatted;
}

// This function updates the popularity of a game.
// It increments the hit count for the game in Redis.
// This is used to track the number of times a game has been accessed.
// If the hit count exceeds the POPULARITY_COUNT threshold, the game is considered popular.

async function updateGamePopularity(gameId) {
    await redisClient.incr(`game:${gameId}:hits`);
}

// This function checks if a game is popular.
// It retrieves the hit count from Redis and checks if it exceeds the POPULARITY_COUNT threshold.

async function isPopularGame(gameId) {
    const hits = await redisClient.get(`game:${gameId}:hits`);
    return hits && parseInt(hits, 10) > POPULARITY_COUNT
}

// This function caches the entire leaderboard for a game in Redis.
// It retrieves the leaderboard from in-memory storage and stores it in Redis.
// This is done in a batch operation to improve performance.

async function cacheEntireLeaderboard(gameId) {
    const gameLeaderboard = leaderboards.get(gameId);
    if (!gameLeaderboard || gameLeaderboard.size === 0) return;

    const pipeline = redisClient.pipeline(); // Batch Redis operations

    for (const [userId, score] of gameLeaderboard.entries()) {
        pipeline.zadd(`leaderboard:${gameId}`, score, userId);
    }

    await pipeline.exec(); // Execute all commands at once
    console.log(`Cached entire leaderboard for game ${gameId} to Redis.`);
}

module.exports = { 
    updateScore, 
    getLeaderboard, 
    leaderboards,
    isPopularGame
};