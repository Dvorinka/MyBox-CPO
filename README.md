# MyBox CPO - Mini CPO Platform

A full-stack EV charging fleet management demo. The stack runs Mosquitto MQTT broker, Postgres, a Go backend, five Go station simulators, and a React + Vite + shadcn/ui frontend dashboard.

## Setup

Requirements:

- Docker with Compose v2
- Free local ports: `5173`, `8080`, `1883`, `5432`

No local Go, Node, or Postgres install is required for the main demo. Docker builds backend, frontend, and simulator images.

## Run

```bash
docker compose up --build
```

Services:

- Frontend Dashboard: http://localhost:5173
- Backend REST/SSE API: http://localhost:8080
- Prometheus metrics: http://localhost:8080/metrics
- MQTT broker: localhost:1883
- Postgres: localhost:5432

## Dashboard

The frontend is a React 19 SPA built with Vite, Tailwind CSS v4, and shadcn/ui components. It features:

- **Live fleet overview** with color-coded station status cards and real-time SSE updates
- **Station detail dialog** with power/energy metrics, interactive area chart (Recharts), and Start/Stop controls
- **Charging session history** with duration, energy, and cost breakdown
- **Charging activity heatmap** based on session energy by weekday and hour bucket
- **Tesla-inspired minimal design** using the custom palette `#102472`, `#2596be`, `#ffffff`

The dashboard auto-refreshes via Server-Sent Events (`/api/events`) so station states update without page reloads.

### Local Frontend Development

```bash
cd frontend
npm install
npm run dev      # local dev server
npm run build    # production build
npm run lint     # ESLint check
```

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
curl http://localhost:8080/metrics
```

Live updates are available through Server-Sent Events:

```bash
curl -N http://localhost:8080/api/events
```

Expected SSE event names:

- `station_update` - full station snapshot after status/meter/offline changes
- `meter_value` - latest meter sample for live charts
- `command_update` - command state after publish or simulator acknowledgement

## MQTT Contract

Station telemetry topics:

- `cpo/v1/stations/{stationId}/heartbeat` with QoS 1
- `cpo/v1/stations/{stationId}/status` with QoS 1 and retained status
- `cpo/v1/stations/{stationId}/meter` with QoS 0
- `cpo/v1/stations/{stationId}/command_acks` with QoS 1

Command topics:

- `cpo/v1/stations/{stationId}/commands/start_charging`
- `cpo/v1/stations/{stationId}/commands/stop_charging`

Payloads are JSON. The REST API contract is documented in [openapi.yaml](openapi.yaml).

## Backend

The backend uses Go, Gin, Paho MQTT, pgx, zap, and Postgres. On startup it runs SQL migrations from `backend/migrations`, subscribes to station topics, persists station/session/meter state, and marks stations `Offline` after 90 seconds without heartbeat.

Session lifecycle:

- `Preparing` or `Charging` status with `transaction_id` creates the session.
- `meter` messages append time-series power and cumulative Wh points.
- `Available`, `Faulted`, or offline timeout closes the latest active session and computes `total_kwh`, `total_cost`, `price_per_kwh`, `pricing_tariff`, and station power class.

Command handling:

- REST start/stop creates a durable command row with `queued` status.
- Successful MQTT publish moves it to `sent`.
- Simulator command acknowledgement moves it to `acked` or `failed`.
- SSE emits `command_update` events for frontend toasts/status.

Pricing:

- Peak/off-peak prices are controlled by `PEAK_PRICE_PER_KWH`, `OFFPEAK_PRICE_PER_KWH`, `PEAK_START_HOUR`, and `PEAK_END_HOUR`.
- DC multiplier is controlled by `DC_POWER_THRESHOLD_KW` and `DC_PRICE_MULTIPLIER`.
- Defaults keep `PRICE_PER_KWH` compatibility while showing tariff metadata in session history.

Observability:

- `/metrics` exposes Prometheus counters/histograms for HTTP requests, MQTT messages/reconnects, dropped SSE events, and DB write latency.

## Architecture

```text
5x station simulator -> Mosquitto MQTT -> Go backend -> REST/SSE API -> React dashboard
                                           |
                                       Postgres
```

Postgres is the source of truth for stations, sessions, meter values, and command state. Backend process owns MQTT ingestion, REST commands, SSE fan-out, migrations, pricing, and offline detection. Frontend talks only to backend through the Nginx proxy in the frontend container.

## Frontend API Integration

The dashboard consumes the backend API via an Nginx reverse proxy (configured in `frontend/nginx.conf`):

- `GET /api/stations` - fleet overview cards
- `GET /api/stations/:id` - station detail header
- `GET /api/stations/:id/sessions` - session history table
- `GET /api/stations/:id/meter-values?minutes=30` - power chart data
- `POST /api/stations/:id/start` - start charging command
- `POST /api/stations/:id/stop` - stop charging command
- `GET /api/events` - Server-Sent Events for live station updates

## Local Backend Checks

```bash
cd backend
go test ./...
go vet ./...

cd ../simulator
go test ./...
go vet ./...
```

Compile integration tests without running containers:

```bash
cd backend
go test -run '^$' -tags=integration ./internal/db
```

Run Postgres-backed integration test when Docker is healthy:

```bash
cd backend
go test -tags=integration ./internal/db
```
