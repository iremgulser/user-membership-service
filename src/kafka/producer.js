const { Kafka, logLevel } = require("kafkajs");
const { hasKafkaBrokers, buildKafkaConfig } = require("./config");

let producer = null;
let connected = false;

function isEnabled() {
  // Allow turning Kafka off explicitly, or simply having no brokers configured.
  if (String(process.env.KAFKA_DISABLED || "").toLowerCase() === "true") return false;
  return hasKafkaBrokers();
}

async function connect() {
  if (!isEnabled() || connected) return;
  const kafka = new Kafka({ ...buildKafkaConfig(), logLevel: logLevel.ERROR });
  producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true });
  await producer.connect();
  connected = true;
}

async function disconnect() {
  if (producer && connected) {
    await producer.disconnect();
    connected = false;
  }
}

/**
 * Send one already-validated event. Returns true on success, false if Kafka is
 * not available (so the caller can leave it in the outbox and retry later).
 */
async function send({ topic, key, payload }) {
  if (!isEnabled()) return false;
  await connect();
  await producer.send({
    topic,
    messages: [
      {
        key: key == null ? null : String(key),
        value: JSON.stringify(payload),
        headers: { "content-type": "application/json", eventType: topic },
      },
    ],
  });
  return true;
}

module.exports = { connect, disconnect, send, isEnabled };
