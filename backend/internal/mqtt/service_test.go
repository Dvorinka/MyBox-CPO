package mqtt

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseTopic(t *testing.T) {
	stationID, kind, ok := parseTopic("cpo/v1/stations/station-1/heartbeat")
	assert.True(t, ok)
	assert.Equal(t, "station-1", stationID)
	assert.Equal(t, "heartbeat", kind)

	_, _, ok = parseTopic("invalid/topic")
	assert.False(t, ok)
}

func TestDefaultStatus(t *testing.T) {
	assert.Equal(t, "Available", defaultStatus(""))
	assert.Equal(t, "Charging", defaultStatus("Charging"))
}

func TestOptionalString(t *testing.T) {
	assert.Nil(t, optionalString(""))
	assert.Nil(t, optionalString("   "))
	assert.NotNil(t, optionalString("tx-1"))
	assert.Equal(t, "tx-1", *optionalString("tx-1"))
}
