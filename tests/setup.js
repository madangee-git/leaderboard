const redisClient = require("../database/redis");

jest.mock("../database/redis", () => ({
  incr: jest.fn(),
  get: jest.fn(),
  exists: jest.fn(),
  zadd: jest.fn(),
  sadd: jest.fn(),
  scard: jest.fn(),
  zrevrange: jest.fn(),
  pipeline: jest.fn(() => ({
    zadd: jest.fn(),
    exec: jest.fn(),
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
});
