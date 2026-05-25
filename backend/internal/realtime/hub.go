package realtime

import (
	"encoding/json"
	"sync"

	"mybox-cpo/backend/internal/metrics"

	"go.uber.org/zap"
)

type Event struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
	logger  *zap.Logger
}

func NewHub(logger *zap.Logger) *Hub {
	return &Hub{
		clients: make(map[chan Event]struct{}),
		logger:  logger,
	}
}

func (h *Hub) Subscribe() chan Event {
	ch := make(chan Event, 32)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	if _, ok := h.clients[ch]; ok {
		delete(h.clients, ch)
		close(ch)
	}
	h.mu.Unlock()
}

func (h *Hub) Broadcast(eventType string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		h.logger.Error("realtime marshal failed", zap.Error(err))
		return
	}
	event := Event{Type: eventType, Data: data}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients {
		select {
		case ch <- event:
		default:
			metrics.SSEDroppedEventsTotal.WithLabelValues(eventType).Inc()
			h.logger.Warn("dropping realtime event for slow client", zap.String("type", eventType))
		}
	}
}
