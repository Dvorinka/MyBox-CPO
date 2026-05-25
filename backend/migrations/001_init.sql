-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
	version TEXT PRIMARY KEY,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stations (
	id TEXT PRIMARY KEY,
	max_power_kw DOUBLE PRECISION NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'Offline',
	last_seen_at TIMESTAMPTZ,
	current_power_kw DOUBLE PRECISION NOT NULL DEFAULT 0,
	current_meter_wh BIGINT NOT NULL DEFAULT 0,
	active_transaction_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS charging_sessions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	transaction_id TEXT NOT NULL UNIQUE,
	station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
	start_time TIMESTAMPTZ NOT NULL,
	end_time TIMESTAMPTZ,
	start_meter_wh BIGINT NOT NULL,
	end_meter_wh BIGINT,
	total_kwh DOUBLE PRECISION,
	total_cost DOUBLE PRECISION,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meter_values (
	id BIGSERIAL PRIMARY KEY,
	station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
	transaction_id TEXT,
	measured_at TIMESTAMPTZ NOT NULL,
	power_kw DOUBLE PRECISION NOT NULL,
	meter_wh BIGINT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_station_start
	ON charging_sessions (station_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_meter_station_time
	ON meter_values (station_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_meter_transaction
	ON meter_values (transaction_id)
	WHERE transaction_id IS NOT NULL;
