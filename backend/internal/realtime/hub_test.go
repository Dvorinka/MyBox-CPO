package realtime

import (
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestHubBroadcastAndReceive(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	hub := NewHub(logger)

	events := hub.Subscribe()
	defer hub.Unsubscribe(events)

	hub.Broadcast("station_update", map[string]string{"id": "station-1", "status": "Charging"})

	select {
	case evt := <-events:
		if evt.Type != "station_update" {
			t.Fatalf("event type = %s, want station_update", evt.Type)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for event")
	}
}
