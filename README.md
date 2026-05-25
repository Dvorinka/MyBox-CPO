# MyBox CPO — Mini platforma pro správu flotily nabíjecích stanic

> Jednoduchá CPO (Charge Point Operator) platforma pro monitoring 5 EV nabíjecích stanic v reálném čase. Komunikace probíhá přes MQTT, data se persistují do PostgreSQL a frontend zobrazuje live dashboard s analytikou.

---

## Architektura

```
+-------------+     MQTT      +-----------+   REST/SSE   +-----------+
| 5× simulátor| ------------> |  Backend  | ----------> |  Frontend |
|   stanice   |  heartbeat    |  (Go+Gin) |              |  (React)  |
|  (Go+MQTT)  |  status       |           |              |           |
|             |  meter values |  Postgres |              |           |
+-------------+               +-----------+              +-----------+
       ^                            |
       |                            |
       +---------- commands <-------+
```

- **Simulátor** — 5 Docker služeb (Go), každá simuluje jednu stanici. Publikuje heartbeat (30 s), status změny, meter values (5 s). Subscribuje start/stop příkazy.
- **MQTT Broker** — Mosquitto (lightweight, zero-config).
- **Backend** — Go + Gin. Subscribuje MQTT, persistuje do Postgres, exponuje REST API + SSE pro live updates. Obsahuje command outbox, offline detekci a pricing engine.
- **Frontend** — React 19 + Vite + shadcn/ui. Kartová mřížka stanic, detail stanice s grafem, historie sessions, analytický dashboard s heatmapou.
- **DB** — PostgreSQL 16 (migrace při startu).

---

## Spuštění

### Požadavky

- Docker + Docker Compose
- (Volitelně) Go 1.25+ a Node.js 20+ pro lokální vývoj

### Jedním příkazem

```bash
docker compose up --build
```

Po prvním startu (cca 20–30 s na inicializaci DB a migrace) je aplikace dostupná na:

| Služba | URL |
|--------|-----|
| Frontend dashboard | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Prometheus metrics | http://localhost:8080/metrics |
| MQTT broker | localhost:1883 |

---

## Jak to vyzkoušet

1. Otevři http://localhost:5173 a přihlas se (**admin / admin**).
2. V dashboardu uvidíš 5 stanic v reálném čase (SSE updates bez F5).
3. Klikni na **Zahájit nabíjení** u libovolné stanice — backend pošle MQTT command, simulátor přejde do stavu `Charging` a začne posílat meter values.
4. Po chvíli klikni na **Ukončit nabíjení** — session se uzavře, vypočítá se spotřeba a cena.
5. Otevři detail stanice pro graf výkonu a historii sessions.

### Speciální stanice-5 (chaos mód)

`station-5` běží v režimu `AUTO_CYCLE=true`. Autonomně startuje a ukončuje nabíjení, náhodně generuje chyby (`Faulted`) a po 15–35 s se sama zotaví zpět do `Available`. Ideální pro demonstraci fault recovery a real-time UI updates bez manuálního klikání.

---

## Testy

### Backend

```bash
cd backend

# Unit testy (cenotvorba)
go test ./internal/pricing/...

# Integrační testy (vyžadují Docker — testcontainers)
go test -tags=integration ./internal/db/...
go test -tags=integration ./internal/httpapi/...
```

### Frontend

```bash
cd frontend
npm test
```

### Prometheus / liveness

```bash
# Healthcheck
curl http://localhost:8080/health

# Prometheus metrics
curl http://localhost:8080/metrics
```

---

## Code Health Score (desloppify)

| Projekt | Overall | Strict | Hlavní slabiny |
|---------|---------|--------|----------------|
| **Backend** | **99.1/100** | **99.1/100** | Security 88.9 % (1 finding) |
| **Frontend** | **84.5/100** | **84.5/100** | Test health 12.4 %, 3 single-use findings |

### Backend scorecard

```
File health        ███████████████ 100.0%
AI Generated Debt  ███████████████ 100.0%
Abstraction Fit    ███████████████ 100.0%
Code quality       ███████████████ 100.0%
Contracts          ███████████████ 100.0%
Duplication        ███████████████  98.6%
Error Consistency  ███████████████ 100.0%
Logic Clarity      ███████████████ 100.0%
Naming Quality     ███████████████ 100.0%
Security           █████████████░░  88.9%
Test health        ███████████████  97.4%
Type Safety        ███████████████ 100.0%
```

### Frontend scorecard

```
File health        ███████████████  97.0%
AI Generated Debt  ███████████████ 100.0%
Abstraction Fit    ███████████████ 100.0%
Code quality       ██████████████░  96.2%
Duplication        ██████████████░  94.3%
Elegance           ███████████████ 100.0%
Error Consistency  ███████████████ 100.0%
Logic Clarity      ███████████████ 100.0%
Naming Quality     ███████████████ 100.0%
Security           ██████████████░  94.7%
Test health        ██░░░░░░░░░░░░░  12.4%
Type Safety        ███████████████ 100.0%
```

---

## Environment variables

| Proměnná | Výchozí | Popis |
|----------|---------|-------|
| `HTTP_ADDR` | `:8080` | Adresa backend serveru |
| `DATABASE_URL` | — | Postgres connection string |
| `MQTT_BROKER` | `tcp://localhost:1883` | MQTT broker URL |
| `PRICE_PER_KWH` | `8.50` | Základní cena za kWh |
| `PEAK_PRICE_PER_KWH` | `8.50` | Cena v peak hodinách |
| `OFFPEAK_PRICE_PER_KWH` | `7.20` | Cena mimo peak |
| `PEAK_START_HOUR` | `7` | Začátek peak okna |
| `PEAK_END_HOUR` | `21` | Konec peak okna |
| `DC_PRICE_MULTIPLIER` | `1.15` | Příplatek pro DC stanice |
| `DC_POWER_THRESHOLD_KW` | `50` | Hranice AC vs DC (kW) |
| `JWT_SECRET` | `change-me` | Secret pro JWT podepisování |
| `OFFLINE_AFTER_SECONDS` | `90` | Timeout pro offline detekci |
| `FAULT_PROBABILITY` | `0.01` | Pravděpodobnost chyby stanice |
| `AUTO_CYCLE` | `false` | Autonomní cycling (chaos mód) |

---

## Tech stack

| Vrstva | Technologie |
|--------|-------------|
| Backend | Go 1.25, Gin, pgx, Paho MQTT, Zap, Prometheus |
| Frontend | React 19, Vite, TanStack Query, Recharts, shadcn/ui |
| DB | PostgreSQL 16 |
| Message broker | Eclipse Mosquitto 2.0.20 |
| Infra | Docker Compose, healthchecks |
