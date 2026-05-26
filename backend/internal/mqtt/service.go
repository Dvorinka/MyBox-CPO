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
	"mybox-cpo/backend/internal/metrics"
	"mybox-cpo/backend/internal/pricing"
	"mybox-cpo/backend/internal/realtime"

	paho "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
)

const topicPrefix = "cpo/v1/stations"

type Service struct {
	cfg    config.Config
	store  *db.Store
	hub    *realtime.Hub
	pricer pricing.Service
	logger *zap.Logger
	client paho.Client
}

type stationMessage struct {
	StationID     string    `json:"station_id"`
	StationKey    string    `json:"station_key,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
	Status        string    `json:"status,omitempty"`
	TransactionID string    `json:"transaction_id,omitempty"`
	MaxPowerKW    float64   `json:"max_power_kw,omitempty"`
	PowerKW       float64   `json:"power_kw,omitempty"`
	MeterWh       int64     `json:"meter_wh,omitempty"`
}

type commandMessage struct {
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

func NewService(cfg config.Config, store *db.Store, hub *realtime.Hub, logger *zap.Logger) *Service {
	return &Service{cfg: cfg, store: store, hub: hub, pricer: pricing.NewService(cfg, store), logger: logger}
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
			topicPrefix + "/+/heartbeat":    1,
			topicPrefix + "/+/status":       1,
			topicPrefix + "/+/meter":        0,
			topicPrefix + "/+/command_acks": 1,
		}
		token := client.SubscribeMultiple(subscriptions, s.handleMessage)
		if token.Wait() && token.Error() != nil {
			s.logger.Error("mqtt subscribe failed", zap.Error(token.Error()))
		}
	}
	opts.OnConnectionLost = func(_ paho.Client, err error) {
		metrics.MQTTReconnectsTotal.Inc()
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

func (s *Service) StartCharging(ctx context.Context, stationID string) (string, db.StationCommand, error) {
	transactionID, err := newTransactionID()
	if err != nil {
		return "", db.StationCommand{}, err
	}
	command, err := s.store.CreateCommand(ctx, stationID, "start_charging", &transactionID)
	if err != nil {
		return "", db.StationCommand{}, err
	}
	msg := commandMessage{CommandID: command.ID, TransactionID: transactionID, Timestamp: time.Now().UTC()}
	if err := s.publishCommand(ctx, stationID, "start_charging", msg); err != nil {
		failed, markErr := s.store.MarkCommandFailed(ctx, command.ID, err)
		if markErr != nil {
			s.logger.Error("mark command failed failed", zap.Error(markErr))
		}
		return "", failed, err
	}
	sent, err := s.store.MarkCommandSent(ctx, command.ID)
	if err != nil {
		return "", command, err
	}
	s.hub.Broadcast("command_update", sent)
	return transactionID, sent, nil
}

func (s *Service) StopCharging(ctx context.Context, stationID string) (db.StationCommand, error) {
	command, err := s.store.CreateCommand(ctx, stationID, "stop_charging", nil)
	if err != nil {
		return db.StationCommand{}, err
	}
	msg := commandMessage{CommandID: command.ID, Timestamp: time.Now().UTC()}
	if err := s.publishCommand(ctx, stationID, "stop_charging", msg); err != nil {
		failed, markErr := s.store.MarkCommandFailed(ctx, command.ID, err)
		if markErr != nil {
			s.logger.Error("mark command failed failed", zap.Error(markErr))
		}
		return failed, err
	}
	sent, err := s.store.MarkCommandSent(ctx, command.ID)
	if err != nil {
		return command, err
	}
	s.hub.Broadcast("command_update", sent)
	return sent, nil
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
	if s.cfg.StationKey != "" && payload.StationKey != s.cfg.StationKey {
		s.logger.Warn("mqtt station key mismatch", zap.String("station_id", stationID), zap.String("topic", message.Topic()))
		return
	}
	if payload.StationID == "" {
		payload.StationID = stationID
	}
	if payload.Timestamp.IsZero() {
		payload.Timestamp = time.Now().UTC()
	}
	metrics.MQTTMessagesTotal.WithLabelValues(kind).Inc()

	switch kind {
	case "heartbeat":
		station, err := s.store.UpsertHeartbeat(ctx, stationID, payload.MaxPowerKW, defaultStatus(payload.Status), payload.MeterWh, payload.Timestamp)
		s.broadcastOrLog("heartbeat", station, err)
	case "status":
		s.handleStatus(ctx, stationID, payload)
	case "meter":
		s.handleMeter(ctx, stationID, payload)
	case "command_acks":
		s.handleCommandAck(ctx, stationID, message.Payload())
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
		quote := s.pricer.Quote(s.maxPowerKW(ctx, stationID, payload.MaxPowerKW), payload.Timestamp)
		if err := s.store.StopSession(ctx, stationID, txID, payload.MeterWh, payload.Timestamp, quote); err != nil {
			s.logger.Error("session stop failed", zap.String("station_id", stationID), zap.Error(err))
		}
	}

	station, err := s.store.UpsertStatus(ctx, stationID, payload.MaxPowerKW, defaultStatus(payload.Status), txID, payload.MeterWh, payload.Timestamp)
	s.broadcastOrLog("station_update", station, err)
}

func (s *Service) handleCommandAck(ctx context.Context, stationID string, body []byte) {
	var ack commandAck
	if err := json.Unmarshal(body, &ack); err != nil {
		s.logger.Warn("command ack payload invalid", zap.String("station_id", stationID), zap.Error(err))
		return
	}
	if ack.CommandID == "" {
		s.logger.Warn("command ack missing command id", zap.String("station_id", stationID))
		return
	}
	status := "acked"
	if ack.Status != "accepted" {
		status = "failed"
	}
	command, err := s.store.AckCommand(ctx, ack.CommandID, status, ack.Reason)
	if err != nil {
		s.logger.Error("command ack update failed", zap.String("station_id", stationID), zap.Error(err))
		return
	}
	s.hub.Broadcast("command_update", command)
}

func (s *Service) maxPowerKW(ctx context.Context, stationID string, fromPayload float64) float64 {
	if fromPayload > 0 {
		return fromPayload
	}
	station, err := s.store.GetStation(ctx, stationID)
	if err != nil {
		return 0
	}
	return station.MaxPowerKW
}

func (s *Service) RetryStaleCommands(ctx context.Context, threshold time.Duration, maxRetries int) error {
	if s.client == nil || !s.client.IsConnected() {
		return nil
	}
	commands, err := s.store.ListStaleSentCommands(ctx, threshold, maxRetries)
	if err != nil {
		return err
	}
	for _, cmd := range commands {
		msg := commandMessage{CommandID: cmd.ID, Timestamp: time.Now().UTC()}
		if cmd.TransactionID != nil {
			msg.TransactionID = *cmd.TransactionID
		}
		if err := s.publishCommand(ctx, cmd.StationID, cmd.Command, msg); err != nil {
			s.logger.Warn("command retry publish failed",
				zap.String("command_id", cmd.ID),
				zap.Int("retry", cmd.RetryCount+1),
				zap.Error(err))
			if cmd.RetryCount+1 >= maxRetries {
				failed, markErr := s.store.MarkCommandFailed(ctx, cmd.ID, err)
				if markErr != nil {
					s.logger.Error("mark retry-failed command failed", zap.Error(markErr))
				} else {
					s.hub.Broadcast("command_update", failed)
				}
			}
			continue
		}
		updated, err := s.store.BumpCommandRetry(ctx, cmd.ID)
		if err != nil {
			s.logger.Error("bump command retry failed", zap.String("command_id", cmd.ID), zap.Error(err))
			continue
		}
		s.hub.Broadcast("command_update", updated)
	}
	return nil
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
