package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

const topicPrefix = "cpo/v1/stations"

type Config struct {
	StationID        string
	MQTTBroker       string
	MaxPowerKW       float64
	FaultProbability float64
}

type Station struct {
	cfg           Config
	client        paho.Client
	mu            sync.Mutex
	status        string
	transactionID string
	meterWh       int64
	lastMeterAt   time.Time
}

type telemetry struct {
	StationID     string    `json:"station_id"`
	Timestamp     time.Time `json:"timestamp"`
	Status        string    `json:"status,omitempty"`
	TransactionID string    `json:"transaction_id,omitempty"`
	MaxPowerKW    float64   `json:"max_power_kw,omitempty"`
	PowerKW       float64   `json:"power_kw,omitempty"`
	MeterWh       int64     `json:"meter_wh,omitempty"`
}

type command struct {
	CommandID     string    `json:"command_id"`
	TransactionID string    `json:"transaction_id,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

type commandAck struct {
	CommandID     string    `json:"command_id"`
	StationID     string    `json:"station_id"`
	TransactionID string    `json:"transaction_id,omitempty"`
	Status        string    `json:"status"`
	Reason        string    `json:"reason,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

func main() {
	cfg := loadConfig()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	station := &Station{
		cfg:         cfg,
		status:      "Available",
		meterWh:     int64(2000 + rand.IntN(5000)),
		lastMeterAt: time.Now().UTC(),
	}
	if err := station.connect(); err != nil {
		panic(err)
	}
	defer station.client.Disconnect(250)

	station.publishStatus()
	station.publishHeartbeat()
	station.run(ctx)
}

func loadConfig() Config {
	return Config{
		StationID:        env("STATION_ID", "station-1"),
		MQTTBroker:       env("MQTT_BROKER", "tcp://localhost:1883"),
		MaxPowerKW:       envFloat("MAX_POWER_KW", 22),
		FaultProbability: envFloat("FAULT_PROBABILITY", 0.01),
	}
}

func (s *Station) connect() error {
	opts := paho.NewClientOptions().
		AddBroker(s.cfg.MQTTBroker).
		SetClientID("sim-" + s.cfg.StationID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(2 * time.Second).
		SetCleanSession(false)

	opts.OnConnect = func(client paho.Client) {
		topic := fmt.Sprintf("%s/%s/commands/+", topicPrefix, s.cfg.StationID)
		token := client.Subscribe(topic, 1, s.handleCommand)
		if token.Wait() && token.Error() != nil {
			fmt.Fprintf(os.Stderr, "subscribe failed: %v\n", token.Error())
		}
	}

	s.client = paho.NewClient(opts)
	token := s.client.Connect()
	if !token.WaitTimeout(30 * time.Second) {
		return fmt.Errorf("mqtt connect timeout")
	}
	return token.Error()
}

func (s *Station) run(ctx context.Context) {
	heartbeat := time.NewTicker(30 * time.Second)
	meter := time.NewTicker(5 * time.Second)
	defer heartbeat.Stop()
	defer meter.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			s.publishHeartbeat()
		case <-meter.C:
			s.tickCharging()
		}
	}
}

func (s *Station) handleCommand(_ paho.Client, message paho.Message) {
	var payload command
	if err := json.Unmarshal(message.Payload(), &payload); err != nil {
		fmt.Fprintf(os.Stderr, "bad command: %v\n", err)
		return
	}
	switch {
	case strings.HasSuffix(message.Topic(), "/start_charging"):
		s.start(payload)
	case strings.HasSuffix(message.Topic(), "/stop_charging"):
		s.stop(payload)
	}
}

func (s *Station) start(payload command) {
	if payload.TransactionID == "" {
		s.publishAck(payload, "rejected", "missing transaction_id")
		return
	}
	s.mu.Lock()
	if s.status != "Available" {
		reason := "station is " + s.status
		s.mu.Unlock()
		s.publishAck(payload, "rejected", reason)
		return
	}
	s.status = "Preparing"
	s.transactionID = payload.TransactionID
	s.lastMeterAt = time.Now().UTC()
	s.mu.Unlock()
	s.publishAck(payload, "accepted", "")
	s.publishStatus()

	go func() {
		time.Sleep(2 * time.Second)
		s.mu.Lock()
		if s.status == "Preparing" && s.transactionID == payload.TransactionID {
			s.status = "Charging"
			s.lastMeterAt = time.Now().UTC()
		}
		s.mu.Unlock()
		s.publishStatus()
	}()
}

