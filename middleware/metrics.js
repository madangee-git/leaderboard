
const { httpRequestDuration } = require("../utils/metrics");

const metricsMiddleware = (req, res, next) => {
    const start = process.hrtime();

    res.on("finish", () => {
        const duration = process.hrtime(start);
        const durationInSeconds = duration[0] + duration[1] / 1e9;

        httpRequestDuration
            .labels(req.method, req.path, res.statusCode)
            .observe(durationInSeconds);
    });

    next();
};

module.exports = metricsMiddleware;
