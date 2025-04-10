const request = require("supertest");
const express = require("express");
const leaderboardRoutes = require("../api/routes");
const leaderboardService = require("../services/leaderboardService");

jest.mock("../services/leaderboardService");

const app = express();
app.use(express.json());
app.use("/leaderboard", leaderboardRoutes);

describe("Leaderboard API Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /v1/leaderboard/:gameId should return leaderboard data", async () => {
    const mockLeaderboard = [{ userId: "user1", score: 100 }];
    leaderboardService.getLeaderboard.mockResolvedValue(mockLeaderboard);

    const response = await request(app).get("/leaderboard/game123");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: "game123",
      leaderboard: mockLeaderboard,
    });
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(
      "game123",
      10,
    );
  });

  test("GET /v1/leaderboard/:gameId should return 400 for invalid gameId", async () => {
    const response = await request(app).get("/leaderboard/%20");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid gameId" });
  });

  test("GET /v1/leaderboard/:gameId should return 500 on service failure", async () => {
    leaderboardService.getLeaderboard.mockRejectedValue(new Error("DB Error"));

    const response = await request(app).get("/leaderboard/game123");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to fetch leaderboard" });
  });

  test("POST /v1/leaderboard/:gameId/update-score should update score", async () => {
    leaderboardService.updateScore.mockResolvedValue();

    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: 50,
        timestamp: new Date().toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Score updated successfully" });
    expect(leaderboardService.updateScore).toHaveBeenCalledWith(
      "game123",
      "user1",
      50,
    );
  });

  test("POST /v1/leaderboard/:gameId/update-score should return 400 for missing fields", async () => {
    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({ userId: "user1", score: 50 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  test("POST /v1/leaderboard/:gameId/update-score should return 400 for future timestamp", async () => {
    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: 50,
        timestamp: new Date(Date.now() + 1000000).toISOString(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Timestamp cannot be in the future");
  });

  test("POST /v1/leaderboard/:gameId/update-score should return 400 for invalid gameId", async () => {
    const response = await request(app)
      .post("/leaderboard/   /update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: 50,
        timestamp: new Date().toISOString(),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid gameId" });
  });

  test("POST /v1/leaderboard/:gameId/update-score should return 500 on service failure", async () => {
    leaderboardService.updateScore.mockRejectedValue(new Error("DB error"));

    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: 50,
        timestamp: new Date().toISOString(),
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to update score" });
  });

  test("GET /leaderboard/:gameId should return only 'limit' number of results", async () => {
    const mockLeaderboard = [
      { userId: "user1", score: 100 },
      { userId: "user2", score: 90 },
    ];
    leaderboardService.getLeaderboard.mockResolvedValue(mockLeaderboard);

    const response = await request(app).get("/leaderboard/game123?limit=2");

    expect(response.status).toBe(200);
    expect(response.body.leaderboard.length).toBe(2);
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(
      "game123",
      2,
    );
  });

  test("GET /leaderboard/:gameId should return empty array when no scores exist", async () => {
    leaderboardService.getLeaderboard.mockResolvedValue([]);

    const response = await request(app).get("/leaderboard/game123");

    expect(response.status).toBe(200);
    expect(response.body.leaderboard).toEqual([]);
  });

  test("POST /leaderboard/:gameId/update-score should return 400 for negative score", async () => {
    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: -50,
        timestamp: new Date().toISOString(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("must be greater than or equal to 0");
  });
});

describe("API Performance Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const MAX_RESPONSE_TIME = 200;

  test("GET /leaderboard should respond in under 200ms", async () => {
    const mockLeaderboard = [{ userId: "user1", score: 100 }];
    leaderboardService.getLeaderboard.mockResolvedValue(mockLeaderboard);

    const start = Date.now();
    const response = await request(app).get("/leaderboard/game123");
    const duration = Date.now() - start;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(MAX_RESPONSE_TIME);
  });

  test("POST /update-score should respond in under 200ms", async () => {
    leaderboardService.updateScore.mockResolvedValue();

    const start = Date.now();
    const response = await request(app)
      .post("/leaderboard/game123/update-score")
      .send({
        eventType: "scoreUpdate",
        userId: "user1",
        score: 50,
        timestamp: new Date().toISOString(),
      });

    const duration = Date.now() - start;
    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(MAX_RESPONSE_TIME);
  });

  test("GET /leaderboard should handle 100 concurrent requests efficiently", async () => {
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(request(app).get("/leaderboard/game123"));
    }

    const results = await Promise.all(requests);
    results.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });

  test("POST /update-score should handle 100 concurrent requests", async () => {
    leaderboardService.updateScore.mockResolvedValue();

    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        request(app)
          .post("/leaderboard/game123/update-score")
          .send({
            eventType: "scoreUpdate",
            userId: `user${i}`,
            score: 50,
            timestamp: new Date().toISOString(),
          }),
      );
    }

    const results = await Promise.all(requests);
    results.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });
});
