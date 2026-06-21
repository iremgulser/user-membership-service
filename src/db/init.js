const fs = require("fs");
const path = require("path");
const pool = require("./pool");

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("Applying database schema...");
  await pool.query(sql);
  console.log("Schema applied. Tables: members, buyers, event_store.");
  await pool.end();
}

init().catch((err) => {
  console.error("DB init failed:", err.message);
  process.exit(1);
});
