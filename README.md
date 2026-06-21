# User & Membership Service (Microservice 1)

Balıklıova Fish Auction — member/buyer registration, login, and the
`user.member.registered` / `user.buyer.registered` events.

**Stack (aligned with the other teams):** Node.js · Express · EJS · PostgreSQL ·
KafkaJS. Same `routes → controllers → domain → db` layout and the same
**transactional outbox** pattern as the Bidding service: every event is written
to the database in the same transaction as the data, then flushed to Kafka (and
retried if the broker is down), so an event can never be lost.

> No `socket.io` here — this service has no live/streamed data (just sign-up and
> sign-in), so a realtime channel would be dead weight.

## Run it

Prerequisites: Node.js ≥ 18 and Docker (for Postgres).

```bash
docker compose up -d        # start PostgreSQL on localhost:5432
npm install
npm run db:init             # create tables (members, buyers, event_store)
npm start                   # http://localhost:3001
```

Open http://localhost:3001 — sign up a member/buyer, sign in, and (as a member)
see the directory.

Without Kafka credentials the service still works: registrations succeed and the
events wait in the `event_store` outbox. Add the Queue team's Confluent Cloud
values to `.env` (`KAFKA_BROKERS`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`)
and restart — the startup flush publishes everything that's still pending.

## Structure

```
schema/                         JSON Schemas (the queue contract)
src/
├── app.js                      Express entry: EJS, static, routes, outbox flush loop
├── db/   pool.js · schema.sql · init.js
├── kafka/ config.js · schema-registry.js · producer.js
├── domain/   membership.service.js   (register/login + outbox)
├── controllers/ membership.controller.js
├── routes/   membership.routes.js
├── views/   index.ejs           (server-rendered UI)
└── public/  main.js             (client interactions)
docker-compose.yml               local PostgreSQL
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | EJS home (sign up / sign in / dashboard) |
| POST | `/members/register` | create member → publishes `user.member.registered` |
| POST | `/buyers/register` | create buyer → publishes `user.buyer.registered` |
| POST | `/login` | email + password → JWT |
| GET | `/api/members` | members directory (UI) |
| GET | `/health` | health check |

Phone/address are stored in the database but kept out of the published events
(the queue schema doesn't carry them yet).
