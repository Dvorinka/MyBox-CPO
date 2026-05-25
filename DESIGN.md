# Design dokument

## Architektura

```
5× simulátor -> Mosquitto MQTT -> Go backend -> REST/SSE API -> React dashboard
                                      |
                                  Postgres
```

---

## Co jsem zvolil a proč

**Go + Gin** — preferují ho v týmu, rychlé na postavit, MQTT klient má dobrou podporu. Node.js by byl taky OK, ale Go je lepší na concurrency a jednodušší Docker image.

**MQTT topicy s verzí** — `cpo/v1/stations/{id}/heartbeat` místo `stations/+/heartbeat`. Verzování je trochu ukecané pro 5 stanic, ale kdybych to měl škálovat, ocením to. Ve skutečnosti bych asi šel přímo OCPP 1.6 JSON přes WebSocket, kdybych měl víc času.

**QoS** — heartbeat a status QoS 1 (ztracený status by pokazil UI), meter QoS 0 (chodí často, jeden drop nevadí, kumulovaný Wh se srovná v dalším bodu), commands QoS 1 (potřebuju vědět, že to došlo). QoS 2 mi přijde zbytečný overhead pro demo.

**Retained** — jen pro status. Po reconnectu backendu hned vidím aktuální stav. Meter retained nedává smysl — poslední historický bod by vypadal jako nový.

**SSE místo WebSocketu** — frontend nepotřebuje posílat data serveru, stačí jednosměrný stream. WebSocket by byl overkill, polling je dřevní.

**Jedna Postgres DB** — pro 5 stanic je samostatná time-series DB (Influx, TimescaleDB) jen bloat. Kdyby to bylo 10k stanic, šel bych TimescaleDB hypertables na `meter_values`.

**State v DB, ne v Redis** — jednodušší, po restartu nic nezmizí. Nevýhoda je víc DB zápisů, ale u 5 stanic je to jedno.

**Command outbox** — REST start/stop uloží řádek do `station_commands` (queued → sent → acked/failed). Je to robustnější než "fire and forget" MQTT publish. Chybí retry worker — kdyby se MQTT broker restartoval uprostřed session, visící commandy zůstanou ve stavu `sent`.

**JWT autentizace** — základní login (`admin/admin`) s Bearer tokenem. Všechny API endpointy kromě `/api/login` a `/api/events` jsou chráněné middlewarem. Token se ukládá v localStorage a posílá se v hlavičce Authorization. Pro demo je to dostačující — ve skutečnosti bych použil Better Auth nebo OAuth2.

**Station-5 chaos mód** — pátá stanice běží s `AUTO_CYCLE=true` a autonomně generuje stavy `Available → Preparing → Charging → Finishing → Available`, případně `Faulted` s automatickou obnovou. To dává živou demo zkušenost bez nutnosti manuálně klikat Start/Stop.

---

## Co bych udělal jinak

- **OCPP 1.6 JSON WebSocket** — to je nejbližší realitě a hodnotí se jako "velký plus". Místo vlastních MQTT topiců bych postavil OCPP server endpoint.
- **Víc testů** — simulator nemá žádný test. HTTP handlery teď mají integrační testy, ale coverage je stále nízká (desloppify: Test health 25,5 % backend, 12,6 % frontend). Produkční kód bez testů bych nedal.
- **sqlc / generated OpenAPI client** — ruční udržování typů na obou stranách je zranitelné. Chybí mi tu CI pipeline.
- **Station auth** — dvě stanice se stejným ID by si navzájem přepisovaly stav. Pro demo to neřeším, ale ve skutečnosti by musel existovat identity layer.
- **Frontend: karty místo tabulky** — v zadání je "tabulka 5 stanic", já mám kartovou mřížku. Funkcionalita je stejná, ale je to nesoulad se zadáním.
- **Frontend design** — statistiky na dashboardu používají "hero-metric" vzor (velké číslo + malý label), což je klišé. A fonty (Geist/Inter) jsou generické. Chtěl bych něco s větší osobností.

---

## Slabá místa

- Jeden backend proces dělá všechno (API, MQTT consumer, offline detector). Na 10k stanic bych to rozdělil.
- Retry worker pro visící commandy chybí.
- Clock drift ze stanic — backend důvěřuje timestampu z payloadu.
- Test coverage je tenká: unit test cenotvorby, DB integrační test, HTTP handler integrační testy a frontend i18n test. Chybí integrační smoke test celého compose stacku.
- JWT je základní (hardcoded credentials, žádná expirace session na serveru, žádný refresh token).
- Pricing tarify se počítají podle času ukončení session, ne podle časových bloků během session.

---

## Čas

Celkem **4 hodiny 29 minut**.

| Co | Čas |
|---|---|
| Zorientování a setup | 0:25 |
| Backend (API, MQTT, DB, pricing, auth) | 1:45 |
| Simulátor | 0:30 |
| Frontend (dashboard, analytika, login) | 1:10 |
| Docker + dokumentace + desloppify | 0:25 |
| Opravy a ověření | 0:14 |

---

## AI asistent

Používal jsem Kimi na frontend a Codex na backend/simulátor. Pomohli s scaffoldem, Docker Compose konfigurací a rychlým ověřením lokálních Go buildů. Kde AI selhává, je doménové rozhodování — QoS levels, retained topics, lifecycle session a slabá místa řešení. To jsem musel držet ručně, protože je to přesně to, na co se budou ptát v pohovoru. Frontendový design jsem kontroloval ručně, AI má tendenci generovat generické UI.
