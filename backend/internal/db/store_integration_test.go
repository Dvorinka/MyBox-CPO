//go:build integration

package db

import (
	"context"
	"testing"
	"time"

	"mybox-cpo/backend/internal/pricing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestSessionLifecycleWithPostgres(t *testing.T) {
	ctx := context.Background()
	container, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("cpo"),
		postgres.WithUsername("cpo"),
		postgres.WithPassword("cpo"),
		testcontainers.WithWaitStrategy(wait.ForListeningPort("5432/tcp")),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	defer func() {
		if err := testcontainers.TerminateContainer(container); err != nil {
			t.Fatalf("terminate postgres container: %v", err)
		}
	}()

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect postgres: %v", err)
	}
	defer pool.Close()

	store := NewStore(pool)
	if err := store.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	now := time.Now().UTC()
	if _, err := store.UpsertStatus(ctx, "station-1", 150, "Available", nil, 1000, now); err != nil {
		t.Fatalf("upsert status: %v", err)
	}
	if err := store.StartSession(ctx, "station-1", "tx-1", 1000, now); err != nil {
		t.Fatalf("start session: %v", err)
	}
	if _, err := store.InsertMeterValue(ctx, MeterValue{
		StationID:     "station-1",
		TransactionID: ptr("tx-1"),
		MeasuredAt:    now.Add(5 * time.Second),
		PowerKW:       120,
		MeterWh:       2500,
	}); err != nil {
		t.Fatalf("insert meter: %v", err)
	}
	if err := store.StopSession(ctx, "station-1", ptr("tx-1"), 2500, now.Add(10*time.Second), pricing.Quote{
		TariffName:        "dc_peak",
		StationPowerClass: "dc",
		PricePerKWh:       9.75,
	}); err != nil {
		t.Fatalf("stop session: %v", err)
	}

	sessions, err := store.ListSessions(ctx, "station-1", 10)
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	if sessions[0].TotalKWh == nil || *sessions[0].TotalKWh != 1.5 {
		t.Fatalf("total_kwh = %v, want 1.5", sessions[0].TotalKWh)
	}
	if sessions[0].PricingTariff == nil || *sessions[0].PricingTariff != "dc_peak" {
		t.Fatalf("pricing_tariff = %v, want dc_peak", sessions[0].PricingTariff)
	}
}

func ptr[T any](value T) *T {
	return &value
}
