const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const routes = require("./routes/membership.routes");
const producer = require("./kafka/producer");
const membershipService = require("./domain/membership.service");

dotenv.config();

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", routes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled application error:", err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api") || req.path.startsWith("/members") || req.path.startsWith("/buyers") || req.path === "/login") {
    return res.status(500).json({ error: "Server error" });
  }
  res.status(500).render("index", { stats: { members: 0, buyers: 0 }, error: "Unexpected server error." });
});

const port = Number(process.env.PORT || 3001);

async function start() {
  app.listen(port, async () => {
    console.log(`User & Membership service listening on http://localhost:${port}`);
    console.log(producer.isEnabled() ? "Kafka enabled." : "Kafka not configured — events stay in the outbox until a broker is set.");

    // Flush any events that were stored but not yet published.
    try {
      const n = await membershipService.flushUnpublishedOutbox();
      if (n) console.log(`Outbox flush on startup: ${n} event(s) published.`);
    } catch (error) {
      console.error("Outbox flush on startup failed:", error.message);
    }

    // Retry the outbox periodically (covers Kafka being temporarily down).
    setInterval(async () => {
      try {
        await membershipService.flushUnpublishedOutbox();
      } catch (error) {
        console.error("Periodic outbox flush failed:", error.message);
      }
    }, 10000);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  try { await producer.disconnect(); } catch (error) { console.error(error.message); }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
