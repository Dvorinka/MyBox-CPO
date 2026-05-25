ALTER TABLE charging_sessions
	ADD COLUMN IF NOT EXISTS price_per_kwh DOUBLE PRECISION,
	ADD COLUMN IF NOT EXISTS pricing_tariff TEXT,
	ADD COLUMN IF NOT EXISTS station_power_class TEXT;

CREATE TABLE IF NOT EXISTS station_commands (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
	command TEXT NOT NULL,
	transaction_id TEXT,
	status TEXT NOT NULL DEFAULT 'queued',
	error_message TEXT,
	queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	sent_at TIMESTAMPTZ,
	acked_at TIMESTAMPTZ,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_commands_station_time
	ON station_commands (station_id, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_station_commands_status
	ON station_commands (status, queued_at DESC);
