# MyBox CPO — Repository Analysis

Audit of this monorepo against [TASK.md](TASK.md) (Mini CPO Platform).  
Generated for submission readiness and interview prep.

---

## Executive summary

| Area | vs hard requirements | Maturity |
|------|----------------------|----------|
| **Simulator** | Largely complete | ~90% |
| **Mosquitto** | Complete (minimal, intentional) | ~95% |
| **Backend** | Largely complete + extras | ~85% |
| **Frontend** | UI built, live updates broken | ~70% |
| **Docker / docs** | Blockers for reviewers | ~60% |

**Not submission-ready until P0 items are fixed** (Docker build, SSE live updates, README accuracy).

---

## Critical blockers (P0)

### 1. `docker compose up --build` fails

- `backend/go.mod` requires **Go 1.25.0**
- `backend/Dockerfile` and `simulator/Dockerfile` use **`golang:1.23-alpine`**
- Build error: `go.mod requires go >= 1.25.0 (running go 1.23.12)`

**Fix:** Use `golang:1.25-alpine` in Dockerfiles, or lower `go` version in `go.mod` to match the image.

### 2. Frontend real-time updates do not work

TASK requires a live dashboard **without F5**. SSE is wired incorrectly.

| Layer | Actual behavior |
|-------|-----------------|
| Backend SSE | Sends `event: station_update` with raw station JSON in `data:` |
| Frontend `api.ts` | Listens for `station_updated` (wrong name) |
| Frontend `use-stations.tsx` | Handles `type === "station_updated"` only |
| `onmessage` handler | Expects `{ type, data }` wrapper — server does not send that |

**Effect:** Dashboard updates only on initial load and manual **Refresh**.

**Fix:**

- Listen for `station_update` (match backend `hub.Broadcast` / `httpapi` event type)
- Parse `(e as MessageEvent).data` directly as `Station`
- Optionally handle `meter_value` and `command_update` for charts and command feedback

### 3. README is outdated

- Still describes frontend as an **nginx placeholder**
- Frontend is a built React app served by nginx
- Missing a dedicated **Architecture** section (TASK asks Setup / Run / Test / Architecture)

**Fix:** Rewrite frontend section, add architecture diagram or short stack overview, align curl/SSE examples with working event names.

---

## By component

### Simulator (`simulator/`)

#### Done (matches TASK)

| Requirement | Status |
|-------------|--------|
| Connect to MQTT on start with `STATION_ID` | Yes |
| Heartbeat every 30 s | Yes |
| Status on state transitions | Yes (`Available` → `Preparing` → `Charging` → `Finishing` → `Available`, `Faulted`) |
| Meter every 5 s while charging (kW + cumulative Wh) | Yes |
| Subscribe `start_charging` / `stop_charging` with `transaction_id` | Yes |
| ENV: `STATION_ID`, `MAX_POWER_KW`, `FAULT_PROBABILITY` | Yes |
| 5 compose instances with different params | Yes |

**Extras:** command acks on `command_acks`, QoS/retained aligned with backend, random fault during charging.

#### Gaps / improvements

- No unit or integration tests
- No spontaneous demo sessions (command-only charging — acceptable for spec)
- `Finishing` state is short (~2 s) — easy to miss in UI even after SSE fix
- Fault path clears `transaction_id` immediately — session close timing depends on `Faulted` status delivery

---

### Mosquitto (`mosquitto/`)

#### Done

- Eclipse Mosquitto 2.0.20 in compose, port 1883, persistence volume
- Config: anonymous listener, persistence, stdout logging — fine for local demo

#### Gaps (acceptable for TASK; note for interview)

- No TLS, authentication, or ACL
- Not documented as its own README section (only under MQTT contract)

**Verdict:** Hard requirements satisfied.

---

### Backend (`backend/`)

#### Done (matches TASK)

| Requirement | Status |
|-------------|--------|
| MQTT subscribe + persist | Yes |
| Session lifecycle (start / meter time-series / stop + `total_kwh`, `total_cost`) | Yes |
| Offline if no heartbeat > 90 s | Yes |
| `GET /api/stations` | Yes |
| `GET /api/stations/:id` | Yes |
| `GET /api/stations/:id/sessions` | Yes |
| `POST /api/stations/:id/start` | Yes |
| `POST /api/stations/:id/stop` | Yes |
| Postgres + migrations | Yes |

#### Beyond TASK (already implemented)

- Peak/off-peak + DC pricing (`internal/pricing`)
- Command outbox (`station_commands`, MQTT acks)
- `GET /api/stations/:id/meter-values`
- `GET /api/events` (SSE)
- Prometheus `/metrics`
- DB integration test (`-tags=integration`)
- Pricing unit tests

#### Gaps / improvements

