package pricing

import (
	"time"

	"mybox-cpo/backend/internal/config"
)

type Quote struct {
	TariffName        string  `json:"tariff_name"`
	StationPowerClass string  `json:"station_power_class"`
	PricePerKWh       float64 `json:"price_per_kwh"`
}

type Service struct {
	cfg config.Config
}

func NewService(cfg config.Config) Service {
	return Service{cfg: cfg}
}

func (s Service) Quote(maxPowerKW float64, at time.Time) Quote {
	powerClass := "ac"
	multiplier := 1.0
	if maxPowerKW >= s.cfg.DCPowerThresholdKW {
		powerClass = "dc"
		multiplier = s.cfg.DCPriceMultiplier
	}

	period := "offpeak"
	price := s.cfg.OffPeakPricePerKWh
	if isPeak(at.Hour(), s.cfg.PeakStartHour, s.cfg.PeakEndHour) {
		period = "peak"
		price = s.cfg.PeakPricePerKWh
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

func roundMoney(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
