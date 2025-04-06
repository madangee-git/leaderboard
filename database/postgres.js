const { Sequelize } = require("sequelize");
const fs = require("fs");

const dbPassword = fs.readFileSync("/run/secrets/db_password", "utf8").trim();
const dbUser = process.env.DB_USER || "user";
const dbHost = process.env.DB_HOST || "db";
const dbName = process.env.DB_NAME || "leaderboard";

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  dbUser: dbUser,
  dbPassword: dbPassword,
  logging: console.log,
  dialect: "postgres",
  port: 5432,
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("DB connected successfully.");
  } catch (error) {
    console.error("Unable to connect to DB:", error);
  }
};

module.exports = { sequelize, connectDB };
