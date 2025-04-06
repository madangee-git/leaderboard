const { persistLeaderboards } = require("../services/persistenceService");
const { leaderboards } = require("../services/leaderboardService");
const LeaderboardModel = require("../models/leaderboard");

jest.mock("../models/leaderboard", () => ({
  upsert: jest.fn(),
}));

jest.spyOn(console, "log").mockImplementation(() => {}); // Silence logs
jest.spyOn(console, "error").mockImplementation(() => {}); // Silence errors

beforeEach(() => {
  jest.clearAllMocks();
  leaderboards.clear();
});

describe("persistLeaderboards", () => {
  test("should log and return when leaderboards are empty", async () => {
    await persistLeaderboards();

    expect(console.log).toHaveBeenCalledWith("Persisting leaderboards...");
    expect(console.log).toHaveBeenCalledWith("No leaderboard data to persist.");
    expect(LeaderboardModel.upsert).not.toHaveBeenCalled();
  });

  test("should persist multiple leaderboards correctly", async () => {
    leaderboards.set(
      "game1",
      new Map([
        ["user1", 100],
        ["user2", 200],
      ]),
    );
    leaderboards.set("game2", new Map([["user3", 300]]));

    await persistLeaderboards();

    expect(LeaderboardModel.upsert).toHaveBeenCalledTimes(3);
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game1", userId: "user1", score: 100 },
      { conflictFields: ["gameId", "userId"] },
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game1", userId: "user2", score: 200 },
      { conflictFields: ["gameId", "userId"] },
    );
    expect(LeaderboardModel.upsert).toHaveBeenCalledWith(
      { gameId: "game2", userId: "user3", score: 300 },
      { conflictFields: ["gameId", "userId"] },
    );
  });

  test("should handle database errors gracefully", async () => {
    leaderboards.set("game1", new Map([["user1", 150]]));

    LeaderboardModel.upsert.mockRejectedValue(new Error("DB Error"));

    await persistLeaderboards();

    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
