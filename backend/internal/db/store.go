package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"mybox-cpo/backend/internal/metrics"
	"mybox-cpo/backend/internal/pricing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

type Station struct {
	ID                  string     `json:"id"`
	MaxPowerKW          float64    `json:"max_power_kw"`
	Status              string     `json:"status"`
	LastSeenAt          *time.Time `json:"last_seen_at,omitempty"`
	CurrentPowerKW      float64    `json:"current_power_kw"`
	CurrentMeterWh      int64      `json:"current_meter_wh"`
	ActiveTransactionID *string    `json:"active_transaction_id,omitempty"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type ChargingSession struct {
	ID            string     `json:"id"`
	TransactionID string     `json:"transaction_id"`
	StationID     string     `json:"station_id"`
	StartTime     time.Time  `json:"start_time"`
	EndTime       *time.Time `json:"end_time,omitempty"`
	StartMeterWh  int64      `json:"start_meter_wh"`
	EndMeterWh    *int64     `json:"end_meter_wh,omitempty"`
	TotalKWh      *float64   `json:"total_kwh,omitempty"`
	TotalCost     *float64   `json:"total_cost,omitempty"`
	PricePerKWh   *float64   `json:"price_per_kwh,omitempty"`
	PricingTariff *string    `json:"pricing_tariff,omitempty"`
	PowerClass    *string    `json:"station_power_class,omitempty"`
}

type MeterValue struct {
	StationID     string    `json:"station_id"`
	TransactionID *string   `json:"transaction_id,omitempty"`
	MeasuredAt    time.Time `json:"measured_at"`
	PowerKW       float64   `json:"power_kw"`
	MeterWh       int64     `json:"meter_wh"`
}

type StationCommand struct {
	ID            string     `json:"id"`
	StationID     string     `json:"station_id"`
	Command       string     `json:"command"`
	TransactionID *string    `json:"transaction_id,omitempty"`
	Status        string     `json:"status"`
	ErrorMessage  *string    `json:"error_message,omitempty"`
	QueuedAt      time.Time  `json:"queued_at"`
	SentAt        *time.Time `json:"sent_at,omitempty"`
	AckedAt       *time.Time `json:"acked_at,omitempty"`
	RetryCount    int        `json:"retry_count"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Migrate(ctx context.Context) error {
	// Runtime migrations keep `docker compose up` self-contained for reviewers.
	if _, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`); err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}

	files, err := migrationFiles()
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(files)

	for _, file := range files {
		version := filepath.Base(file)
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if exists {
			continue
		}
		sql, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}
		if _, err := s.pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply migration %s: %w", version, err)
		}
		if _, err := s.pool.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			return fmt.Errorf("record migration %s: %w", version, err)
		}
	}
	return nil
}

func migrationFiles() ([]string, error) {
	candidates := []string{
		"migrations/*.sql",
		"../../migrations/*.sql",
	}
	for _, pattern := range candidates {
		files, err := filepath.Glob(pattern)
		if err != nil {
			return nil, err
		}
		if len(files) > 0 {
			sort.Strings(files)
			return files, nil
		}
	}
	return nil, fmt.Errorf("no migration files found")
}

func (s *Store) UpsertHeartbeat(ctx context.Context, stationID string, maxPowerKW float64, status string, meterWh int64, seenAt time.Time) (Station, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO stations (id, max_power_kw, status, last_seen_at, current_meter_wh, updated_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (id) DO UPDATE SET
			max_power_kw = GREATEST(stations.max_power_kw, EXCLUDED.max_power_kw),
			status = CASE WHEN stations.status = 'Offline' THEN EXCLUDED.status ELSE stations.status END,
			last_seen_at = EXCLUDED.last_seen_at,
			current_meter_wh = GREATEST(stations.current_meter_wh, EXCLUDED.current_meter_wh),
			updated_at = now()
		RETURNING id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
	`, stationID, maxPowerKW, status, seenAt, meterWh)
	return scanStation(row)
}

