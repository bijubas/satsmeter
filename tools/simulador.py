#!/usr/bin/env python3
"""
Simulador de medidores SatsMeter — publica leituras MQTT no MESMO formato do
firmware ESP32 (tópico `satsmeter/leituras`, energia acumulada em kWh), para
desenvolver/demonstrar sem hardware.

    pip install paho-mqtt
    python3 tools/simulador.py

Equivalente ao simulador Node (`npm run sim`). Use o que preferir.
Broker/credenciais vêm de variáveis de ambiente (padrão: Mosquitto local).
"""
import json
import os
import random
import signal
import sys
import time
from datetime import datetime

try:
    import paho.mqtt.client as mqtt
except ImportError:
    sys.exit("Instale a dependência:  pip install paho-mqtt")

HOST = os.environ.get("MQTT_HOST", "localhost")
PORT = int(os.environ.get("MQTT_PORT", "1883"))
USER = os.environ.get("MQTT_USERNAME", "")
PASSWORD = os.environ.get("MQTT_PASSWORD", "")
TLS = os.environ.get("MQTT_TLS", "false") == "true"
TOPIC_LEITURAS = os.environ.get("TOPIC_LEITURAS", "satsmeter/leituras")
TOPIC_RECARGA = os.environ.get("TOPIC_RECARGA", "satsmeter/recarga")

CASAS = ["A-042", "B-118", "C-007", "A-091", "D-233", "B-054"]
INTERVALO = 1.5  # segundos
TENSAO = 127.0

client = mqtt.Client()
if USER:
    client.username_pw_set(USER, PASSWORD)
if TLS:
    client.tls_set()
estado = {c: {"base": 150 + random.random() * 700, "kwh": 0.0} for c in CASAS}


def publicar(casa_id: str):
    st = estado[casa_id]
    st["base"] = min(1200, max(60, st["base"] + (random.random() - 0.5) * 120))
    watts = round(st["base"] * (0.9 + random.random() * 0.2), 1)
    st["kwh"] += watts * INTERVALO / 3600 / 1000  # acumula kWh
    payload = json.dumps({
        "casaId": casa_id,
        "data_hora": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        "tensao_v": round(TENSAO, 2),
        "corrente_a": round(watts / TENSAO, 3),
        "energia_kwh": round(st["kwh"], 6),
    })
    client.publish(TOPIC_LEITURAS, payload)


def parar(*_):
    print("\n[sim] encerrando…")
    client.disconnect()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, parar)
    client.connect(HOST, PORT, 60)
    client.loop_start()
    print(f"[sim] conectado a {HOST}:{PORT} · {len(CASAS)} casas · a cada {INTERVALO}s")
    ultimo_recarga = time.time()
    while True:
        for casa in CASAS:
            publicar(casa)
        if time.time() - ultimo_recarga > 20:
            casa = random.choice(CASAS)
            sats = 5000 + random.randint(0, 5000)
            client.publish(TOPIC_RECARGA, json.dumps({"casaId": casa, "sats": sats}))
            print(f"[sim] recarga {casa}: +{sats} sats")
            ultimo_recarga = time.time()
        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
