# SatsMeter

**Infraestrutura comunitária que cobra sozinha — em Bitcoin, sem banco, sem intermediário.**

Medidor de energia (ESP32 + INA219) reporta consumo via MQTT; o backend converte
mWh em sats e liquida do saldo do consumidor para o produtor. Saldo esgotou →
carência de 3 leituras → relé corta o circuito. Recarregou acima do mínimo →
religa sozinho. Tudo com garantia de que nada se perde e nada cobra em dobro
(tags + idempotência), mesmo com quedas de rede.


## Fiação

**INA219 (I2C + série com a carga):**
```
INA219 VCC  -> 3V3        INA219 SDA -> GPIO 21
INA219 GND  -> GND        INA219 SCL -> GPIO 22
Fonte 12V + -> VIN+ do INA219
VIN- do INA219 -> COM do relé
NO do relé  -> + da fita LED     (− da fita -> GND da fonte)
```

**Relé:** `GPIO 26 -> IN`, `VIN(5V) -> VCC`, `GND -> GND`.
Contato **NA**: relé sem comando = circuito aberto. Ajuste a regra
(NA vs NF) conforme a política de falha desejada — ver seção fail-safe.


## Subir o ambiente

```bash
docker compose up -d                 # Mosquitto + LNbits

# 1) Frontend (React) — gera backend/public/ (servido pelo Express)
cd frontend && npm install && npm run build

# 2) Backend + dashboard em http://localhost:8000 (tempo real via WebSocket)
cd ../backend && npm install
npm run dev
npm run sim                          # simulador de medidores (sem hardware) — em outro terminal
# alternativa em Python:  python3 tools/simulador.py   (pip install paho-mqtt)
```

**Frontend (React + TypeScript)** — o código-fonte fica em `frontend/` (Vite) e é
**buildado para `backend/public/`** (fora do git), servido pelo próprio Express — por
isso o `npm run build` acima é necessário antes do backend entregar a UI em :8000.
Para desenvolver a UI com hot-reload:

```bash
cd frontend
npm run dev      # Vite com HMR em http://localhost:5173 (proxy de /api e /ws p/ o backend :8000)
npm run build    # regenera backend/public/ quando quiser servir pelo backend (:8000)
```

O dashboard (layout **1b "Pitch hero"**) mostra: o gráfico do pitch com sliders
ao vivo (projeção), os 4 KPIs, as duas séries no tempo e o extrato — estes três
últimos alimentados em **tempo real** pelas leituras que chegam do ESP32/simulador
via MQTT. API: `GET /api/metrics`, `GET /api/projection`, `GET /api/state`,
`POST /api/recarga {casaId,sats}`; stream ao vivo em `ws://localhost:8000/ws`.


## Integração firmware ↔ backend (MQTT)

O backend fala o **contrato do firmware** (ESP32, na branch `firmware`):

- **Broker**: configurável no `.env` — Mosquitto local (dev) ou **HiveMQ Cloud**
  (`MQTT_URL=mqtts://…:8883` + `MQTT_TLS/USERNAME/PASSWORD`), o mesmo do firmware.
- **Leituras** — o firmware publica em `satsmeter/leituras`:
  `{ data_hora, tensao_v, corrente_a, energia_kwh }` (energia **acumulada**; casaId
  opcional — sem ele, usa `DEVICE_ID`). O backend calcula o **delta** de energia,
  converte em sats e dispara as microliquidações.
- **Comandos de relé** — o backend publica em `satsmeter/comandos`: `1` liga
  (religa) / `0` corta. O firmware assina esse tópico.
- **Recarga** (demo) — `satsmeter/recarga` com `{casaId, sats}` ou o `POST /api/recarga`.

Sem hardware, o simulador (`npm run sim` ou `tools/simulador.py`) publica nesse
mesmo formato. O firmware fica na branch **firmware** (projeto PlatformIO na raiz):
copie `include/config.h.example` para `include/config.h`, ajuste Wi-Fi/broker e
`pio run -t upload -t monitor`.


## Regras de negócio

- **Tarifa**: `SATS_POR_MWH` (padrão 0.5 — calibrado p/ demo com carga de ~1W)
- **Histerese**: corta só após `CARENCIA_LEITURAS` (3) no_funds consecutivos
- **Anti-flapping**: religa só com saldo ≥ `SALDO_MINIMO_RELIGA` (50 sats)
- **Fail-safe**: silêncio do medidor NUNCA causa corte; só saldo insuficiente
  confirmado. Queda de rede ≠ inadimplência.
- **Idempotência**: tag repetida devolve o ACK anterior sem nova cobrança
- **Extrato**: histórico auditável de débitos/créditos/cortes (`extrato` no console)


## Deploy (Vercel + Railway)

O dashboard só depende do backend via **WebSocket** — dá pra separar:

**Backend → Railway** (processo persistente: MQTT + WebSocket):
1. Novo projeto no Railway a partir do repo, **Root Directory = `backend`**.
2. Start automático (`npm start`). O Railway injeta `PORT` (o backend já lê).
3. Variáveis de ambiente (mesmas do `backend/.env.example`): `MQTT_URL`, `MQTT_TLS`,
   `MQTT_USERNAME`, `MQTT_PASSWORD`, `TOPIC_LEITURAS`, `TOPIC_COMANDOS`,
   `TOPIC_RECARGA`, `DEVICE_ID`, `SATS_POR_MWH`, etc.
4. Anote a URL pública → WebSocket em `wss://…up.railway.app/ws`.
   > `ledger.json` é efêmero no Railway (reseta a cada deploy). Para persistir,
   > use um volume ou banco.

**Frontend → Vercel** (estático):
1. Importe o repo, **Root Directory = `frontend`** (preset Vite; usa `vercel.json`).
2. Env var **`VITE_WS_URL`** = URL do backend Railway
   (ex.: `wss://satsmeter-backend.up.railway.app` — o `/ws` entra sozinho).
3. Deploy. O build sai em `dist/` (o `vite.config` detecta `VERCEL`).

Local não muda: sem `VITE_WS_URL`, o front usa a mesma origem do backend.


## Licença

MIT — open-source.
