import dotenv from "dotenv";
dotenv.config();

import { sequelize } from "../models";

async function sync() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database");
    await sequelize.sync({ alter: true });
    console.log("Database synced");
    process.exit(0);
  } catch (error) {
    console.error("Sync error:", error);
    process.exit(1);
  }
}

sync();
