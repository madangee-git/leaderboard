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
    try {
        console.log("Connecting to database...");
        await connectDB();

        console.log("Syncing database...");
        await sequelize.sync({ alter: true }); // Prevent table recreation issues

        console.log("Starting scheduler...");
        scheduler();

        console.log("Leaderboard service is running...");
    } catch (error) {
        console.error("Error starting the server:", error);
        process.exit(1); // Exit process on failure
    }
};

// Initialize Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics(); // Collects system metrics like CPU, memory usage

startServer();

// Export app for server.js
module.exports = app;