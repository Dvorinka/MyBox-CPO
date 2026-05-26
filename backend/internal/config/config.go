package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr           string
	DatabaseURL        string
	MQTTBroker         string
	MQTTClientID       string
	PricePerKWh        float64
	PeakPricePerKWh    float64
	OffPeakPricePerKWh float64
	DCPowerThresholdKW float64
	DCPriceMultiplier  float64
	PeakStartHour      int
	PeakEndHour        int
	OfflineAfter       time.Duration
	CORSAllowedOrigins []string
	JWTSecret          string
	StationKey         string
}

func Load() Config {
	secret := env("JWT_SECRET", "")
	if secret == "" {
		panic("JWT_SECRET environment variable is required")
	}
	return Config{
		HTTPAddr:           env("HTTP_ADDR", ":8080"),
		DatabaseURL:        env("DATABASE_URL", "postgres://cpo:cpo@localhost:5432/cpo?sslmode=disable"),
		MQTTBroker:         env("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTClientID:       env("MQTT_CLIENT_ID", "cpo-backend"),
		PricePerKWh:        envFloat("PRICE_PER_KWH", 8.5),
		PeakPricePerKWh:    envFloat("PEAK_PRICE_PER_KWH", envFloat("PRICE_PER_KWH", 8.5)),
		OffPeakPricePerKWh: envFloat("OFFPEAK_PRICE_PER_KWH", envFloat("PRICE_PER_KWH", 8.5)*0.85),
		DCPowerThresholdKW: envFloat("DC_POWER_THRESHOLD_KW", 50),
		DCPriceMultiplier:  envFloat("DC_PRICE_MULTIPLIER", 1.15),
		PeakStartHour:      envInt("PEAK_START_HOUR", 7),
		PeakEndHour:        envInt("PEAK_END_HOUR", 21),
		OfflineAfter:       time.Duration(envInt("OFFLINE_AFTER_SECONDS", 90)) * time.Second,
		CORSAllowedOrigins: envList("CORS_ALLOWED_ORIGINS", "*"),
		JWTSecret:          secret,
		StationKey:         env("STATION_KEY", ""),
	}
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envFloat(key string, fallback float64) float64 {
	value, err := strconv.ParseFloat(env(key, ""), 64)
	if err != nil {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(env(key, ""))
	if err != nil {
		return fallback
	}
	return value
}

func envList(key, fallback string) []string {
	raw := env(key, fallback)
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			values = append(values, part)
		}
	}
	return values
}
