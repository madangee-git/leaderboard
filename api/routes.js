const express = require("express");
const Joi = require("joi");
const leaderboardService = require("../services/leaderboardService");

const router = express.Router();

// Validation schema for score updates
const scoreSchema = Joi.object({
    eventType: Joi.string().valid("scoreUpdate").required(),
    userId: Joi.string().required(),
    score: Joi.number().integer().required(),
    timestamp: Joi.string().isoDate().required().custom((value, helpers) => {
        if (new Date(value) > new Date()) {
            return helpers.message("Timestamp cannot be in the future");
        }
        return value;
    })
});

// GET /leaderboard/:gameId - Fetch leaderboard for a game
// This endpoint fetches the leaderboard for a specific game.
// It validates the gameId and limit query parameter, and returns the leaderboard data.
// The leaderboard is fetched from Redis if the game is popular, otherwise from in-memory storage.
// The leaderboard is sorted by score in descending order, and the top N entries are returned.
// The limit query parameter specifies the maximum number of entries to return.
// The default limit is 10 if not specified.

router.get("/:gameId", async (req, res) => {
    try {
        const gameId = req.params.gameId;
        if (typeof gameId !== "string" || gameId.trim() === "") {
            return res.status(400).json({ error: "Invalid gameId" });
        }

        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = await leaderboardService.getLeaderboard(gameId, limit);
        res.json({ gameId, leaderboard });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});

// POST /leaderboard/:gameId/update-score - Update score for a game
// This endpoint updates the score for a specific user in a game.
// It validates the gameId and the request body against the score schema.
// The request body must contain the event type, userId, score, and timestamp.
// The event type must be "scoreUpdate". The score must be an integer.
// The timestamp must be in ISO format and cannot be in the future.
// The score is updated in the leaderboard service.
// If the game is popular, the score is also cached in Redis.

router.post("/:gameId/update-score", async (req, res) => {
    try {
        const gameId = req.params.gameId;
        if (typeof gameId !== "string" || gameId.trim() === "") {
            return res.status(400).json({ error: "Invalid gameId" });
        }

        const { error } = scoreSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { userId, score } = req.body;

        await leaderboardService.updateScore(gameId, userId, score);
        res.status(200).json({ message: "Score updated successfully" });
    } catch (error) {
        console.error(error.stack);
        res.status(500).json({ error: "Failed to update score" });
    }
});

module.exports = router;