func (s *Store) UpsertStatus(ctx context.Context, stationID string, maxPowerKW float64, status string, transactionID *string, meterWh int64, seenAt time.Time) (Station, error) {
	activeTransactionID := transactionID
	if status == "Available" || status == "Faulted" || status == "Offline" {
		activeTransactionID = nil
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO stations (id, max_power_kw, status, last_seen_at, current_meter_wh, active_transaction_id, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (id) DO UPDATE SET
			max_power_kw = GREATEST(stations.max_power_kw, EXCLUDED.max_power_kw),
			status = EXCLUDED.status,
			last_seen_at = EXCLUDED.last_seen_at,
			current_power_kw = CASE
				WHEN EXCLUDED.status IN ('Available', 'Finishing', 'Faulted', 'Offline') THEN 0
				ELSE stations.current_power_kw
			END,
			current_meter_wh = GREATEST(stations.current_meter_wh, EXCLUDED.current_meter_wh),
			active_transaction_id = EXCLUDED.active_transaction_id,
			updated_at = now()
		RETURNING id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
	`, stationID, maxPowerKW, status, seenAt, meterWh, activeTransactionID)
	return scanStation(row)
}

func (s *Store) StartSession(ctx context.Context, stationID, transactionID string, meterWh int64, startedAt time.Time) error {
	defer metrics.ObserveDBWrite("start_session", time.Now())
	_, err := s.pool.Exec(ctx, `
		INSERT INTO charging_sessions (transaction_id, station_id, start_time, start_meter_wh)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (transaction_id) DO NOTHING
	`, transactionID, stationID, startedAt, meterWh)
	return err
}

func (s *Store) StopSession(ctx context.Context, stationID string, transactionID *string, meterWh int64, stoppedAt time.Time, quote pricing.Quote) error {
	defer metrics.ObserveDBWrite("stop_session", time.Now())
	if transactionID != nil && *transactionID != "" {
		_, err := s.pool.Exec(ctx, `
			UPDATE charging_sessions
			SET end_time = $4,
				end_meter_wh = $3,
				total_kwh = GREATEST(($3 - start_meter_wh)::double precision / 1000.0, 0),
				total_cost = GREATEST(($3 - start_meter_wh)::double precision / 1000.0, 0) * $5,
				price_per_kwh = $5,
				pricing_tariff = $6,
				station_power_class = $7,
				updated_at = now()
			WHERE station_id = $1 AND transaction_id = $2 AND end_time IS NULL
		`, stationID, *transactionID, meterWh, stoppedAt, quote.PricePerKWh, quote.TariffName, quote.StationPowerClass)
		return err
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE charging_sessions
		SET end_time = $3,
			end_meter_wh = $2,
			total_kwh = GREATEST(($2 - start_meter_wh)::double precision / 1000.0, 0),
			total_cost = GREATEST(($2 - start_meter_wh)::double precision / 1000.0, 0) * $4,
			price_per_kwh = $4,
			pricing_tariff = $5,
			station_power_class = $6,
			updated_at = now()
		WHERE id = (
			SELECT id FROM charging_sessions
			WHERE station_id = $1 AND end_time IS NULL
			ORDER BY start_time DESC
			LIMIT 1
		)
	`, stationID, meterWh, stoppedAt, quote.PricePerKWh, quote.TariffName, quote.StationPowerClass)
	return err
}

func (s *Store) UpdateSessionRunningCost(ctx context.Context, stationID, transactionID string, meterWh int64, cost float64) error {
	defer metrics.ObserveDBWrite("update_running_cost", time.Now())
	_, err := s.pool.Exec(ctx, `
		UPDATE charging_sessions
		SET total_kwh = GREATEST(($3 - start_meter_wh)::double precision / 1000.0, 0),
			total_cost = $4,
			updated_at = now()
		WHERE station_id = $1 AND transaction_id = $2 AND end_time IS NULL
	`, stationID, transactionID, meterWh, cost)
	return err
}

func (s *Store) InsertMeterValue(ctx context.Context, value MeterValue) (Station, error) {
	defer metrics.ObserveDBWrite("insert_meter", time.Now())
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Station{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO meter_values (station_id, transaction_id, measured_at, power_kw, meter_wh)
		VALUES ($1, $2, $3, $4, $5)
	`, value.StationID, value.TransactionID, value.MeasuredAt, value.PowerKW, value.MeterWh); err != nil {
		return Station{}, err
	}

	row := tx.QueryRow(ctx, `
		UPDATE stations
		SET status = 'Charging',
			last_seen_at = $2,
			current_power_kw = $3,
			current_meter_wh = GREATEST(current_meter_wh, $4),
			active_transaction_id = COALESCE($5, active_transaction_id),
			updated_at = now()
		WHERE id = $1
		RETURNING id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
	`, value.StationID, value.MeasuredAt, value.PowerKW, value.MeterWh, value.TransactionID)
	station, err := scanStation(row)
	if err != nil {
		return Station{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Station{}, err
	}
	return station, nil
}

func (s *Store) ListStations(ctx context.Context) ([]Station, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
		FROM stations
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stations := make([]Station, 0)
	for rows.Next() {
		station, err := scanStation(rows)
		if err != nil {
			return nil, err
		}
		stations = append(stations, station)
	}
	return stations, rows.Err()
}

func (s *Store) GetStation(ctx context.Context, stationID string) (Station, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
		FROM stations
		WHERE id = $1
	`, stationID)
	return scanStation(row)
}

func (s *Store) ListSessions(ctx context.Context, stationID string, limit int) ([]ChargingSession, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, transaction_id, station_id, start_time, end_time, start_meter_wh, end_meter_wh, total_kwh, total_cost, price_per_kwh, pricing_tariff, station_power_class
		FROM charging_sessions
		WHERE station_id = $1
		ORDER BY start_time DESC
		LIMIT $2
	`, stationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]ChargingSession, 0)
	for rows.Next() {
		var session ChargingSession
		if err := rows.Scan(&session.ID, &session.TransactionID, &session.StationID, &session.StartTime, &session.EndTime, &session.StartMeterWh, &session.EndMeterWh, &session.TotalKWh, &session.TotalCost, &session.PricePerKWh, &session.PricingTariff, &session.PowerClass); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) GetOpenSession(ctx context.Context, stationID string) (ChargingSession, error) {
	var session ChargingSession
	row := s.pool.QueryRow(ctx, `
		SELECT id::text, transaction_id, station_id, start_time, end_time, start_meter_wh, end_meter_wh, total_kwh, total_cost, price_per_kwh, pricing_tariff, station_power_class
		FROM charging_sessions
		WHERE station_id = $1 AND end_time IS NULL
		ORDER BY start_time DESC
		LIMIT 1
	`, stationID)
	err := row.Scan(&session.ID, &session.TransactionID, &session.StationID, &session.StartTime, &session.EndTime, &session.StartMeterWh, &session.EndMeterWh, &session.TotalKWh, &session.TotalCost, &session.PricePerKWh, &session.PricingTariff, &session.PowerClass)
	return session, err
}

func (s *Store) CreateCommand(ctx context.Context, stationID, command string, transactionID *string) (StationCommand, error) {
	defer metrics.ObserveDBWrite("create_command", time.Now())
	row := s.pool.QueryRow(ctx, `
		INSERT INTO station_commands (station_id, command, transaction_id)
		VALUES ($1, $2, $3)
		RETURNING id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
	`, stationID, command, transactionID)
	return scanCommand(row)
}

func (s *Store) MarkCommandSent(ctx context.Context, commandID string) (StationCommand, error) {
	defer metrics.ObserveDBWrite("mark_command_sent", time.Now())
	row := s.pool.QueryRow(ctx, `
		UPDATE station_commands
		SET status = 'sent',
			sent_at = COALESCE(sent_at, now()),
			error_message = NULL,
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
	`, commandID)
	return scanCommand(row)
}

func (s *Store) MarkCommandFailed(ctx context.Context, commandID string, publishErr error) (StationCommand, error) {
	defer metrics.ObserveDBWrite("mark_command_failed", time.Now())
	errText := ""
	if publishErr != nil {
		errText = publishErr.Error()
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE station_commands
		SET status = 'failed',
			error_message = $2,
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
	`, commandID, errText)
	return scanCommand(row)
}

