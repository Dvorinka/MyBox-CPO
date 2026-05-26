package pricing

import (
	"context"
	"time"

	"mybox-cpo/backend/internal/config"
)

type Settings struct {
	PeakPricePerKWh    float64   `json:"peak_price_per_kwh"`
	OffPeakPricePerKWh float64   `json:"offpeak_price_per_kwh"`
	PeakStartHour      int       `json:"peak_start_hour"`
	PeakEndHour        int       `json:"peak_end_hour"`
	DCMultiplier       float64   `json:"dc_multiplier"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type Quote struct {
	TariffName        string  `json:"tariff_name"`
	StationPowerClass string  `json:"station_power_class"`
	PricePerKWh       float64 `json:"price_per_kwh"`
}

type Store interface {
	GetPricingSettings(ctx context.Context) (Settings, error)
}

type Service struct {
	cfg   config.Config
	store Store
}

func NewService(cfg config.Config, store Store) Service {
	return Service{cfg: cfg, store: store}
}

func (s Service) Quote(maxPowerKW float64, at time.Time) Quote {
	settings, err := s.store.GetPricingSettings(context.Background())
	if err != nil {
		// Fallback to env config if DB read fails
		settings = Settings{
			PeakPricePerKWh:    s.cfg.PeakPricePerKWh,
			OffPeakPricePerKWh: s.cfg.OffPeakPricePerKWh,
			PeakStartHour:      s.cfg.PeakStartHour,
			PeakEndHour:        s.cfg.PeakEndHour,
			DCMultiplier:       s.cfg.DCPriceMultiplier,
		}
	}

	powerClass := "ac"
	multiplier := 1.0
	if maxPowerKW >= s.cfg.DCPowerThresholdKW {
		powerClass = "dc"
		multiplier = settings.DCMultiplier
	}

	period := "offpeak"
	price := settings.OffPeakPricePerKWh
	if isPeak(at.Hour(), settings.PeakStartHour, settings.PeakEndHour) {
		period = "peak"
		price = settings.PeakPricePerKWh
	}

	return Quote{
		TariffName:        powerClass + "_" + period,
		StationPowerClass: powerClass,
		PricePerKWh:       roundMoney(price * multiplier),
	}
}

func isPeak(hour, start, end int) bool {
	if start == end {
		return true
	}
	if start < end {
		return hour >= start && hour < end
	}
	return hour >= start || hour < end
}

func (s Service) RunningCost(startMeterWh, currentMeterWh int64, maxPowerKW float64, startTime time.Time) float64 {
	quote := s.Quote(maxPowerKW, startTime)
	kwh := float64(currentMeterWh-startMeterWh) / 1000.0
	if kwh < 0 {
		kwh = 0
	}
	return roundMoney(kwh * quote.PricePerKWh)
}

func roundMoney(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
