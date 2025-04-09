const redisClient = require("../database/redis");
const LeaderboardModel = require("../models/leaderboard");
const { persistLeaderboards } = require("../services/persistenceService");

jest.mock("../database/redis", () => ({
  keys: jest.fn(),
  zrange: jest.fn(),
}));

jest.mock("../models/leaderboard", () => ({
  upsert: jest.fn(),
}));

describe("persistLeaderboards", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should log and return if no leaderboard data exists in Redis", async () => {
    redisClient.keys.mockResolvedValue([]); // Simulate no keys found in Redis

    console.log = jest.fn();
    await persistLeaderboards();

    expect(console.log).toHaveBeenCalledWith("No leaderboard data to persist.");
    expect(redisClient.keys).toHaveBeenCalledWith("leaderboard:*");
  });

  test("should fetch leaderboards from Redis and persist them in the database", async () => {
    redisClient.keys.mockResolvedValue(["leaderboard:game1"]);
    redisClient.zrange.mockResolvedValue(["user1", "100", "user2", "90"]);

    await persistLeaderboards();

    expect(redisClient.zrange).toHaveBeenCalledWith(
      "leaderboard:game1",
      0,
      -1,
      "WITHSCORES",
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game1", userId: "user1", score: 100 },
      { conflictFields: ["gameId", "userId"] },
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game1", userId: "user2", score: 90 },
      { conflictFields: ["gameId", "userId"] },
    );
  });

  test("should continue processing even if Redis fails while fetching leaderboard data", async () => {
    redisClient.keys.mockResolvedValue([
      "leaderboard:game1",
      "leaderboard:game2",
    ]);
    redisClient.zrange.mockImplementation((key) => {
      if (key === "leaderboard:game1")
        return Promise.reject(new Error("Redis fetch failed"));
      return Promise.resolve(["user1", "50"]);
    });

    console.error = jest.fn();
    await persistLeaderboards();

    expect(console.error).toHaveBeenCalledWith(
      `Redis error while fetching leaderboard for gameId: game1`,
      expect.any(Error),
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game2", userId: "user1", score: 50 },
      { conflictFields: ["gameId", "userId"] },
    );
  });

  test("should log error and continue if database insert fails for a user", async () => {
    redisClient.keys.mockResolvedValue(["leaderboard:game1"]);
    redisClient.zrange.mockResolvedValue(["user1", "100", "user2", "90"]);

    LeaderboardModel.upsert.mockImplementation(({ userId }) => {
      if (userId === "user1") return Promise.reject(new Error("DB error"));
      return Promise.resolve();
    });

    console.error = jest.fn();
    await persistLeaderboards();

    expect(console.error).toHaveBeenCalledWith(
      `Database error while persisting leaderboard for gameId: game1, userId: user1`,
      expect.any(Error),
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledTimes(2); // Both users processed
  });

  test("should log error if fetching leaderboard keys from Redis fails", async () => {
    redisClient.keys.mockRejectedValue(new Error("Redis connection failed"));

    console.error = jest.fn();
    await persistLeaderboards();

    expect(console.error).toHaveBeenCalledWith(
      "Critical error while fetching leaderboard keys from Redis:",
      expect.any(Error),
    );
    expect(redisClient.zrange).not.toHaveBeenCalled();
  });
});
