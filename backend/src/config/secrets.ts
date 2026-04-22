// Centralized security-critical env reader.
// Validates at import time; crashes the process if required vars are missing
// so a misconfigured deployment cannot silently fall back to insecure defaults.

import dotenv from "dotenv";
// Load .env first — imports are evaluated in source order in CommonJS but some
// bundlers / ESM setups hoist them. Doing this here makes the module self-sufficient
// regardless of where secrets.ts is imported.
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `FATAL: required env var ${name} is not set. Refusing to start — ` +
        `set it in .env or the deployment environment before booting.`
    );
  }
  return value;
}

// Eagerly validated. Throwing here aborts server startup.
export const JWT_SECRET: string = required("JWT_SECRET");
export const OWNER_USER: string = required("OWNER_USER");
export const OWNER_PASS: string = required("OWNER_PASS");

// Opt-in flag: the legacy /auth/phone-login endpoint creates a JWT for any
// phone number with no verification. It MUST NOT be on in production.
// Default = off; dev environments set ALLOW_UNSAFE_PHONE_LOGIN=true in .env.
export const ALLOW_UNSAFE_PHONE_LOGIN: boolean =
  (process.env.ALLOW_UNSAFE_PHONE_LOGIN || "").toLowerCase() === "true";

if (ALLOW_UNSAFE_PHONE_LOGIN) {
  // eslint-disable-next-line no-console
  console.warn(
    "⚠️  ALLOW_UNSAFE_PHONE_LOGIN=true — /auth/phone-login is enabled. " +
      "This endpoint issues a JWT with NO verification. Never enable in production."
  );
}

// Basic hygiene warning — doesn't abort but makes weak secrets visible in logs.
if (JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn(
    `⚠️  JWT_SECRET is ${JWT_SECRET.length} chars. Use at least 32 random chars for production.`
  );
}
