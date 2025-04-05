const { DataTypes } = require("sequelize");
const sequelize = require("../database/postgres").sequelize;

const Leaderboard = sequelize.define(
    "Leaderboard",
    {
        gameId: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true,
        },
        score: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    },
    {
        tableName: "leaderboards",
        timestamps: true,
    }
);

module.exports = Leaderboard;
