const redisClient = require("../database/redis");
const { Mutex } = require("async-mutex");

const { POPULARITY_COUNT, MAX_IN_MEMORY_GAMES } = require("../config/settings");

const leaderboards = new Map(); // In-memory leaderboard storage

// Track access order using a Set (used for LRU)
const accessOrder = new Set();

// Locks for synchronization
const mutex = new Mutex(); // Create a lock instance

// This function updates the score for a user in a game.
// It updates the in-memory leaderboard and checks if the game is popular.
// If it is, it caches the leaderboard in Redis.


async function updateScore(gameId, userId, score) {
    if (!gameId || !userId) {
        throw new Error("gameId and userId should be provided");
    }

    // TODO mutex will add a delay - as alternate may read the scores from a message Q 
    // and do the operation in a worker thread
    // or use a full Redis based approach for thread safety instead of an in-memory map

    await mutex.runExclusive(async () => { // Lock execution per gameId
        if (!leaderboards.has(gameId)) {
            leaderboards.set(gameId, new Map());
        }
    
        // Update access order for LRU eviction
        accessOrder.delete(gameId);
        accessOrder.add(gameId);

        // Evict if needed
        evictIfNeeded();

        // Update in-memory leaderboard
        leaderboards.get(gameId).set(userId, score);

        // Update game popularity based on active users in the game
        try {
            await updateGamePopularity(gameId, userId);

            if (await isPopularGame(gameId)) {
                console.log(`Game ${gameId} is now popular. Caching leaderboard to Redis.`);

                // Check if this is the first time caching (i.e., Redis leaderboard doesn't exist yet)
                const isCached = await redisClient.exists(`leaderboard:${gameId}`);
                if (!isCached) {
                    await cacheEntireLeaderboard(gameId); // Dump in-memory leaderboard to Redis
                }

                // Always update score in Redis for popular games
                try {
                    // TODO set TTL for the leaderboard in redis and refresh the cache when accessed
                    // Use a configurable time to live (TTL) for the leaderboard
                    await redisClient.zadd(`leaderboard:${gameId}`, score, userId);
                } catch (error) {
                    console.error(`Error caching score for game ${gameId}:`, error);
                }
            }
        } catch (error) {
            console.error(`Error checking if game ${gameId} is popular:`, error);
        }
    });
}

/**
 * Evicts the least recently used (LRU) game if memory exceeds threshold.
 */
function evictIfNeeded() {
    if (leaderboards.size > MAX_IN_MEMORY_GAMES) {
        // Get the oldest accessed game
        const oldestGame = accessOrder.values().next().value;
        if (oldestGame) {
            console.log(`Evicting least recently used game: ${oldestGame}`);
            leaderboards.delete(oldestGame);
            accessOrder.delete(oldestGame);
        }
    }
}

// This function retrieves the leaderboard for a game.
// It checks if the leaderboard is cached in Redis.
// If it is, it fetches the leaderboard from Redis.
// If not, it checks if the game is popular.
// If it is, it caches the entire leaderboard in Redis.
// If the game is not popular, it fetches the leaderboard from in-memory storage.

// TODO might require paginations as per the requested limit
// TODO For cache misses - read the entire leaderboard from the database and cache it in memory
async function getLeaderboard(gameId, limit = 10) {
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

    console.log(`Game not popular yet - fetching leaderboard from memory for game ${gameId}`);
    // Refresh access order
    accessOrder.delete(gameId);
    accessOrder.add(gameId);
    // TODO fallback to database fetch if data is not available in memory - may have been evicted?
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

// This function formats the Redis data into an array of objects
// to be consistent with the in-memory leaderboard format.
function formatLeaderboard(redisData) {
    const formatted = [];
    for (let i = 0; i < redisData.length; i += 2) {
        formatted.push({
            userId: redisData[i],
            score: Number(redisData[i + 1]),
        });
    }
    return formatted;
}

// This function updates the game popularity in Redis.
// It adds the user to a set of active users for the game.
// This is used to track active users for each game.
async function updateGamePopularity(gameId, userId) {
    await redisClient.sadd(`game:${gameId}:activeUsers`, userId); // Add user to set
}

// This function checks if a game is popular based on the number of active users.
// It retrieves the count of active users from Redis.
async function isPopularGame(gameId) {
    const activeUsers = await redisClient.scard(`game:${gameId}:activeUsers`);
    return activeUsers && parseInt(activeUsers, 10) > POPULARITY_COUNT;
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
    isPopularGame,
    evictIfNeeded,
};
