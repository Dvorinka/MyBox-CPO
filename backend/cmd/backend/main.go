package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mybox-cpo/backend/internal/config"
	"mybox-cpo/backend/internal/db"
	"mybox-cpo/backend/internal/httpapi"
	mqttsvc "mybox-cpo/backend/internal/mqtt"
	"mybox-cpo/backend/internal/realtime"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func main() {
	logger, err := zap.NewProduction()
	if err != nil {
		panic(err)
	}
	defer func() { _ = logger.Sync() }()

	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := connectDB(ctx, cfg.DatabaseURL, logger)
	if err != nil {
		logger.Fatal("database connection failed", zap.Error(err))
	}
	defer pool.Close()

	store := db.NewStore(pool)
	if err := store.Migrate(ctx); err != nil {
		logger.Fatal("database migration failed", zap.Error(err))
	}

	hub := realtime.NewHub(logger)
	mqttService := mqttsvc.NewService(cfg, store, hub, logger)
	if err := mqttService.Start(ctx); err != nil {
		logger.Fatal("mqtt startup failed", zap.Error(err))
	}
	defer mqttService.Stop()

	// Offline detection stays in-process so the demo needs no extra worker service.
	go runOfflineDetector(ctx, cfg, store, hub, logger)

	router := httpapi.NewRouter(cfg, store, mqttService, hub, logger)
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      0,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("backend listening", zap.String("addr", cfg.HTTPAddr))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("http server failed", zap.Error(err))
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("http shutdown failed", zap.Error(err))
	}
}

func connectDB(ctx context.Context, databaseURL string, logger *zap.Logger) (*pgxpool.Pool, error) {
	var lastErr error
	for attempt := 1; attempt <= 30; attempt++ {
		pool, err := pgxpool.New(ctx, databaseURL)
		if err == nil {
			pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			err = pool.Ping(pingCtx)
			cancel()
			if err == nil {
				return pool, nil
			}
			pool.Close()
		}
		lastErr = err
		logger.Warn("waiting for database", zap.Int("attempt", attempt), zap.Error(err))
		time.Sleep(2 * time.Second)
	}
	return nil, lastErr
}

func runOfflineDetector(ctx context.Context, cfg config.Config, store *db.Store, hub *realtime.Hub, logger *zap.Logger) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			stations, err := store.MarkOffline(ctx, cfg.OfflineAfter)
			if err != nil {
				logger.Error("offline scan failed", zap.Error(err))
				continue
			}
			for _, station := range stations {
				hub.Broadcast("station_update", station)
			}
		}
	}
}
