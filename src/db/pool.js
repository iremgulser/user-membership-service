const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function getSslConfig() {
  const sslEnabled =
    parseBoolean(process.env.PGSSL) ||
    ["require", "verify-ca", "verify-full"].includes(String(process.env.PGSSLMODE || "").toLowerCase());

  if (!sslEnabled) return undefined;

  const sslConfig = {
    rejectUnauthorized: !parseBoolean(process.env.PGSSL_REJECT_UNAUTHORIZED_FALSE),
  };
  if (process.env.PGSSL_CA) {
    sslConfig.ca = process.env.PGSSL_CA.replace(/\\n/g, "\n");
  }
  return sslConfig;
}

function buildPoolConfig() {
  const ssl = getSslConfig();

  if (process.env.PGHOST || process.env.PGUSER || process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "user_membership_service",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      ssl,
    };
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, "") || "postgres",
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl,
    };
  }

  return {
    host: "localhost",
    port: 5432,
    database: "user_membership_service",
    user: "postgres",
    password: "postgres",
    ssl,
  };
}

const pool = new Pool(buildPoolConfig());

module.exports = pool;
