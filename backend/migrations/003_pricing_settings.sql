CREATE TABLE IF NOT EXISTS pricing_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    peak_price_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 8.5,
    offpeak_price_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 7.23,
    peak_start_hour INTEGER NOT NULL DEFAULT 7,
    peak_end_hour INTEGER NOT NULL DEFAULT 21,
    dc_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.15,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO pricing_settings (id, peak_price_per_kwh, offpeak_price_per_kwh, peak_start_hour, peak_end_hour, dc_multiplier)
VALUES (1, 8.5, 7.23, 7, 21, 1.15)
ON CONFLICT (id) DO NOTHING;
