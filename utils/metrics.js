const client = require("prom-client");

// Create a histogram for HTTP request durations
const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.1, 0.5, 1, 2, 5], // Buckets for response time
});

module.exports = { httpRequestDuration };
