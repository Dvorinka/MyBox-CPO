package metrics

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	HTTPRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "cpo_http_requests_total",
		Help: "Total HTTP requests handled by the backend.",
	}, []string{"method", "path", "status"})

	MQTTMessagesTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "cpo_mqtt_messages_total",
		Help: "Total MQTT messages processed by topic kind.",
	}, []string{"kind"})

	MQTTReconnectsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "cpo_mqtt_reconnects_total",
		Help: "Total MQTT reconnect events.",
	})

	SSEDroppedEventsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "cpo_sse_dropped_events_total",
		Help: "Total dropped SSE events due to slow clients.",
	}, []string{"event_type"})

	DBWriteSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "cpo_db_write_seconds",
		Help:    "Duration of database write operations.",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation"})
)

func init() {
	prometheus.MustRegister(
		HTTPRequestsTotal,
		MQTTMessagesTotal,
		MQTTReconnectsTotal,
		SSEDroppedEventsTotal,
		DBWriteSeconds,
	)
}

func ObserveDBWrite(operation string, started time.Time) {
	DBWriteSeconds.WithLabelValues(operation).Observe(time.Since(started).Seconds())
}

func ObserveHTTPRequest(method, path string, status int) {
	HTTPRequestsTotal.WithLabelValues(method, path, strconv.Itoa(status)).Inc()
}
