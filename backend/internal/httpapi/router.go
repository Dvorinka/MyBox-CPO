package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"mybox-cpo/backend/internal/auth"
	"mybox-cpo/backend/internal/config"
	"mybox-cpo/backend/internal/db"
	"mybox-cpo/backend/internal/metrics"
	mqttsvc "mybox-cpo/backend/internal/mqtt"
	"mybox-cpo/backend/internal/pricing"
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
	authService := auth.NewService(cfg.JWTSecret)

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(requestLogger(logger))
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/health", api.health)
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Public API routes (no auth required for SSE, login, refresh)
	public := router.Group("/api")
	public.POST("/login", api.login(authService))
	public.POST("/refresh", api.refresh(authService))
	public.POST("/logout", api.logout)
	public.GET("/events", api.events)

	// Protected API routes
	protected := router.Group("/api")
	protected.Use(authService.Middleware())
	protected.GET("/me", api.me)
	protected.GET("/stations", api.listStations)
	protected.GET("/stations/:id", api.getStation)
	protected.GET("/stations/:id/sessions", api.listSessions)
	protected.GET("/stations/:id/meter-values", api.listMeterValues)
	protected.POST("/stations/:id/start", api.startCharging)
	protected.POST("/stations/:id/stop", api.stopCharging)
	protected.GET("/pricing", api.getPricing)
	protected.PUT("/pricing", api.setPricing)

	return router
}

func (a *API) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now().UTC()})
}

func (a *API) me(c *gin.Context) {
	claims, ok := c.Get("authClaims")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.JSON(http.StatusOK, claims)
}

func setTokenCookies(c *gin.Context, accessToken, refreshToken string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", accessToken, 3600, "/", "", false, true)
	c.SetCookie("refresh_token", refreshToken, 7*24*3600, "/api/refresh", "", false, true)
}

func clearTokenCookies(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", "", -1, "/", "", false, true)
	c.SetCookie("refresh_token", "", -1, "/api/refresh", "", false, true)
}

func (a *API) login(authService auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			a.fail(c, http.StatusBadRequest, "invalid request body", err)
			return
		}
		// Demo credentials — in production this would validate against a user store.
		if req.Username != "admin" || req.Password != "admin" {
			a.fail(c, http.StatusUnauthorized, "invalid credentials", nil)
			return
		}
		accessToken, refreshToken, err := authService.GeneratePair(req.Username)
		if err != nil {
			a.fail(c, http.StatusInternalServerError, "token generation failed", err)
			return
		}
		setTokenCookies(c, accessToken, refreshToken)
		c.JSON(http.StatusOK, gin.H{"type": "Bearer"})
	}
}

func (a *API) refresh(authService auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		refreshToken, err := c.Cookie("refresh_token")
		if err != nil || refreshToken == "" {
			a.fail(c, http.StatusUnauthorized, "missing refresh token", nil)
			return
		}
		claims, err := authService.ParseRefresh(refreshToken)
		if err != nil {
			clearTokenCookies(c)
			a.fail(c, http.StatusUnauthorized, "invalid refresh token", err)
			return
		}
		accessToken, newRefresh, err := authService.GeneratePair(claims.UserID)
		if err != nil {
			a.fail(c, http.StatusInternalServerError, "token generation failed", err)
			return
		}
		setTokenCookies(c, accessToken, newRefresh)
		c.JSON(http.StatusOK, gin.H{"type": "Bearer"})
	}
}

func (a *API) logout(c *gin.Context) {
	clearTokenCookies(c)
	c.JSON(http.StatusOK, gin.H{"status": "logged out"})
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

func (a *API) getPricing(c *gin.Context) {
	settings, err := a.store.GetPricingSettings(c.Request.Context())
	if err != nil {
		a.fail(c, http.StatusInternalServerError, "pricing settings read failed", err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (a *API) setPricing(c *gin.Context) {
	var req pricing.Settings
	if err := c.ShouldBindJSON(&req); err != nil {
		a.fail(c, http.StatusBadRequest, "invalid pricing settings body", err)
		return
	}
	if req.PeakStartHour < 0 || req.PeakStartHour > 23 || req.PeakEndHour < 0 || req.PeakEndHour > 23 {
		a.fail(c, http.StatusBadRequest, "peak hours must be 0-23", nil)
		return
	}
	if req.PeakPricePerKWh < 0 || req.OffPeakPricePerKWh < 0 || req.DCMultiplier < 0 {
		a.fail(c, http.StatusBadRequest, "prices and multiplier must be non-negative", nil)
		return
	}
	if err := a.store.SetPricingSettings(c.Request.Context(), req); err != nil {
		a.fail(c, http.StatusInternalServerError, "pricing settings write failed", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
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
