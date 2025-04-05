const cron = require("node-cron");
const persistenceService = require("../services/persistenceService");
const config = require("../config/settings");

// Schedule the leaderboard persistence task
const schedulePersistence = () => {
    const interval = config.PERSIST_INTERVAL || 60; // Default to 60 minutes
    console.log(`Scheduling leaderboard persistence every ${interval} minutes...`);

    cron.schedule(`*/${interval} * * * *`, async () => {
        console.log("Running scheduled leaderboard persistence...");
        await persistenceService.persistLeaderboards();
        console.log("Scheduled leaderboard persistence completed.");        
    });
};

module.exports = schedulePersistence;
