package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"mybox-cpo/backend/internal/config"
	"mybox-cpo/backend/internal/db"
	"mybox-cpo/backend/internal/metrics"
	mqttsvc "mybox-cpo/backend/internal/mqtt"
	"mybox-cpo/backend/internal/realtime"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

type API struct {
	cfg    config.Config
	store  *db.Store
	mqtt   *mqttsvc.Service
	hub    *realtime.Hub
	logger *zap.Logger
}

func NewRouter(cfg config.Config, store *db.Store, mqtt *mqttsvc.Service, hub *realtime.Hub, logger *zap.Logger) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	api := &API{cfg: cfg, store: store, mqtt: mqtt, hub: hub, logger: logger}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(requestLogger(logger))
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/health", api.health)
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))
	group := router.Group("/api")
	group.GET("/events", api.events)
	group.GET("/stations", api.listStations)
	group.GET("/stations/:id", api.getStation)
	group.GET("/stations/:id/sessions", api.listSessions)
	group.GET("/stations/:id/meter-values", api.listMeterValues)
	group.POST("/stations/:id/start", api.startCharging)
	group.POST("/stations/:id/stop", api.stopCharging)

	return router
}

func (a *API) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now().UTC()})
}

func (a *API) listStations(c *gin.Context) {
	stations, err := a.store.ListStations(c.Request.Context())
	if err != nil {
		a.fail(c, http.StatusInternalServerError, "list stations failed", err)
		return
	}
	c.JSON(http.StatusOK, stations)
}

func (a *API) getStation(c *gin.Context) {
	station, err := a.store.GetStation(c.Request.Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			a.fail(c, http.StatusNotFound, "station not found", err)
			return
		}
		a.fail(c, http.StatusInternalServerError, "get station failed", err)
		return
	}
	c.JSON(http.StatusOK, station)
}

func (a *API) listSessions(c *gin.Context) {
	limit := boundedInt(c.Query("limit"), 100, 1, 500)
	sessions, err := a.store.ListSessions(c.Request.Context(), c.Param("id"), limit)
	if err != nil {
		a.fail(c, http.StatusInternalServerError, "list sessions failed", err)
		return
	}
	c.JSON(http.StatusOK, sessions)
}

func (a *API) listMeterValues(c *gin.Context) {
	minutes := boundedInt(c.Query("minutes"), 30, 1, 24*60)
	limit := boundedInt(c.Query("limit"), 1000, 1, 5000)
	values, err := a.store.ListMeterValues(c.Request.Context(), c.Param("id"), time.Now().Add(-time.Duration(minutes)*time.Minute), limit)
	if err != nil {
		a.fail(c, http.StatusInternalServerError, "list meter values failed", err)
		return
	}
	c.JSON(http.StatusOK, values)
}

func (a *API) startCharging(c *gin.Context) {
	stationID := c.Param("id")
	if _, err := a.store.GetStation(c.Request.Context(), stationID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			a.fail(c, http.StatusNotFound, "station not found", err)
			return
		}
		a.fail(c, http.StatusInternalServerError, "get station failed", err)
		return
	}
	transactionID, command, err := a.mqtt.StartCharging(c.Request.Context(), stationID)
	if err != nil {
		a.fail(c, http.StatusBadGateway, "start command failed", err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{
		"station_id":     stationID,
		"transaction_id": transactionID,
		"command_id":     command.ID,
		"command_status": command.Status,
	})
}

func (a *API) stopCharging(c *gin.Context) {
	stationID := c.Param("id")
	if _, err := a.store.GetStation(c.Request.Context(), stationID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			a.fail(c, http.StatusNotFound, "station not found", err)
			return
		}
		a.fail(c, http.StatusInternalServerError, "get station failed", err)
		return
	}
	command, err := a.mqtt.StopCharging(c.Request.Context(), stationID)
	if err != nil {
		a.fail(c, http.StatusBadGateway, "stop command failed", err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{
		"station_id":     stationID,
		"status":         command.Status,
		"command_id":     command.ID,
		"command_status": command.Status,
	})
}

func (a *API) events(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		a.fail(c, http.StatusInternalServerError, "streaming unsupported", nil)
		return
	}

	events := a.hub.Subscribe()
	defer a.hub.Unsubscribe(events)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event := <-events:
			_, _ = fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event.Type, event.Data)
			flusher.Flush()
		case <-heartbeat.C:
			_, _ = fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func (a *API) fail(c *gin.Context, status int, message string, err error) {
	if err != nil {
		a.logger.Warn("api error", zap.String("message", message), zap.Error(err))
	}
	c.JSON(status, gin.H{"error": message})
}

func boundedInt(raw string, fallback, min, max int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func requestLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info("http request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
		)
		metrics.ObserveHTTPRequest(c.Request.Method, c.FullPath(), c.Writer.Status())
	}
}
