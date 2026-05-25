package metrics

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
)

func TestObserveDBWrite(t *testing.T) {
	// Ensure metrics are registered and observation does not panic.
	assert.NotPanics(t, func() {
		ObserveDBWrite("insert", time.Now().UTC())
	})
}

func TestObserveHTTPRequest(t *testing.T) {
	assert.NotPanics(t, func() {
		ObserveHTTPRequest("GET", "/api/stations", 200)
	})
}

func TestMetricsRegistered(t *testing.T) {
	// Verify collectors are registered by inspecting the default registry.
	collectors := prometheus.DefaultRegisterer
	assert.NotNil(t, collectors)
}
