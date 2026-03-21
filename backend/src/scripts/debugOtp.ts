import { sequelize } from "../models";

async function debug() {
  const [cols] = await sequelize.query("PRAGMA table_info(users)");
  console.log("User columns:", JSON.stringify(cols, null, 2));

  const [otps] = await sequelize.query(
    "SELECT id,phone,code,verified,expiresAt,createdAt FROM otps WHERE phone='+917418167340' ORDER BY createdAt DESC LIMIT 5"
  );
  console.log("Recent OTPs:", JSON.stringify(otps, null, 2));

  process.exit(0);
}

debug().catch((e) => {
  console.error(e);
  process.exit(1);
});
