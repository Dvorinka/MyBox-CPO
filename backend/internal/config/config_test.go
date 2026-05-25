package config

import (
	"os"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg := Load()

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("HTTPAddr = %s, want :8080", cfg.HTTPAddr)
	}
	if cfg.OfflineAfter != 90*time.Second {
		t.Fatalf("OfflineAfter = %v, want 90s", cfg.OfflineAfter)
	}
	if cfg.PeakPricePerKWh != 8.5 {
		t.Fatalf("PeakPricePerKWh = %v, want 8.5", cfg.PeakPricePerKWh)
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("HTTP_ADDR", ":9090")
	os.Setenv("OFFLINE_AFTER_SECONDS", "120")
	os.Setenv("PRICE_PER_KWH", "10.0")
	defer func() {
		os.Unsetenv("HTTP_ADDR")
		os.Unsetenv("OFFLINE_AFTER_SECONDS")
		os.Unsetenv("PRICE_PER_KWH")
	}()

	cfg := Load()
	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("HTTPAddr = %s, want :9090", cfg.HTTPAddr)
	}
	if cfg.OfflineAfter != 120*time.Second {
		t.Fatalf("OfflineAfter = %v, want 120s", cfg.OfflineAfter)
	}
	if cfg.PeakPricePerKWh != 10.0 {
		t.Fatalf("PeakPricePerKWh = %v, want 10.0", cfg.PeakPricePerKWh)
	}
}