func (s *Store) AckCommand(ctx context.Context, commandID, status, reason string) (StationCommand, error) {
	defer metrics.ObserveDBWrite("ack_command", time.Now())
	if status != "acked" {
		status = "failed"
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE station_commands
		SET status = $2,
			error_message = NULLIF($3, ''),
			acked_at = now(),
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
	`, commandID, status, reason)
	return scanCommand(row)
}

func (s *Store) ListMeterValues(ctx context.Context, stationID string, since time.Time, limit int) ([]MeterValue, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT station_id, transaction_id, measured_at, power_kw, meter_wh
		FROM meter_values
		WHERE station_id = $1 AND measured_at >= $2
		ORDER BY measured_at ASC
		LIMIT $3
	`, stationID, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	values := make([]MeterValue, 0)
	for rows.Next() {
		var value MeterValue
		if err := rows.Scan(&value.StationID, &value.TransactionID, &value.MeasuredAt, &value.PowerKW, &value.MeterWh); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *Store) MarkOffline(ctx context.Context, offlineAfter time.Duration) ([]Station, error) {
	rows, err := s.pool.Query(ctx, `
		UPDATE stations
		SET status = 'Offline',
			current_power_kw = 0,
			active_transaction_id = NULL,
			updated_at = now()
		WHERE status <> 'Offline'
			AND (last_seen_at IS NULL OR last_seen_at < now() - ($1 * interval '1 second'))
		RETURNING id, max_power_kw, status, last_seen_at, current_power_kw, current_meter_wh, active_transaction_id, updated_at
	`, offlineAfter.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stations := make([]Station, 0)
	for rows.Next() {
		station, err := scanStation(rows)
		if err != nil {
			return nil, err
		}
		stations = append(stations, station)
	}
	return stations, rows.Err()
}

func scanStation(row pgx.Row) (Station, error) {
	var station Station
	err := row.Scan(
		&station.ID,
		&station.MaxPowerKW,
		&station.Status,
		&station.LastSeenAt,
		&station.CurrentPowerKW,
		&station.CurrentMeterWh,
		&station.ActiveTransactionID,
		&station.UpdatedAt,
	)
	return station, err
}

func (s *Store) ListStaleSentCommands(ctx context.Context, threshold time.Duration, maxRetries int) ([]StationCommand, error) {
	defer metrics.ObserveDBWrite("list_stale_commands", time.Now())
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
		FROM station_commands
		WHERE status = 'sent'
			AND retry_count < $1
			AND sent_at < now() - ($2 * interval '1 second')
		ORDER BY sent_at ASC
		LIMIT 100
	`, maxRetries, threshold.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	commands := make([]StationCommand, 0)
	for rows.Next() {
		cmd, err := scanCommand(rows)
		if err != nil {
			return nil, err
		}
		commands = append(commands, cmd)
	}
	return commands, rows.Err()
}

func (s *Store) BumpCommandRetry(ctx context.Context, commandID string) (StationCommand, error) {
	defer metrics.ObserveDBWrite("bump_command_retry", time.Now())
	row := s.pool.QueryRow(ctx, `
		UPDATE station_commands
		SET retry_count = retry_count + 1,
			sent_at = now(),
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, station_id, command, transaction_id, status, error_message, queued_at, sent_at, acked_at, retry_count, updated_at
	`, commandID)
	return scanCommand(row)
}

func (s *Store) GetPricingSettings(ctx context.Context) (pricing.Settings, error) {
	var settings pricing.Settings
	err := s.pool.QueryRow(ctx, `
		SELECT peak_price_per_kwh, offpeak_price_per_kwh, peak_start_hour, peak_end_hour, dc_multiplier, updated_at
		FROM pricing_settings
		WHERE id = 1
	`).Scan(&settings.PeakPricePerKWh, &settings.OffPeakPricePerKWh, &settings.PeakStartHour, &settings.PeakEndHour, &settings.DCMultiplier, &settings.UpdatedAt)
	return settings, err
}

func (s *Store) SetPricingSettings(ctx context.Context, settings pricing.Settings) error {
	defer metrics.ObserveDBWrite("set_pricing_settings", time.Now())
	_, err := s.pool.Exec(ctx, `
		INSERT INTO pricing_settings (id, peak_price_per_kwh, offpeak_price_per_kwh, peak_start_hour, peak_end_hour, dc_multiplier, updated_at)
		VALUES (1, $1, $2, $3, $4, $5, now())
		ON CONFLICT (id) DO UPDATE SET
			peak_price_per_kwh = EXCLUDED.peak_price_per_kwh,
			offpeak_price_per_kwh = EXCLUDED.offpeak_price_per_kwh,
			peak_start_hour = EXCLUDED.peak_start_hour,
			peak_end_hour = EXCLUDED.peak_end_hour,
			dc_multiplier = EXCLUDED.dc_multiplier,
			updated_at = EXCLUDED.updated_at
	`, settings.PeakPricePerKWh, settings.OffPeakPricePerKWh, settings.PeakStartHour, settings.PeakEndHour, settings.DCMultiplier)
	return err
}

func scanCommand(row pgx.Row) (StationCommand, error) {
	var command StationCommand
	err := row.Scan(
		&command.ID,
		&command.StationID,
		&command.Command,
		&command.TransactionID,
		&command.Status,
		&command.ErrorMessage,
		&command.QueuedAt,
		&command.SentAt,
		&command.AckedAt,
		&command.RetryCount,
		&command.UpdatedAt,
	)
	return command, err
}
