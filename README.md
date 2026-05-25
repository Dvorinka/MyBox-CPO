# MyBox CPO Test - Mini CPO Platform

Backend and simulator implementation for a local EV charging fleet demo. The stack runs Mosquitto, Postgres, a Go backend, five Go station simulators, and a placeholder frontend service that can be replaced by the dashboard.

## Run

```bash
docker compose up --build
```

Services:

- Backend REST/SSE API: http://localhost:8080
- Placeholder frontend port: http://localhost:5173
- MQTT broker: localhost:1883
- Postgres: localhost:5432

## Test API Flow

Wait until the five simulators publish initial status messages, then:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/stations
curl http://localhost:8080/api/stations/station-1
curl -X POST http://localhost:8080/api/stations/station-1/start
curl http://localhost:8080/api/stations/station-1/meter-values?minutes=10
curl -X POST http://localhost:8080/api/stations/station-1/stop
curl http://localhost:8080/api/stations/station-1/sessions
```

Live updates are available through Server-Sent Events:

```bash
curl -N http://localhost:8080/api/events
```

## MQTT Contract

Station telemetry topics:

- `cpo/v1/stations/{stationId}/heartbeat` with QoS 1
- `cpo/v1/stations/{stationId}/status` with QoS 1 and retained status
- `cpo/v1/stations/{stationId}/meter` with QoS 0

Command topics:

- `cpo/v1/stations/{stationId}/commands/start_charging`
- `cpo/v1/stations/{stationId}/commands/stop_charging`

Payloads are JSON. The REST API contract is documented in [openapi.yaml](openapi.yaml).

## Backend

The backend uses Go, Gin, Paho MQTT, pgx, zap, and Postgres. On startup it runs SQL migrations from `backend/migrations`, subscribes to station topics, persists station/session/meter state, and marks stations `Offline` after 90 seconds without heartbeat.

Session lifecycle:

- `Preparing` or `Charging` status with `transaction_id` creates the session.
- `meter` messages append time-series power and cumulative Wh points.
- `Available` or `Faulted` status closes the latest active session and computes `total_kwh` and `total_cost`.

## Frontend Wiring

Kimi can bind directly to:

- `GET /api/stations`
- `GET /api/stations/:id`
- `GET /api/stations/:id/sessions`
- `GET /api/stations/:id/meter-values?minutes=30`
- `POST /api/stations/:id/start`
- `POST /api/stations/:id/stop`
- `GET /api/events` for live updates

The current `frontend` compose service is an nginx placeholder so `docker compose up` has a complete service graph before the dashboard lands.

## Local Backend Checks

```bash
cd backend
go test ./...
go vet ./...

cd ../simulator
go test ./...
go vet ./...
```
