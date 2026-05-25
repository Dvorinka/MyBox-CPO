//go:build integration

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"mybox-cpo/backend/internal/auth"
	"mybox-cpo/backend/internal/config"
	"mybox-cpo/backend/internal/db"
	mqttsvc "mybox-cpo/backend/internal/mqtt"
	"mybox-cpo/backend/internal/realtime"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"go.uber.org/zap"
)

func setupTestAPI(t *testing.T) (config.Config, *db.Store, *realtime.Hub, *mqttsvc.Service) {
	ctx := context.Background()
	container, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("cpo"),
		postgres.WithUsername("cpo"),
		postgres.WithPassword("cpo"),
		testcontainers.WithWaitStrategy(wait.ForListeningPort("5432/tcp")),
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = testcontainers.TerminateContainer(container)
	})

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(func() { pool.Close() })

	store := db.NewStore(pool)
	require.NoError(t, store.Migrate(ctx))

	logger, _ := zap.NewDevelopment()
	hub := realtime.NewHub(logger)
	cfg := config.Config{
		HTTPAddr:           ":8080",
		DatabaseURL:        dsn,
		JWTSecret:          "test-secret",
		OfflineAfter:       90 * time.Second,
		CORSAllowedOrigins: []string{"*"},
		PeakStartHour:      7,
		PeakEndHour:        21,
		PeakPricePerKWh:    10,
		OffPeakPricePerKWh: 6,
		DCPowerThresholdKW: 50,
		DCPriceMultiplier:  1.2,
	}
	mqtt := mqttsvc.NewService(cfg, store, hub, logger)
	return cfg, store, hub, mqtt
}

func TestHealth(t *testing.T) {
	cfg, store, hub, mqtt := setupTestAPI(t)
	logger, _ := zap.NewDevelopment()
	router := NewRouter(cfg, store, mqtt, hub, logger)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "ok")
}

func TestListStations_Unauthorized(t *testing.T) {
	cfg, store, hub, mqtt := setupTestAPI(t)
	logger, _ := zap.NewDevelopment()
	router := NewRouter(cfg, store, mqtt, hub, logger)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/stations", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestLoginAndListStations(t *testing.T) {
	cfg, store, hub, mqtt := setupTestAPI(t)
	logger, _ := zap.NewDevelopment()
	router := NewRouter(cfg, store, mqtt, hub, logger)

	// Login
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "admin"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var loginResp struct {
		Token string `json:"token"`
		Type  string `json:"type"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &loginResp))
	assert.NotEmpty(t, loginResp.Token)

	// List stations with auth
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/stations", nil)
	req.Header.Set("Authorization", "Bearer "+loginResp.Token)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var stations []db.Station
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &stations))
	assert.Len(t, stations, 0)
}

func TestGetStation_NotFound(t *testing.T) {
	cfg, store, hub, mqtt := setupTestAPI(t)
	logger, _ := zap.NewDevelopment()
	router := NewRouter(cfg, store, mqtt, hub, logger)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/stations/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+generateTestToken(t, cfg.JWTSecret))
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestStartCharging_NoMQTT(t *testing.T) {
	cfg, store, hub, mqtt := setupTestAPI(t)
	logger, _ := zap.NewDevelopment()
	router := NewRouter(cfg, store, mqtt, hub, logger)

	ctx := context.Background()
	_, err := store.UpsertStatus(ctx, "station-1", 22, "Available", nil, 1000, time.Now().UTC())
	require.NoError(t, err)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/stations/station-1/start", nil)
	req.Header.Set("Authorization", "Bearer "+generateTestToken(t, cfg.JWTSecret))
	router.ServeHTTP(w, req)

	// MQTT is not connected in test setup → expect BadGateway
	assert.Equal(t, http.StatusBadGateway, w.Code)
}

func generateTestToken(t *testing.T, secret string) string {
	svc := auth.NewService(secret)
	token, err := svc.Generate("admin")
	require.NoError(t, err)
	return token
}
