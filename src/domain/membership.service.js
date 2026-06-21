const { randomUUID, randomBytes } = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("../db/pool");
const producer = require("../kafka/producer");
const { assertValid } = require("../kafka/schema-registry");

const MEMBER_TOPIC = "user.member.registered";
const BUYER_TOPIC = "user.buyer.registered";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}
class ConflictError extends Error {
  constructor(message) { super(message); this.status = 409; }
}

const now = () => new Date().toISOString();

// Readable, ID-like identifier: PREFIX-XXXXXX (uppercase, no ambiguous chars I/O/0/1).
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genId(prefix) {
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return `${prefix}-${s}`;
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => !body[f] || String(body[f]).trim() === "");
  if (missing.length) throw new ValidationError(`Missing required field(s): ${missing.join(", ")}`);
}

/**
 * Try to publish one stored event and update its outbox row.
 * Never throws — failures are recorded so the periodic flush can retry.
 */
async function publishStoredEvent(row) {
  try {
    const ok = await producer.send({ topic: row.topic, key: row.key, payload: row.payload });
    if (ok) {
      await pool.query("UPDATE event_store SET published_at = NOW(), publish_error = NULL WHERE event_id = $1", [row.event_id]);
    }
    return ok;
  } catch (err) {
    await pool.query("UPDATE event_store SET publish_error = $2 WHERE event_id = $1", [row.event_id, err.message]);
    return false;
  }
}

/**
 * Re-send every event that hasn't reached Kafka yet. Called on startup and on a
 * timer, so events survive Kafka being down at registration time.
 */
async function flushUnpublishedOutbox() {
  const { rows } = await pool.query(
    "SELECT event_id, topic, key, payload FROM event_store WHERE published_at IS NULL ORDER BY id ASC LIMIT 100"
  );
  let flushed = 0;
  for (const row of rows) {
    if (await publishStoredEvent(row)) flushed += 1;
  }
  return flushed;
}

async function registerMember(body) {
  requireFields(body, ["memberName", "boatName", "password"]);
  const passwordHash = await bcrypt.hash(body.password, 10);

  const client = await pool.connect();
  let memberId, event;
  try {
    await client.query("BEGIN");
    memberId = genId("MEM");

    // Event carries ONLY the fields the queue schema allows (no phone).
    event = { eventId: randomUUID(), memberId, memberName: body.memberName, boatName: body.boatName, occurredAt: now() };
    if (body.email) event.email = body.email;
    assertValid(MEMBER_TOPIC, event); // never store an invalid event

    await client.query(
      `INSERT INTO members (member_id, member_name, boat_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [memberId, body.memberName, body.boatName, body.email || null, body.phone || null, passwordHash]
    );
    await client.query(
      `INSERT INTO event_store (event_id, aggregate_type, aggregate_id, event_type, topic, key, payload, occurred_at)
       VALUES ($1, 'member', $2, $3, $3, $2, $4, $5)`,
      [event.eventId, memberId, MEMBER_TOPIC, event, event.occurredAt]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") throw new ConflictError("Email already registered");
    throw err;
  } finally {
    client.release();
  }

  // Best-effort publish now; if it fails the flush loop will retry from the outbox.
  await publishStoredEvent({ event_id: event.eventId, topic: MEMBER_TOPIC, key: memberId, payload: event });
  return { memberId, event };
}

async function registerBuyer(body) {
  requireFields(body, ["name", "password"]);
  const passwordHash = await bcrypt.hash(body.password, 10);

  const client = await pool.connect();
  let buyerId, event;
  try {
    await client.query("BEGIN");
    buyerId = genId("BUY");

    event = { eventId: randomUUID(), buyerId, name: body.name, occurredAt: now() };
    if (body.email) event.email = body.email;
    if (body.phone) event.phone = body.phone;       // Post-Auction: contact for delivery
    if (body.address) event.address = body.address; // Post-Auction: delivery feasibility check
    assertValid(BUYER_TOPIC, event);

    await client.query(
      `INSERT INTO buyers (buyer_id, name, email, phone, address, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [buyerId, body.name, body.email || null, body.phone || null, body.address || null, passwordHash]
    );
    await client.query(
      `INSERT INTO event_store (event_id, aggregate_type, aggregate_id, event_type, topic, key, payload, occurred_at)
       VALUES ($1, 'buyer', $2, $3, $3, $2, $4, $5)`,
      [event.eventId, buyerId, BUYER_TOPIC, event, event.occurredAt]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") throw new ConflictError("Email already registered");
    throw err;
  } finally {
    client.release();
  }

  await publishStoredEvent({ event_id: event.eventId, topic: BUYER_TOPIC, key: buyerId, payload: event });
  return { buyerId, event };
}

async function login({ email, password }) {
  requireFields({ email, password }, ["email", "password"]);
  const fail = new ValidationError("Invalid credentials");
  fail.status = 401;

  const m = await pool.query("SELECT member_id AS id, member_name AS name, password_hash FROM members WHERE LOWER(email) = LOWER($1)", [email]);
  const b = await pool.query("SELECT buyer_id AS id, name, password_hash FROM buyers WHERE LOWER(email) = LOWER($1)", [email]);
  const found = m.rows[0] ? { role: "member", row: m.rows[0] } : b.rows[0] ? { role: "buyer", row: b.rows[0] } : null;
  if (!found) throw fail;

  const ok = await bcrypt.compare(password, found.row.password_hash);
  if (!ok) throw fail;

  const token = jwt.sign({ role: found.role, name: found.row.name }, JWT_SECRET, {
    subject: found.row.id,
    expiresIn: JWT_EXPIRES_IN,
  });
  return { token, role: found.role, id: found.row.id, name: found.row.name };
}

async function listMembers() {
  const { rows } = await pool.query(
    "SELECT member_id, member_name, boat_name, email, phone FROM members ORDER BY member_id"
  );
  return rows;
}

async function listBuyers() {
  const { rows } = await pool.query(
    "SELECT buyer_id, name, email, phone, address FROM buyers ORDER BY buyer_id"
  );
  return rows;
}

async function getStats() {
  const { rows } = await pool.query(
    "SELECT (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM buyers) AS buyers"
  );
  return { members: Number(rows[0].members), buyers: Number(rows[0].buyers) };
}

module.exports = {
  registerMember,
  registerBuyer,
  login,
  listMembers,
  listBuyers,
  getStats,
  flushUnpublishedOutbox,
  ValidationError,
  ConflictError,
};
