const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

// Compile every "<topic>.schema.json" in /schema. The schema's $id is the topic
// name, so the topic an event goes to and the schema it is validated against are
// guaranteed to match. These files are copies of the queue repo's contract.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaDir = path.join(__dirname, "..", "..", "schema");
const validators = {};

for (const file of fs.readdirSync(schemaDir)) {
  if (!file.endsWith(".schema.json")) continue;
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  const topic = schema.$id || file.replace(".schema.json", "");
  validators[topic] = ajv.compile(schema);
}

function assertValid(topic, payload) {
  const validate = validators[topic];
  if (!validate) throw new Error(`No schema registered for topic "${topic}"`);
  if (!validate(payload)) {
    const errors = (validate.errors || []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
    throw new Error(`Schema validation failed for "${topic}": ${errors.join("; ")}`);
  }
  return true;
}

module.exports = { assertValid, validators };
