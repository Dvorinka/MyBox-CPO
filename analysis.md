# MyBox CPO — Repository Analysis

Audit of this monorepo against [TASK.md](TASK.md) (Mini CPO Platform).  
Generated for submission readiness and interview prep.

---

## Executive summary

| Area | vs hard requirements | Maturity |
|------|----------------------|----------|
| **Simulator** | Complete | ~92% |
| **Mosquitto** | Complete (minimal, intentional) | ~95% |
| **Backend** | Complete + extras | ~90% |
| **Frontend** | UI built, live updates wired | ~85% |
| **Docker / docs** | Submission-ready baseline | ~85% |

P0 blockers identified below have been remediated in the current codebase. Remaining work is polish and optional hardening.

---

## Critical blockers (P0)

### 1. `docker compose up --build` fails — fixed

- `backend/go.mod` requires **Go 1.25.0**
- `backend/Dockerfile` and `simulator/Dockerfile` now use **`golang:1.25-alpine`**
- Build error: `go.mod requires go >= 1.25.0 (running go 1.23.12)`

**Fix applied:** Use `golang:1.25-alpine` in Dockerfiles.

### 2. Frontend real-time updates do not work — fixed

TASK requires a live dashboard **without F5**. SSE is wired incorrectly.

| Layer | Actual behavior |
|-------|-----------------|
| Backend SSE | Sends `event: station_update` with raw station JSON in `data:` |
| Frontend `api.ts` | Listens for `station_update`, `meter_value`, `command_update`, `heartbeat` |
| Frontend `use-stations.tsx` | Updates station cache and live meter cache from SSE |
| Detail dialog | Uses live station cache instead of stale open-time snapshot |

**Fix applied:**

- Listen for `station_update` (match backend `hub.Broadcast` / `httpapi` event type)
- Parse `(e as MessageEvent).data` directly as `Station`
- Handle `meter_value` and `command_update` for charts and session refresh

### 3. README is outdated — fixed

- Frontend documented as built React app served by nginx
- Dedicated **Setup**, **Run**, **Test API Flow**, and **Architecture** sections present
- SSE examples align with working event names

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
| Docker Go version mismatch | Fixed |
| Offline does not close open charging sessions — `MarkOffline` clears `active_transaction_id` but does not end session rows | Fixed |
| Available/Finishing/Faulted status could leave stale `current_power_kw` after stop | Fixed |
| No end-to-end MQTT/HTTP integration tests | Low (bonus) |
| Command retry worker for stuck `sent` commands | **Fixed** — 20 s ticker, 15 s threshold, max 3 retries |
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
| Live view without F5 | Fixed with SSE cache updates |
| Table of 5 stations | Card grid (acceptable per “usable UI”) |
| Chart of power **and** energy | Fixed: dual-axis power + cumulative energy |

#### Other frontend improvements (P1+)

- No toast/feedback on command ack/fail yet; command events refresh session data only
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
| `docker compose up --build` OOTB | Fixed at Dockerfile level; smoke test still recommended |
| README accuracy | Fixed |
| README Architecture section | Present |
| Full compose smoke test documented | Verified and recorded in DESIGN.md |
| Backend HEALTHCHECK in Dockerfile | Present but not used in compose `depends_on` for frontend |

---

## Bonus features (TASK.md § Bonus)

| Bonus | Present? |
|-------|----------|
| OCPP 1.6 JSON | No |
| Advanced analytics dashboard | No (basic fleet stats only) |
| Unit / integration tests | Partial (pricing + optional DB integration) |
| JWT authentication | No |
| Command queue / rate limiting | Outbox yes; retry worker **yes** (20 s / 15 s / 3 retries) |
| Peak/off-peak pricing | **Yes** |
| Grafana / Prometheus | Prometheus `/metrics` only |
| Compose healthchecks | DB yes; backend image HEALTHCHECK not wired in compose |

---

## Priority fix list

### P0 — must fix before submission

1. **Align Go versions** — fixed with `golang:1.25-alpine`.
2. **Fix SSE** — fixed with `station_update`, `meter_value`, and `command_update` handlers.
3. **Update README** — fixed with setup, run, test, and architecture sections.

### P1 — strong polish

4. Add command ack toast/status feedback.
5. Add compose-level smoke test script.

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
