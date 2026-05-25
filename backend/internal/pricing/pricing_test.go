package pricing

import (
	"testing"
	"time"

	"mybox-cpo/backend/internal/config"
)

func TestQuote(t *testing.T) {
	service := NewService(config.Config{
		PeakPricePerKWh:    10,
		OffPeakPricePerKWh: 6,
		DCPowerThresholdKW: 50,
		DCPriceMultiplier:  1.2,
		PeakStartHour:      7,
		PeakEndHour:        21,
	})

	tests := []struct {
		name       string
		powerKW    float64
		hour       int
		wantTariff string
		wantPrice  float64
	}{
		{"ac peak", 22, 10, "ac_peak", 10},
		{"ac offpeak", 22, 23, "ac_offpeak", 6},
		{"dc peak", 150, 10, "dc_peak", 12},
		{"dc offpeak", 150, 23, "dc_offpeak", 7.2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := service.Quote(tt.powerKW, time.Date(2026, 5, 25, tt.hour, 0, 0, 0, time.UTC))
			if got.TariffName != tt.wantTariff {
				t.Fatalf("tariff = %s, want %s", got.TariffName, tt.wantTariff)
			}
			if got.PricePerKWh != tt.wantPrice {
				t.Fatalf("price = %.2f, want %.2f", got.PricePerKWh, tt.wantPrice)
			}
		})
	}
}

func TestOvernightPeakWindow(t *testing.T) {
	if !isPeak(23, 21, 6) || !isPeak(3, 21, 6) || isPeak(12, 21, 6) {
		t.Fatal("overnight peak window mismatch")
	}
}
