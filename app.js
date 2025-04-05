const express = require("express");
const bodyParser = require("body-parser");
const leaderboardRoutes = require("./api/routes");
const authenticate = require("./middleware/auth");
const { connectDB, sequelize } = require("./database/postgres");
const scheduler = require("./cron/scheduler");
const client = require("prom-client");
const errorHandler = require("./middleware/errorHandler");
const metricsMiddleware = require("./middleware/metrics");

const app = express();

app.use(metricsMiddleware);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Expose /metrics endpoint for Prometheus
app.get("/metrics", async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
});

// Secure routes with authentication
app.use("/leaderboard", authenticate, leaderboardRoutes);

// Health check endpoint
app.get("/", (req, res) => res.send("Leaderboard Service is running!"));

// Error handler
app.use(errorHandler);

// Connect to database and start scheduler
const startServer = async () => {
    console.log("Connecting to database...");
    await connectDB();
    await sequelize.sync(); // Sync models with database
    scheduler();
};

// Initialize Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics(); // Collects system metrics like CPU, memory usage

startServer();

// Export app for server.js
module.exports = app;