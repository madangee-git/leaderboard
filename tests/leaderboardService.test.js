const {
  updateScore,
  getLeaderboard,
  leaderboards,
  isPopularGame,
  evictIfNeeded,
} = require("../services/leaderboardService");
const redisClient = require("../database/redis");
const { POPULARITY_COUNT, MAX_POPULAR_GAMES } = require("../config/settings");

jest.mock("../database/redis");

beforeEach(() => {
  jest.clearAllMocks();
  leaderboards.clear();
});

describe("Leaderboard Service", () => {
  describe("updateScore", () => {
    test("should update score in Redis", async () => {
      redisClient.zadd.mockResolvedValue(1);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1); // Popular game

      redisClient.zadd.mockResolvedValue(1);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);
      redisClient.zrevrange.mockResolvedValue(["user1", "100", "user2", "90"]);

      await updateScore("game1", "user1", 100);

      expect(redisClient.zadd).toHaveBeenCalledWith(
        "leaderboard:game1",
        100,
        "user1",
      );
      expect(redisClient.sadd).toHaveBeenCalledWith(
        "game:game1:activeUsers",
        "user1",
      );
    });

    test("should cache leaderboard in memory for popular games", async () => {
      redisClient.zadd.mockResolvedValue(1);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);
      redisClient.zrevrange.mockResolvedValue(["user1", "100", "user2", "90"]);

      await updateScore("game1", "user1", 100);

      expect(leaderboards.has("game1")).toBe(true);
      expect(Array.from(leaderboards.get("game1"))).toEqual([
        ["user1", 100],
        ["user2", 90],
      ]);
    });

    test("should throw an error if gameId is missing", async () => {
      await expect(updateScore(null, "user1", 100)).rejects.toThrow(
        "gameId and userId should be provided",
      );
    });

    test("should throw an error if userId is missing", async () => {
      await expect(updateScore("game1", null, 100)).rejects.toThrow(
        "gameId and userId should be provided",
      );
    });

    test("should handle Redis failure gracefully", async () => {
      redisClient.zadd.mockRejectedValue(new Error("Redis error"));

      await expect(updateScore("game1", "user1", 100)).rejects.toThrow(
        "Failed to update score due to an internal error",
      );
    });
  });

  describe("getLeaderboard", () => {
    test("should fetch leaderboard from memory if available", async () => {
      leaderboards.set(
        "game1",
        new Map([
          ["user1", 100],
          ["user2", 90],
        ]),
      );

      const leaderboard = await getLeaderboard("game1");

      expect(leaderboard).toEqual([
        { userId: "user1", score: 100 },
        { userId: "user2", score: 90 },
      ]);
    });

    test("should fetch leaderboard from Redis if not in memory", async () => {
      redisClient.zrevrange.mockResolvedValue(["user1", "100", "user2", "90"]);

      const leaderboard = await getLeaderboard("game1");

      expect(redisClient.zrevrange).toHaveBeenCalledWith(
        "leaderboard:game1",
        0,
        9,
        "WITHSCORES",
      );
      expect(leaderboard).toEqual([
        { userId: "user1", score: 100 },
        { userId: "user2", score: 90 },
      ]);
    });

    test("should return empty leaderboard when Redis has no data", async () => {
      redisClient.zrevrange.mockResolvedValue([]);

      const leaderboard = await getLeaderboard("game1");

      expect(leaderboard).toEqual([]);
    });

    test("should handle Redis failure gracefully", async () => {
      redisClient.zrevrange.mockRejectedValue(new Error("Redis error"));

      const leaderboard = await getLeaderboard("game1");

      expect(leaderboard).toEqual([]); // Fallback to empty array
    });
  });

  describe("isPopularGame", () => {
    test("should return true when active users exceed threshold", async () => {
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);

      const isPopular = await isPopularGame("game1");

      expect(isPopular).toBe(true);
    });

    test("should return false when active users are below threshold", async () => {
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT - 1);

      const isPopular = await isPopularGame("game1");

      expect(isPopular).toBe(false);
    });

    test("should handle Redis failures gracefully", async () => {
      redisClient.scard.mockRejectedValue(new Error("Redis error"));

      const isPopular = await isPopularGame("game1");

      expect(isPopular).toBe(false); // Fallback to false
    });
  });

  describe("cacheLeaderboardInMemory", () => {
    test("should cache leaderboard correctly", async () => {
      redisClient.zadd.mockResolvedValue(1);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);
      redisClient.zrevrange.mockResolvedValue(["user1", "100", "user2", "90"]);

      await updateScore("game1", "user1", 100);

      expect(leaderboards.has("game1")).toBe(true);
      expect(Array.from(leaderboards.get("game1"))).toEqual([
        ["user1", 100],
        ["user2", 90],
      ]);
    });

    test("should evict least recently used (LRU) game when cache exceeds limit", async () => {
      // Simulating MAX_POPULAR_GAMES being reached
      for (let i = 1; i <= MAX_POPULAR_GAMES; i++) {
        leaderboards.set(`game${i}`, new Map([["user1", i * 10]]));
      }
      // Add one more game to trigger eviction
      leaderboards.set("gameX", new Map([["userX", 999]]));

      evictIfNeeded();

      // Expect the first inserted game to be evicted
      expect(leaderboards.has("game1")).toBe(false);
      expect(leaderboards.has("gameX")).toBe(true);
    });
  });
});