| Issue | Severity |
|-------|----------|
| Docker Go version mismatch | **P0** |
| Offline does not close open charging sessions — `MarkOffline` clears `active_transaction_id` but does not end session rows | Medium |
| No end-to-end MQTT/HTTP integration tests | Low (bonus) |
| No command retry worker for stuck `queued`/`sent` commands | Low (noted in DESIGN.md) |
| REST start returns 404 until station exists in DB (first telemetry) | Low — document in README |
| `InsertMeterValue` forces status `Charging` on any meter message | Low edge case |

**MQTT craftsmanship:** QoS and retained-message choices are implemented and documented in DESIGN.md — strong for evaluation.

---

### Frontend (`frontend/`)

#### Done

- Fleet overview for 5 stations (cards, color-coded status)
- Station detail: status, power chart (30 min), Start/Stop
- Sessions history: start/end, energy, duration, cost
- Nginx proxies `/api/` with SSE-friendly settings
- Production build in Docker (not a placeholder)

#### Gaps vs TASK

| TASK requirement | Actual state |
|------------------|--------------|
| Live view without F5 | **Broken** (SSE bug — see P0) |
| Table of 5 stations | Card grid (acceptable per “usable UI”) |
| Chart of power **and** energy | Power only; energy not plotted |

#### Other frontend improvements (P1+)

- Detail dialog keeps snapshot of `station` — does not update from SSE while open
- Chart and sessions reload only when dialog opens, not after Start/Stop
- `meter_value` SSE events ignored — no live chart during charging
- `command_update` SSE ignored — no toast/feedback on command ack/fail
- `error` from `useStations` never shown in UI
- Session types omit `price_per_kwh`, `pricing_tariff` from API
- No dedicated route per station (modal only — OK for demo)

---

### Docker Compose + documentation

#### Done

- Single compose: mosquitto, db, backend, frontend, `station-1` … `station-5`
- DB healthcheck; backend depends on db + mosquitto
- `.env.example` present
- `DESIGN.md` with tradeoffs, weaknesses, AI usage

#### Gaps

| Item | Status |
|------|--------|
| `docker compose up --build` OOTB | **Fails** (Go version) |
| README accuracy | **Stale** (placeholder frontend) |
| README Architecture section | Missing |
| Full compose smoke test documented | Not verified (DESIGN.md notes local Docker issues) |
| Backend HEALTHCHECK in Dockerfile | Present but not used in compose `depends_on` for frontend |

---

## Bonus features (TASK.md § Bonus)

| Bonus | Present? |
|-------|----------|
| OCPP 1.6 JSON | No |
| Advanced analytics dashboard | No (basic fleet stats only) |
| Unit / integration tests | Partial (pricing + optional DB integration) |
| JWT authentication | No |
| Command queue / rate limiting | Outbox yes; retry worker no |
| Peak/off-peak pricing | **Yes** |
| Grafana / Prometheus | Prometheus `/metrics` only |
| Compose healthchecks | DB yes; backend image HEALTHCHECK not wired in compose |

---

## Priority fix list

### P0 — must fix before submission

1. **Align Go versions** — `golang:1.25-alpine` in `backend/Dockerfile` or lower `go` in `go.mod` to match image.
2. **Fix SSE** — `station_update` event name; parse `data` as `Station`; wire `use-stations` and optional detail refresh.
3. **Update README** — real frontend, architecture, remove placeholder wording; document wait-for-simulators before API start.

### P1 — strong polish

4. Refresh station detail + chart/sessions after SSE or after Start/Stop.
5. Add energy series to chart (TASK mentions power and energy).
6. On offline: close or finalize active charging session in DB.
7. Run full `docker compose up` smoke test; record result in DESIGN.md.

### P2 — nice to have

8. Optional table view on dashboard (closer to spec wording).
9. Simulator tests; compose-level smoke test.
10. Surface API/SSE errors in UI.
11. Handle `command_update` for user feedback.

---

## Evaluation checklist (TASK scoring)

| Dimension | Notes |
|-----------|--------|
| **End-to-end functionality (25%)** | Blocked by Docker build + broken FE live updates |
| **Architecture & decisions (25%)** | Strong DESIGN.md; backend/simulator coherent |
| **MQTT/IoT craft (20%)** | Good topic layout, QoS, retained, offline |
| **Code quality (15%)** | Go structure clean; FE SSE bug; few tests |
| **Communication (15%)** | README/DESIGN need sync with actual state |

---

## Bottom line

**Backend + simulator + Mosquitto** are close to complete for hard requirements, with thoughtful extras (pricing, metrics, command outbox).

**Frontend and ops** need P0 fixes so reviewers can run `docker compose up` and see a **live** dashboard without manual refresh.

After P0, address P1 for a solid demo in the 1h interview (start/stop flow, graphs updating, sessions closing correctly on offline).