func (s *Station) stop(payload command) {
	s.mu.Lock()
	if s.status != "Preparing" && s.status != "Charging" {
		reason := "station is " + s.status
		s.mu.Unlock()
		s.publishAck(payload, "rejected", reason)
		return
	}
	s.status = "Finishing"
	s.mu.Unlock()
	s.publishAck(payload, "accepted", "")
	s.publishStatus()

	go func() {
		time.Sleep(2 * time.Second)
		s.mu.Lock()
		s.status = "Available"
		s.transactionID = ""
		s.lastMeterAt = time.Now().UTC()
		s.mu.Unlock()
		s.publishStatus()
	}()
}

func (s *Station) publishAck(payload command, status, reason string) {
	body, err := json.Marshal(commandAck{
		CommandID:     payload.CommandID,
		StationID:     s.cfg.StationID,
		TransactionID: payload.TransactionID,
		Status:        status,
		Reason:        reason,
		Timestamp:     time.Now().UTC(),
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ack marshal failed: %v\n", err)
		return
	}
	topic := fmt.Sprintf("%s/%s/command_acks", topicPrefix, s.cfg.StationID)
	token := s.client.Publish(topic, 1, false, body)
	token.WaitTimeout(3 * time.Second)
	if token.Error() != nil {
		fmt.Fprintf(os.Stderr, "ack publish failed: %v\n", token.Error())
	}
}

func (s *Station) tickCharging() {
	s.mu.Lock()
	if s.status != "Charging" {
		s.mu.Unlock()
		return
	}
	now := time.Now().UTC()
	elapsedHours := now.Sub(s.lastMeterAt).Hours()
	power := s.currentPowerKW(now)
	s.meterWh += int64(math.Round(power * 1000 * elapsedHours))
	s.lastMeterAt = now
	txID := s.transactionID
	meterWh := s.meterWh
	fault := rand.Float64() < s.cfg.FaultProbability
	if fault {
		s.status = "Faulted"
		s.transactionID = ""
	}
	status := s.status
	s.mu.Unlock()

	s.publish("meter", telemetry{
		StationID:     s.cfg.StationID,
		Timestamp:     now,
		TransactionID: txID,
		PowerKW:       power,
		MeterWh:       meterWh,
	})
	if fault {
		s.publishStatusWith(status, txID, meterWh)
	}
}

func (s *Station) currentPowerKW(now time.Time) float64 {
	wave := 0.85 + 0.1*math.Sin(float64(now.Unix())/18)
	noise := 0.95 + rand.Float64()*0.1
	return math.Round(s.cfg.MaxPowerKW*wave*noise*100) / 100
}

func (s *Station) publishHeartbeat() {
	s.mu.Lock()
	payload := telemetry{
		StationID:  s.cfg.StationID,
		Timestamp:  time.Now().UTC(),
		Status:     s.status,
		MaxPowerKW: s.cfg.MaxPowerKW,
		MeterWh:    s.meterWh,
	}
	s.mu.Unlock()
	s.publish("heartbeat", payload)
}

func (s *Station) publishStatus() {
	s.mu.Lock()
	status := s.status
	txID := s.transactionID
	meterWh := s.meterWh
	s.mu.Unlock()
	s.publishStatusWith(status, txID, meterWh)
}

func (s *Station) publishStatusWith(status, transactionID string, meterWh int64) {
	s.publish("status", telemetry{
		StationID:     s.cfg.StationID,
		Timestamp:     time.Now().UTC(),
		Status:        status,
		TransactionID: transactionID,
		MaxPowerKW:    s.cfg.MaxPowerKW,
		MeterWh:       meterWh,
	})
}

func (s *Station) publish(kind string, payload telemetry) {
	body, err := json.Marshal(payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal failed: %v\n", err)
		return
	}
	topic := fmt.Sprintf("%s/%s/%s", topicPrefix, s.cfg.StationID, kind)
	qos := byte(1)
	if kind == "meter" {
		qos = 0
	}
	// Retain only status so reconnecting backends recover current station state.
	token := s.client.Publish(topic, qos, kind == "status", body)
	token.WaitTimeout(3 * time.Second)
	if token.Error() != nil {
		fmt.Fprintf(os.Stderr, "publish failed: %v\n", token.Error())
	}
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envFloat(key string, fallback float64) float64 {
	value, err := strconv.ParseFloat(env(key, ""), 64)
	if err != nil {
		return fallback
	}
	return value
}
