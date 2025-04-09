const redisClient = require("../database/redis");
const LeaderboardModel = require("../models/leaderboard");
const { persistLeaderboards } = require("../services/persistenceService");
const { sequelize } = require("../database/postgres");

jest.mock("../database/redis", () => ({
  keys: jest.fn(),
  zrange: jest.fn(),
}));

jest.mock("../models/leaderboard", () => ({
  bulkCreate: jest.fn(),
}));

jest.mock("../database/postgres", () => ({
  sequelize: {
    transaction: jest.fn((callback) =>
      callback({ commit: jest.fn(), rollback: jest.fn() }),
    ),
  },
}));

describe("persistLeaderboards", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should log and return if no leaderboard data exists in Redis", async () => {
    redisClient.keys.mockResolvedValue([]); // No keys found in Redis

    console.log = jest.fn();
    await persistLeaderboards();

    expect(console.log).toHaveBeenCalledWith("No leaderboard data to persist.");
    expect(redisClient.keys).toHaveBeenCalledWith("leaderboard:*");
  });

  test("should fetch leaderboards from Redis and persist them in the database in a batch transaction", async () => {
    redisClient.keys.mockResolvedValue(["leaderboard:game1"]);
    redisClient.zrange.mockResolvedValue(["user1", "100", "user2", "90"]);

    await persistLeaderboards();

    expect(redisClient.zrange).toHaveBeenCalledWith(
      "leaderboard:game1",
      0,
      -1,
      "WITHSCORES",
    );

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(LeaderboardModel.bulkCreate).toHaveBeenCalledWith(
      [
        { gameId: "game1", userId: "user1", score: 100 },
        { gameId: "game1", userId: "user2", score: 90 },
      ],
      { updateOnDuplicate: ["score"], transaction: expect.any(Object) },
    );
  });

  test("should continue processing other games even if Redis fails for one leaderboard", async () => {
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

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(LeaderboardModel.bulkCreate).toHaveBeenCalledWith(
      [{ gameId: "game2", userId: "user1", score: 50 }],
      { updateOnDuplicate: ["score"], transaction: expect.any(Object) },
    );
  });

  test("should log error and continue if database transaction fails", async () => {
    redisClient.keys.mockResolvedValue(["leaderboard:game1"]);
    redisClient.zrange.mockResolvedValue(["user1", "100", "user2", "90"]);

    sequelize.transaction.mockImplementationOnce(() =>
      Promise.reject(new Error("DB Transaction Failed")),
    );

    console.error = jest.fn();
    await persistLeaderboards();

    expect(LeaderboardModel.bulkCreate).not.toHaveBeenCalled();
  });

  test("should log critical error if fetching leaderboard keys from Redis fails", async () => {
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
