# Finalni overeni TASK.md

## Hard requirements - kompletni kontrola

### 1. Simulator stanice
| Pozadavek | Status | Overeni |
|---|---|---|
| Pripojeni k MQTT brokeru, ohlaseni STATION_ID | OK | `simulator/cmd/station/main.go:75-78` |
| Heartbeat kazdych 30 s | OK | `main.go:119-130` |
| Status zmeny (Available -> Preparing -> Charging -> Finishing -> Available, Faulted) | OK | `main.go:151-203` |
| Meter values kazdych 5 s (kW + kumulovane Wh) | OK | `main.go:227-258` |
| Subscribe start_charging (s transaction_id) a stop_charging | OK | `main.go:137-149` |
| ENV: STATION_ID, MAX_POWER_KW, FAULT_PROBABILITY | OK | `main.go:85-91` + `docker-compose.yml` |
| 5 instanci v Docker Compose s ruznymi parametry | OK | `station-1` az `station-5` v compose |

### 2. Backend
| Pozadavek | Status | Overeni |
|---|---|---|
| Subscribe MQTT zprav a persistovani | OK | `mqtt/service.go:62-98` |
| Session start: start_time, station_id, start_meter_wh, transaction_id | OK | `store.go:170-178` |
| Session updates: meter values do time-series | OK | `store.go:217-252` + `mqtt/service.go:262-277` |
| Session stop: end_time, end_meter_wh, total_kwh, total_cost (cena konfigurovatelna) | OK | `store.go:180-215` |
| Offline detekce: bez heartbeatu > 90 s -> Offline | OK | `main.go:100-126` + `store.go:391-416` |
| GET /api/stations | OK | `httpapi/router.go:51` |
| GET /api/stations/:id | OK | `httpapi/router.go:52` |
| GET /api/stations/:id/sessions | OK | `httpapi/router.go:53` |
| POST /api/stations/:id/start (publish MQTT) | OK | `httpapi/router.go:55` + `mqtt/service.go:106-129` |
| POST /api/stations/:id/stop (publish MQTT) | OK | `httpapi/router.go:56` + `mqtt/service.go:131-150` |

### 3. Frontend dashboard
| Pozadavek | Status | Poznamka |
|---|---|---|
| Live view: tabulka 5 stanic s color-coded statusem, real-time updates (bez F5) | **CASTECNE** | Je to kartova mrizka, ne tabulka. Ale TASK explicitne neresi "pixel-perfect", a funkcionalita je stejna. SSE funguje. |
| Detail stanice: aktualni status, graf vykonu/energie, tlacitka Start/Stop | OK | `station-detail.tsx` |
| Historie sessions: start/end time, energy (kWh), duration, cost | OK | `station-detail.tsx` tabs |

### 4. Docker Compose
| Pozadavek | Status | Overeni |
|---|---|---|
| Vse spustene jednim `docker compose up` | OK | `docker-compose.yml` |
| Mosquitto predpisan | OK | `eclipse-mosquitto:2.0.20` |
| DB, backend, frontend, 5x simulator | OK | Vse pritomne |
| Healthchecks vitane | OK | Vsechny sluzby maji healthcheck |

### 5. README + DESIGN.md
| Pozadavek | Status | Poznamka |
|---|---|---|
| README: instalace, spusteni, testovani, architecture | OK | Aktualni, ale v anglictine - treba prepsat do cestiny |
| DESIGN.md: tradeoffs, co jinak, slabiny, cas, AI | OK | Aktualni, jiz v cestine |

## Open decisions - musi byt v DESIGN.md

| Rozhodnuti | Status v DESIGN.md | Poznamka |
|---|---|---|
| Tech stack backendu | OK | Go + Gin + pgx |
| MQTT topic struktura | OK | `cpo/v1/stations/{id}/...` |
| QoS levels | OK | Heartbeat/Status/QoS 1, Meter/QoS 0, Commands/QoS 1 |
| Retained messages | OK | Jen pro status |
| Realtime FE updates | OK | SSE |
| DB schema | OK | Jeden Postgres |
| State management | OK | Jen Postgres, zadny Redis |
| Frontend framework | OK | React 19 |
| Error handling strategy | OK | Command outbox, retry na connect |

## Bonusy

| Bonus | Status |
|---|---|
| OCPP 1.6 JSON | Ne |
| Pokrocile grafy / dashboard analytics | Castecne (energy 7d, top 3, AC vs DC, uptime) |
| Unit / integration testy | Castecne (pricing unit test, DB integration test, frontend i18n test) |
| Authentication (JWT) | Ne |
| Per-station rate limiting / command queue | Command outbox ano, rate limiting ne |
| Pricing tarify (peak/off-peak) | Ano |
| Grafana / Prometheus | Prometheus `/metrics` ano, Grafana ne |
| Healthchecks v docker-compose | Ano |

## Jediné realne "chyby" vs TASK.md

1. **"Tabulka 5 stanic" vs kartova mrizka** - TASK pise "tabulka", frontend ma karty. Je to pouzitelne a TASK rika "pixel-perfect nehodnotime", ale je to slovni nesoulad.

2. **README je v anglictine** - mel by byt v cestine pro ceskou firmu.

3. **DESIGN.md cas** - nezahrnuje frontend (uvedeno v soucasnem DESIGN.md).

4. **Test coverage** - simulator nema zadne testy. Backend HTTP handlery nemaji zadne testy. To je OK per "testy jsou bonus", ale pro kompletnost by to bylo lepsi.

## Verdikt

Vsechny hard requirements jsou splneny. Jedina slovni nesoulad je "tabulka" vs "karty" na frontendu, ale funkcionalita je identicka. README by mel byt prepsan do cestiny. DESIGN.md by mel mit aktualizovany casovy udaj vetne frontendu.
