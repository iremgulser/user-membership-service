-- User & Membership Service schema
-- Mirrors the Bidding service's approach: domain tables + an event_store that
-- acts as a transactional outbox (events are written here in the same
-- transaction as the data, then flushed to Kafka).

DROP TABLE IF EXISTS event_store CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS buyers CASCADE;

CREATE TABLE members (
  member_id     VARCHAR(100) PRIMARY KEY,
  member_name   VARCHAR(255) NOT NULL,
  boat_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE buyers (
  buyer_id      VARCHAR(100) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(50),
  address       TEXT,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique email across each table (NULLs allowed).
CREATE UNIQUE INDEX ux_members_email ON members (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX ux_buyers_email  ON buyers  (LOWER(email)) WHERE email IS NOT NULL;

-- Transactional outbox: every published event is recorded here first.
CREATE TABLE event_store (
  id             BIGSERIAL PRIMARY KEY,
  event_id       UUID UNIQUE NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,   -- 'member' | 'buyer'
  aggregate_id   VARCHAR(100) NOT NULL,   -- memberId | buyerId
  event_type     VARCHAR(150) NOT NULL,   -- topic name
  topic          VARCHAR(255) NOT NULL,
  key            VARCHAR(255),
  payload        JSONB NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,             -- NULL until flushed to Kafka
  publish_error  TEXT
);

CREATE INDEX idx_event_store_unpublished ON event_store (published_at) WHERE published_at IS NULL;
