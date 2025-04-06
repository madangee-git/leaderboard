const { 
    updateScore, 
    getLeaderboard, 
    leaderboards, 
    isPopularGame 
} = require("../services/leaderboardService");
const redisClient = require("../database/redis");
const { POPULARITY_COUNT } = require("../config/settings");

jest.mock("../database/redis"); // Mock Redis

beforeEach(() => {
    jest.clearAllMocks();
    leaderboards.clear();
});

describe("Leaderboard Service", () => {
    test("updateScore should update in-memory leaderboard", async () => {
        leaderboards.set("game1", new Map());
        await updateScore("game1", "user1", 10);
        expect(leaderboards.get("game1").get("user1")).toBe(10);
    });

    test("updateScore should correctly add to an existing user's score", async () => {
        leaderboards.set("game1", new Map([["user1", 5]]));
        await updateScore("game1", "user1", 10);
        expect(leaderboards.get("game1").get("user1")).toBe(10);
    });

    test("updateScore should create a new game entry if it doesn't exist", async () => {
        await updateScore("newGame", "user1", 20);
        expect(leaderboards.get("newGame").get("user1")).toBe(20);
    });

    test("updateScore should track active users in Redis", async () => {
        redisClient.sadd.mockResolvedValue(1); // Mock Redis set addition

        await updateScore("game1", "user1", 15);

        expect(redisClient.sadd).toHaveBeenCalledWith("game:game1:activeUsers", "user1");
    });

    test("updateScore should cache score in Redis if game is popular", async () => {
        redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1); // Mock popularity check
        redisClient.zadd.mockResolvedValue(1);

        await updateScore("game1", "user1", 15);

        expect(redisClient.zadd).toHaveBeenCalledWith("leaderboard:game1", 15, "user1");
    });

    test("updateScore should cache full leaderboard to Redis when a game becomes popular for the first time", async () => {
        // Mock game as NOT in Redis (first time becoming popular)
        redisClient.exists.mockResolvedValue(false);
        redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1); // Game crosses popularity threshold
        redisClient.pipeline = jest.fn().mockReturnValue({
            zadd: jest.fn(),
            exec: jest.fn().mockResolvedValue([]),
        });

        // Set initial in-memory leaderboard
        leaderboards.set("game1", new Map([
            ["user1", 100],
            ["user2", 90],
        ]));

        await updateScore("game1", "user3", 80);

        // Ensure full leaderboard dump happened
        expect(redisClient.pipeline).toHaveBeenCalled();
        expect(redisClient.pipeline().zadd).toHaveBeenCalledWith("leaderboard:game1", 100, "user1");
        expect(redisClient.pipeline().zadd).toHaveBeenCalledWith("leaderboard:game1", 90, "user2");
        expect(redisClient.pipeline().zadd).toHaveBeenCalledWith("leaderboard:game1", 80, "user3");
        expect(redisClient.pipeline().exec).toHaveBeenCalled();
    });

    test("updateScore should cache new scores in Redis after a game becomes popular", async () => {
        redisClient.exists.mockResolvedValue(true); // Game is already popular in Redis
        redisClient.zadd.mockResolvedValue(1); // Mock Redis write

        await updateScore("game1", "user1", 75);

        expect(redisClient.zadd).toHaveBeenCalledWith("leaderboard:game1", 75, "user1");
    });

    test("updateScore should handle Redis failure gracefully", async () => {
        redisClient.zadd.mockRejectedValue(new Error("Redis write error"));

        leaderboards.set("game1", new Map([
            ["user1", 60]
        ]));

        await expect(updateScore("game1", "user1", 70)).resolves.not.toThrow();

        expect(leaderboards.get("game1").get("user1")).toBe(70);
    });

    test("updateScore should throw an error if gameId is null", async () => {
        await expect(updateScore(null, "user1", 10)).rejects.toThrow();
    });

    test("updateScore should throw an error if userId is undefined", async () => {
        await expect(updateScore("game1", undefined, 10)).rejects.toThrow();
    });


    test("getLeaderboard should fetch from Redis if cached", async () => {
        redisClient.exists.mockResolvedValue(true);
        redisClient.zrevrange.mockResolvedValue(["user1", "20", "user2", "10"]);

        const leaderboard = await getLeaderboard("game1");

        expect(redisClient.zrevrange).toHaveBeenCalledWith("leaderboard:game1", 0, 9, "WITHSCORES");
        expect(leaderboard).toEqual([
            { userId: "user1", score: 20 },
            { userId: "user2", score: 10 }
        ]);
    });

    test("getLeaderboard should return data from Redis for a popular game", async () => {
        redisClient.exists.mockResolvedValue(true); // Game exists in Redis
        redisClient.zrevrange.mockResolvedValue(["user1", "100", "user2", "90"]);

        const leaderboard = await getLeaderboard("game1");

        expect(redisClient.zrevrange).toHaveBeenCalledWith("leaderboard:game1", 0, 9, "WITHSCORES");
        expect(leaderboard).toEqual([
            { userId: "user1", score: 100 },
            { userId: "user2", score: 90 }
        ]);
    });

    test("getLeaderboard should return only the requested number of items (limit parameter)", async () => {
        redisClient.exists.mockResolvedValue(false); // Leaderboard is not cached in Redis
    
        // Set up an in-memory leaderboard with more than 3 users
        leaderboards.set("game1", new Map([
            ["user1", 100],
            ["user2", 90],
            ["user3", 80],
            ["user4", 70],
            ["user5", 60]
        ]));
    
        const leaderboard = await getLeaderboard("game1", 3); // Request top 3 entries
    
        expect(leaderboard).toHaveLength(3); // Ensure only 3 results are returned
        expect(leaderboard).toEqual([
            { userId: "user1", score: 100 },
            { userId: "user2", score: 90 },
            { userId: "user3", score: 80 }
        ]);
    });

    test("getLeaderboard should fetch from memory if not cached", async () => {
        redisClient.exists.mockResolvedValue(false);
        leaderboards.set("game1", new Map([
            ["user1", 30],
            ["user2", 25]
        ]));

        const leaderboard = await getLeaderboard("game1");

        expect(leaderboard).toEqual([
            { userId: "user1", score: 30 },
            { userId: "user2", score: 25 }
        ]);
    });

    test("getLeaderboard should return an empty array if no scores exist", async () => {
        redisClient.exists.mockResolvedValue(false);
        leaderboards.set("game1", new Map()); // No entries in leaderboard

        const leaderboard = await getLeaderboard("game1");

        expect(leaderboard).toEqual([]); // Expect empty array
    });

    test("getLeaderboard should cache leaderboard in Redis if game becomes popular", async () => {
        redisClient.exists.mockResolvedValue(false);
        redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);
        redisClient.pipeline = jest.fn().mockReturnValue({
            zadd: jest.fn(),
            exec: jest.fn().mockResolvedValue([])
        });

        leaderboards.set("game1", new Map([
            ["user1", 40],
            ["user2", 35]
        ]));

        await getLeaderboard("game1");

        expect(redisClient.pipeline).toHaveBeenCalled();
    });
    
    test("getLeaderboard should handle Redis failure gracefully", async () => {
        redisClient.exists.mockRejectedValue(new Error("Redis connection error"));

        leaderboards.set("game1", new Map([
            ["user1", 50],
            ["user2", 45]
        ]));

        await expect(getLeaderboard("game1")).resolves.toEqual([
            { userId: "user1", score: 50 },
            { userId: "user2", score: 45 }
        ]);
    });

    test("isPopularGame should return true if active users exceed threshold", async () => {
        redisClient.scard.mockResolvedValue(POPULARITY_COUNT + 1);

        const isPopular = await isPopularGame("game1");

        expect(isPopular).toBe(true);
    });

    test("isPopularGame should return false if active users are below threshold", async () => {
        redisClient.scard.mockResolvedValue(4);

        const isPopular = await isPopularGame("game1");

        expect(isPopular).toBe(false);
    });    
});
