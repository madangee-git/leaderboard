jest.mock("../database/redis", () => {
  return {
    incr: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    zrevrange: jest.fn().mockResolvedValue([]),
    pipeline: jest.fn(() => {
      return {
        zadd: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      };
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});
