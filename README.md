# MyBox CPO – Mini platforma pro správu flotily nabíjecích stanic

Jednoduchá CPO platforma pro monitoring 5 EV stanic v reálném čase. MQTT → Go backend → Postgres → React dashboard.

---

## Architektura

```
5× simulátor → MQTT (Mosquitto) → Go backend → REST/SSE → React frontend
                                          |
                                      Postgres
```

### Komponenty

- **Simulátory** – Generují heartbeat, status, meter values a zpracovávají MQTT commands
- **Backend** – Go + Gin, MQTT consumer, SSE stream, pricing, outbox pattern
- **Frontend** – React 19 + Vite, live dashboard s grafy
- **Database** – PostgreSQL 16

---

## Prerekvizity

- Docker Engine ≥ 24.0
- Docker Compose ≥ 2.20

## Spuštění

```bash
# První spuštění (vyžaduje build)
docker compose up --build -d

# Další spuštění
 docker compose up -d
```

### Služby

| Služba   | URL                                            |
| -------- | ---------------------------------------------- |
| Frontend | [http://localhost:5173](http://localhost:5173) |
| Backend  | [http://localhost:8080](http://localhost:8080) |
| MQTT     | localhost:1883                                 |

---

## Jak to vyzkoušet

1. Otevři dashboard na [http://localhost:5173](http://localhost:5173)
2. Přihlaš se pomocí `admin / admin`
3. Klikni na kartu stanice (např. station-1) → otevře se detail
4. V záložce **Přehled** klikni na **Zahájit nabíjení** → sleduj nárůst výkonu a energie v reálném čase
5. Po chvíli klikni na **Ukončit nabíjení** → cena se vypočítá automaticky podle nastaveného tarifu
6. Vrať se na dashboard a sleduj živý graf aktivity v sekci **Aktivita nabíjení**
7. **Station-5** běží automaticky v chaos mode (automaticky startuje, zastavuje a simuluje chyby)

---

## Testy

```bash
# Backend
go test ./...

# Frontend
npm test
```

---

## Kvalita kódu (Desloppify score)

| Komponenta | Skóre |
|-----------|-------|
| Backend   | 99.1 / 100 |
| Frontend  | 92.0 / 100 |

### Slabiny frontendu — opraveno
- ✅ **Frontend testy** — přidáno 12 testů (`api.test.ts`, `login-form.test.tsx`, `use-stations.test.tsx`)
- ✅ **Security drobnosti** — JWT_SECRET vyžadován (panic pokud chybí), globální 401/403 handling s auto-logoutem, CORS konfigurovatelné přes env
- ✅ **Menší duplicity v kódu** — extrahován `useChartTheme()` hook, sloučen `useIsDark` s `useTheme`, odstraněny zbytečné ternární operátory
- ✅ **OpenAPI spec** — přidán `openapi.yaml` s popisy všech endpointů
- ✅ **Lepší identity stanic** — `STATION_KEY` pro validaci MQTT zpráv ze stanic
- ✅ **Timestamp trust** — server-side timestamp override s drift tolerance 30s
- ✅ **Real-time pricing** — průběžný výpočet ceny během session v `handleMeter`
- ✅ **JWT refresh token** — access (1h) + refresh (7d) v httpOnly cookie, `/api/refresh` endpoint

---

## Tech Stack

| Vrstva   | Technologie                     |
| -------- | ------------------------------- |
| Backend  | Go, Gin, MQTT, Zap              |
| Frontend | React 19, Vite, Recharts         |
| Database | PostgreSQL                      |
| Broker   | Mosquitto                       |

---

## Environment Variables

| Proměnná           | Popis                          |
| ------------------ | ------------------------------ |
| DATABASE_URL       | Připojovací řetězec k Postgres |
| MQTT_BROKER        | Adresa MQTT brokeru            |
| JWT_SECRET         | Tajný klíč pro JWT tokeny      |
| CORS_ALLOWED_ORIGINS | CORS origins (default: *)    |
| STATION_KEY        | API key pro validaci stanic    |
| PRICE_PER_KWH      | Cena za kWh                    |
| AUTO_CYCLE         | Automatický cyklus simulátoru  |

---

## Vývojový přístup

1. AI agenti generují základní kód
2. Definuji architekturu a směr
3. Iterakce + debugging
4. Ruční UX kontrola
5. Finální cleanup (desloppify)

**Výsledek:** Rychlý vývoj s kontrolovanou architekturou

---

## Další dokumentace

- [Design Document](./DESIGN.md) – Detailní design dokumentace