# Design dokument

## Architektura

```
5x station simulator -> Mosquitto MQTT -> Go backend -> REST/SSE API -> frontend
                                           |
                                       Postgres
```

Backend je Go služba s Gin REST API, Paho MQTT klientem, pgx přístupem do Postgresu, zap logováním a Prometheus metrikami. Simulátor je samostatná Go binárka spuštěná pětkrát přes Docker Compose s odlišným `STATION_ID`, `MAX_POWER_KW` a `FAULT_PROBABILITY`.

Postgres drží aktuální stav stanic, charging sessions, `meter_values` jako jednoduchou time-series tabulku a `station_commands` jako command outbox. Backend drží jen lightweight runtime věci: MQTT spojení, SSE subscribery a offline ticker. Zdroj pravdy je databáze.

## Klíčové tradeoffs

### MQTT topic struktura

Zvolil jsem `cpo/v1/stations/{id}/{heartbeat|status|meter}` a `cpo/v1/stations/{id}/commands/{command}`. Prefix s verzí dovolí později přidat další payload verzi bez přepisování klientů. Alternativa `stations/+/heartbeat` je kratší, ale hůř se rozšiřuje.

### QoS levels

Heartbeat a status používají QoS 1, protože ztracený status umí pokazit aktuální stav UI. Meter values používají QoS 0, protože chodí často a jednotlivý výpadek není kritický; kumulovaný Wh dorovná energii v dalším bodě. Commands používají QoS 1, aby broker potvrdil doručení simulátoru. QoS 2 jsem nepoužil, protože pro demo přidává overhead bez velkého zisku.

### Retained messages

Retained je zapnutý pro status, aby backend po reconnectu rychle dostal poslední známý stav. Meter values retained nejsou, protože by historická telemetrie přes retained topic dávala falešný "nový" bod. Heartbeat také není retained; offline detekce má vycházet z času posledního reálného heartbeat eventu.

### Realtime FE updates

Zvolil jsem Server-Sent Events na `GET /api/events`. Frontend dostane live update bez WebSocket serveru a bez přímého MQTT v prohlížeči. Alternativa WebSocket by dávala obousměrný kanál, ale příkazy už řeší REST endpointy. Polling by byl jednodušší, ale horší pro live dashboard.

### DB schema

Použil jsem jeden Postgres: `stations`, `charging_sessions`, `meter_values`. Pro pět stanic je samostatná time-series DB zbytečná. U větší flotily bych zvažoval TimescaleDB hypertables nebo partitioning `meter_values` podle času.

### State management

Aktuální stav je v Postgresu, ne v Redis cache. Backend má jen transient SSE klienty a MQTT spojení. Je to jednodušší na restart a demo se po restartu neztratí. Nevýhoda je více DB zápisů při vysokém počtu stanic.

### Error handling

Backend má retry na DB/MQTT connect, MQTT auto-reconnect, idempotentní migration runner a idempotentní session start podle `transaction_id`. REST příkazy se ukládají do `station_commands` se stavem `queued/sent/acked/failed`; simulátor posílá MQTT ack. Dead letter queue jsem nepřidal, protože pro demo stačí explicitní command state a logování.

## Co bych udělal jinak s víc časem

- Dotáhl bych sqlc generování a OpenAPI client generation do CI, aby kontrakty nebyly ručně držené.
- Rozšířil bych integration testy na plný compose smoke test s reálným Mosquitto brokerem.
- Přidal bych command retry worker, který umí znovu odeslat dlouho visící `queued/sent` příkazy.
- Doplnil bych station identity/auth, aby se dvě stanice nemohly hlásit pod stejným ID.
- Přidal bych TimescaleDB/partitioning pro dlouhodobou historii meter values.

## Slabá místa současného řešení

- Jeden backend proces je zároveň API, MQTT consumer i offline detector. Pro 10 000 stanic bych rozdělil ingestion a API.
- MQTT broker restart uprostřed session neztratí DB state ani command record, ale aktuálně chybí automatický retry worker pro visící příkazy.
- Pokud se připojí dvě stanice se stejným ID, poslední publisher vyhrává. Produkčně by musel existovat station identity/auth layer.
- Clock drift ze stanic by mohl zkreslit grafy; backend teď důvěřuje timestampu z payloadu.
- Docker smoke na tomto stroji narazil na lokální Docker Desktop/buildx snapshot chybu, takže runtime ověření přes compose je potřeba zopakovat po restartu Dockeru; Go build/test část je validovaná.

## Čas

Aktuální backend/simulator pass: přibližně 6.5 h.

- discovery/repo/skill refs: 0.5 h
- backend: 3.1 h
- simulátor: 1.0 h
- Docker setup: 0.6 h
- dokumentace a ověření: 1.3 h

Frontend čas není započítaný; dashboard dělá paralelně Kimi.

## Spolupráce s AI asistentem

Použil jsem Codex agentic workflow. Pomohl rychle projít zadání, navrhnout MQTT/REST kontrakt, scaffoldnout Go backend/simulátor a spustit lokální Go validace. Užitečný byl hlavně na konzistenci mezi Docker Compose, env proměnnými a API dokumentací.

AI nebyla náhrada za rozhodnutí kolem QoS, retained topics, session lifecycle a slabých míst. Tyto části jsem musel držet explicitně, protože jsou hodnoticí jádro úkolu.
