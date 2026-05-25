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
	OfflineAfter       time.Duration
	CORSAllowedOrigins []string
}

func Load() Config {
	return Config{
		HTTPAddr:           env("HTTP_ADDR", ":8080"),
		DatabaseURL:        env("DATABASE_URL", "postgres://cpo:cpo@localhost:5432/cpo?sslmode=disable"),
		MQTTBroker:         env("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTClientID:       env("MQTT_CLIENT_ID", "cpo-backend"),
		PricePerKWh:        envFloat("PRICE_PER_KWH", 8.5),
		OfflineAfter:       time.Duration(envInt("OFFLINE_AFTER_SECONDS", 90)) * time.Second,
		CORSAllowedOrigins: envList("CORS_ALLOWED_ORIGINS", "*"),
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
