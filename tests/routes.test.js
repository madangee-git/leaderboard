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

    // GET /leaderboard/:gameId - Valid gameId
    test("GET /leaderboard/:gameId should return leaderboard data", async () => {
        const mockLeaderboard = [{ userId: "user1", score: 100 }];
        leaderboardService.getLeaderboard.mockResolvedValue(mockLeaderboard);

        const response = await request(app).get("/leaderboard/game123");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ gameId: "game123", leaderboard: mockLeaderboard });
        expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith("game123", 10);
    });

    // GET /leaderboard/:gameId - Missing or invalid gameId
    test("GET /leaderboard/:gameId should return 400 for invalid gameId", async () => {
        const response = await request(app).get("/leaderboard/%20"); // Invalid gameId

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Invalid gameId" });
    });

    // GET /leaderboard/:gameId - Service failure
    test("GET /leaderboard/:gameId should return 500 on service failure", async () => {
        leaderboardService.getLeaderboard.mockRejectedValue(new Error("DB Error"));

        const response = await request(app).get("/leaderboard/game123");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Failed to fetch leaderboard" });
    });

    // POST /leaderboard/:gameId/update-score - Valid score update
    test("POST /leaderboard/:gameId/update-score should update score", async () => {
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
        expect(leaderboardService.updateScore).toHaveBeenCalledWith("game123", "user1", 50);
    });

    // POST /leaderboard/:gameId/update-score - Missing fields
    test("POST /leaderboard/:gameId/update-score should return 400 for missing fields", async () => {
        const response = await request(app)
            .post("/leaderboard/game123/update-score")
            .send({ userId: "user1", score: 50 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    // POST /leaderboard/:gameId/update-score - Invalid timestamp
    test("POST /leaderboard/:gameId/update-score should return 400 for future timestamp", async () => {
        const response = await request(app)
            .post("/leaderboard/game123/update-score")
            .send({
                eventType: "scoreUpdate",
                userId: "user1",
                score: 50,
                timestamp: new Date(Date.now() + 1000000).toISOString(), // Future timestamp
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain("Timestamp cannot be in the future");
    });

    // POST /leaderboard/:gameId/update-score - Invalid gameId
    test("POST /leaderboard/:gameId/update-score should return 400 for invalid gameId", async () => {
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

    // POST /leaderboard/:gameId/update-score - Service failure
    test("POST /leaderboard/:gameId/update-score should return 500 on service failure", async () => {
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
});
