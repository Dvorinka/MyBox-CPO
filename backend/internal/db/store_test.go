package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestStationStruct(t *testing.T) {
	// Sanity check that Station struct fields exist.
	s := Station{
		ID:         "station-1",
		MaxPowerKW: 22,
		Status:     "Available",
	}
	assert.Equal(t, "station-1", s.ID)
	assert.Equal(t, 22.0, s.MaxPowerKW)
	assert.Equal(t, "Available", s.Status)
}

func TestMeterValueStruct(t *testing.T) {
	v := MeterValue{
		StationID: "station-1",
		PowerKW:   10.5,
		MeterWh:   1000,
	}
	assert.Equal(t, "station-1", v.StationID)
	assert.Equal(t, 10.5, v.PowerKW)
}

func TestChargingSessionStruct(t *testing.T) {
	s := ChargingSession{
		TransactionID: "tx-1",
		StationID:     "station-1",
		StartMeterWh:  1000,
	}
	assert.Equal(t, "tx-1", s.TransactionID)
}
