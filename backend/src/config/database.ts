import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const useSqlite = !process.env.DATABASE_URL || process.env.DATABASE_URL === "sqlite";

let sequelize: Sequelize;

if (useSqlite) {
  const dbPath = path.join(__dirname, "../../jaffa.db");
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: dbPath,
    logging: false,
  });
} else {
  sequelize = new Sequelize(process.env.DATABASE_URL!, {
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
}

export default sequelize;
