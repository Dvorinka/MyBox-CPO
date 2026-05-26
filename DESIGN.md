# Design Document

## Přístup k vývoji

Začínám vždy od nuly a technologie volím až podle zadání. V tomto projektu jsem šel po rychlém a čistém UI, takže **Kimi K2.6** na frontend. Backend jsem nechal na **GPT 5.5 High**, protože řeší logiku a integrace, kde frontend modely nestačí.

---

## Architektura

```
5× simulátor → Mosquitto MQTT → Go backend → REST/SSE API → React dashboard
                                      │
                                  PostgreSQL
```

### Komponenty

- **5× simulátor** – Generuje heartbeat, status, meter values a zpracovává MQTT commands
- **Mosquitto MQTT** – Lehký broker pro IoT simulaci
- **Go backend** – MQTT consumer, SSE stream, pricing, outbox pattern
- **React dashboard** – Live dashboard s grafy v reálném čase
- **PostgreSQL** – Trvalé uložení dat

---

## Tech Stack

### Backend
- **Go + Gin** – Jednoduchý backend, dobře čitelný, snadno kontejnerizovatelný
- **JWT** – Rychlé auth řešení, pro demo dostačující
- **Mosquitto MQTT** – Lehký broker pro IoT simulaci

### Frontend
- **React 19 + Vite** – Nejlepší volba pro AI generované UI a rychlý vývoj
- **Recharts** – Vizualizace dat

### Database
- **PostgreSQL** – Stačí pro tento rozsah, žádný overengineering

---

## Práce s AI agenty

Mám vlastní SKILL.MD (tdvorak-fullstack) s pravidly a architekturou. Agent není architekt, ale vykonavatel. Když nemá jasné mantinely, generuje průměrný kód.

### Co agent nezvládá
Neumí reálné UX testování. Proto aplikaci vždy projdu ručně, klikám, testuju flow a vracím chyby zpět.

---

## Klíčová rozhodnutí

| Rozhodnutí | Důvod |
|-----------|-------|
| **MQTT topics verzované** | Když změníme strukturu zpráv, staré simulátory stále fungují |
| **QoS 1 pro status/commands** | Důležité zprávy musí dorazit (zaručené doručení) |
| **QoS 0 pro metering** | Metering data chodí každou sekundu - pokud jedna zpráva neškodí |
| **Retained jen pro status** | Při připojení nového klienta vidí aktuální stav, ne stará metering data |
| **SSE místo WebSocketu** | Server posílá data do dashboardu, dashboard neposílá nic zpět - SSE stačí |
| **Postgres bez specializované TS DB** | Pro 5 stací nám stačí běžná databáze, nepotřebujeme TimescaleDB |
| **Outbox pattern pro commands** | Uložíme command do DB, pak ho pošleme - když selže, pošleme znovu |
| **Chaos mód na 5. stanici** | Simuluje nestabilní hardware pro testování error handlingu |

---

## Co bych udělal jinak

| Položka | Stav | Poznámka |
|---------|------|----------|
| OCPP 1.6 místo vlastního MQTT modelu | Zatím ne | Velká změna, vyžaduje refaktoring simulátoru a MQTT schématu |
| Víc testů a CI | Částečně | Přidáno 12 frontend testů, backend testů máme dost, CI zatím není |
| OpenAPI / sqlc generování | Částečně | OpenAPI spec přidán (`openapi.yaml`), sqlc generování zatím ne |
| Lepší identity pro stanice | Hotovo | Přidán `STATION_KEY` — simulator posílá API key, backend validuje |
| Lepší UI (teď je moc generické SaaS) | ❌ Zatím ne | Subjektivní, vyžaduje design workshop |

---

## Slabá místa

| Slabina | Závažnost | Stav | Poznámka |
|---------|-----------|------|----------|
| **Monolit backend** | Nízká | ✅ Akceptováno | Pro demo s 5 stanicemi stačí, škálování řešit až při růstu |
| **Slabé testy** | Střední | 🟡 Vyřešeno částečně | Frontend: 12 testů (z 1), backend: pokrytí všech balíčků unit testy |
| **JWT bez refresh** | Střední | ❌ Zatím ne | Pro demo dostačující, pro produkci by bylo potřeba refresh token |
| **Timestamp trust ze stanic** | Střední | ❌ Zatím ne | Bezpečnostní riziko — stanice mohou posílat falešné časy, vyžaduje server-side timestamp override |
| **Pricing až po session** | Nízká | ❌ Zatím ne | Real-time pricing by vyžadoval kontinuální výpočet během session, větší změna |

---

## Časová náročnost

| Fáze | Čas |
|------|-----|
| Backend | 1h 45m |
| Frontend | 1h 10m |
| Simulátor | 0h 30m |
| Setup + docs + debug | 4h 20m |
| **Celkem** | **7h 45m** |

---

## AI Workflow

```
Kimi K2.6 → frontend
GPT 5.5 High → backend
```

AI generuje kostru, ale architektura a rozhodnutí jsou na mně.

---

## Shrnutí workflow

1. Rozdělit zadání na úkoly
2. Navrhnout architekturu
3. Zadat práci agentovi
4. Iterovat řešení
5. Otestovat jako uživatel
6. Opravit chyby
7. Opakovat postup
8. Provést finální úklid