package mqtt

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"mybox-cpo/backend/internal/config"
	"mybox-cpo/backend/internal/db"
	"mybox-cpo/backend/internal/realtime"

	paho "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
)

const topicPrefix = "cpo/v1/stations"

type Service struct {
	cfg    config.Config
	store  *db.Store
	hub    *realtime.Hub
	logger *zap.Logger
	client paho.Client
}

type stationMessage struct {
	StationID     string    `json:"station_id"`
	Timestamp     time.Time `json:"timestamp"`
	Status        string    `json:"status,omitempty"`
	TransactionID string    `json:"transaction_id,omitempty"`
	MaxPowerKW    float64   `json:"max_power_kw,omitempty"`
	PowerKW       float64   `json:"power_kw,omitempty"`
	MeterWh       int64     `json:"meter_wh,omitempty"`
}

type commandMessage struct {
	TransactionID string    `json:"transaction_id,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

func NewService(cfg config.Config, store *db.Store, hub *realtime.Hub, logger *zap.Logger) *Service {
	return &Service{cfg: cfg, store: store, hub: hub, logger: logger}
}

func (s *Service) Start(ctx context.Context) error {
	opts := paho.NewClientOptions().
		AddBroker(s.cfg.MQTTBroker).
		SetClientID(s.cfg.MQTTClientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(2 * time.Second).
		SetCleanSession(false)

	opts.OnConnect = func(client paho.Client) {
		s.logger.Info("mqtt connected", zap.String("broker", s.cfg.MQTTBroker))
		subscriptions := map[string]byte{
			topicPrefix + "/+/heartbeat": 1,
			topicPrefix + "/+/status":    1,
			topicPrefix + "/+/meter":     0,
		}
		token := client.SubscribeMultiple(subscriptions, s.handleMessage)
		if token.Wait() && token.Error() != nil {
			s.logger.Error("mqtt subscribe failed", zap.Error(token.Error()))
		}
	}
	opts.OnConnectionLost = func(_ paho.Client, err error) {
		s.logger.Warn("mqtt connection lost", zap.Error(err))
	}

	s.client = paho.NewClient(opts)
	token := s.client.Connect()
	if !token.WaitTimeout(20 * time.Second) {
		return fmt.Errorf("mqtt connect timeout")
	}
	if token.Error() != nil {
		return token.Error()
	}
	return nil
}

func (s *Service) Stop() {
	if s.client != nil && s.client.IsConnected() {
		s.client.Disconnect(250)
	}
}

func (s *Service) StartCharging(ctx context.Context, stationID string) (string, error) {
	transactionID, err := newTransactionID()
	if err != nil {
		return "", err
	}
	msg := commandMessage{TransactionID: transactionID, Timestamp: time.Now().UTC()}
	if err := s.publishCommand(ctx, stationID, "start_charging", msg); err != nil {
		return "", err
	}
	return transactionID, nil
}

func (s *Service) StopCharging(ctx context.Context, stationID string) error {
	msg := commandMessage{Timestamp: time.Now().UTC()}
	return s.publishCommand(ctx, stationID, "stop_charging", msg)
}

func (s *Service) publishCommand(ctx context.Context, stationID, command string, payload commandMessage) error {
	if s.client == nil || !s.client.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	topic := fmt.Sprintf("%s/%s/commands/%s", topicPrefix, stationID, command)
	token := s.client.Publish(topic, 1, false, body)
	done := make(chan struct{})
	go func() {
		token.Wait()
		close(done)
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-done:
		return token.Error()
	}
}

func (s *Service) handleMessage(_ paho.Client, message paho.Message) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stationID, kind, ok := parseTopic(message.Topic())
	if !ok {
		s.logger.Warn("mqtt topic ignored", zap.String("topic", message.Topic()))
		return
	}

	var payload stationMessage
	if err := json.Unmarshal(message.Payload(), &payload); err != nil {
		s.logger.Warn("mqtt payload invalid", zap.String("topic", message.Topic()), zap.Error(err))
		return
	}
	if payload.StationID == "" {
		payload.StationID = stationID
	}
	if payload.Timestamp.IsZero() {
		payload.Timestamp = time.Now().UTC()
	}

	switch kind {
	case "heartbeat":
		station, err := s.store.UpsertHeartbeat(ctx, stationID, payload.MaxPowerKW, defaultStatus(payload.Status), payload.MeterWh, payload.Timestamp)
		s.broadcastOrLog("heartbeat", station, err)
	case "status":
		s.handleStatus(ctx, stationID, payload)
	case "meter":
		s.handleMeter(ctx, stationID, payload)
	}
}

func (s *Service) handleStatus(ctx context.Context, stationID string, payload stationMessage) {
	txID := optionalString(payload.TransactionID)
	if txID != nil && (payload.Status == "Preparing" || payload.Status == "Charging") {
		if err := s.store.StartSession(ctx, stationID, *txID, payload.MeterWh, payload.Timestamp); err != nil {
			s.logger.Error("session start failed", zap.String("station_id", stationID), zap.Error(err))
		}
	}
	if payload.Status == "Available" || payload.Status == "Faulted" {
		if err := s.store.StopSession(ctx, stationID, txID, payload.MeterWh, payload.Timestamp, s.cfg.PricePerKWh); err != nil {
			s.logger.Error("session stop failed", zap.String("station_id", stationID), zap.Error(err))
		}
	}

	station, err := s.store.UpsertStatus(ctx, stationID, payload.MaxPowerKW, defaultStatus(payload.Status), txID, payload.MeterWh, payload.Timestamp)
	s.broadcastOrLog("station_update", station, err)
}

func (s *Service) handleMeter(ctx context.Context, stationID string, payload stationMessage) {
	value := db.MeterValue{
		StationID:     stationID,
		TransactionID: optionalString(payload.TransactionID),
		MeasuredAt:    payload.Timestamp,
		PowerKW:       payload.PowerKW,
		MeterWh:       payload.MeterWh,
	}
	station, err := s.store.InsertMeterValue(ctx, value)
	if err != nil {
		s.logger.Error("meter insert failed", zap.String("station_id", stationID), zap.Error(err))
		return
	}
	s.hub.Broadcast("meter_value", value)
	s.hub.Broadcast("station_update", station)
}

func (s *Service) broadcastOrLog(eventType string, station db.Station, err error) {
	if err != nil {
		s.logger.Error("station update failed", zap.String("event", eventType), zap.Error(err))
		return
	}
	s.hub.Broadcast(eventType, station)
}

func parseTopic(topic string) (stationID string, kind string, ok bool) {
	parts := strings.Split(topic, "/")
	if len(parts) != 5 || parts[0] != "cpo" || parts[1] != "v1" || parts[2] != "stations" {
		return "", "", false
	}
	return parts[3], parts[4], true
}

func defaultStatus(status string) string {
	if status == "" {
		return "Available"
	}
	return status
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func newTransactionID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes[:]), nil
}
