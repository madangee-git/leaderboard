const jwt = require("jsonwebtoken");
const fs = require("fs");

// Mock `fs.readFileSync` before requiring the auth middleware
jest.mock("fs", () => ({
    readFileSync: jest.fn(() => "mocked_jwt_secret"),
}));

const authenticate = require("../middleware/auth");

describe("Authentication Middleware", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("should return 401 if no token is provided", () => {
        const req = { header: jest.fn().mockReturnValue(null) };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Access denied. No token provided." });
        expect(next).not.toHaveBeenCalled();
    });

    test("should return 403 if token is invalid", () => {
        jest.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("Invalid token");
        });

        const req = { header: jest.fn().mockReturnValue("Bearer invalidToken") };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid token." });
        expect(next).not.toHaveBeenCalled();
    });

    test("should call next() if token is valid", () => {
        const decodedUser = { id: "user123", role: "admin" };
        jest.spyOn(jwt, "verify").mockReturnValue(decodedUser);

        const req = { header: jest.fn().mockReturnValue("Bearer validToken") };
        const res = {};
        const next = jest.fn();

        authenticate(req, res, next);

        expect(jwt.verify).toHaveBeenCalledWith("validToken", "mocked_jwt_secret");
        expect(req.user).toEqual(decodedUser);
        expect(next).toHaveBeenCalled();
    });
});
