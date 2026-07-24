#!/usr/bin/env python3
"""
Simulador de medidores SatsMeter — publica leituras MQTT no mesmo formato do
firmware ESP32, para desenvolver/demonstrar sem hardware.

    pip install paho-mqtt
    python3 tools/simulador.py

Equivalente ao simulador Node (`npm run sim`). Use o que preferir.
"""
import json
import os
import random
import signal
import sys
import time

try:
    import paho.mqtt.client as mqtt
except ImportError:
    sys.exit("Instale a dependência:  pip install paho-mqtt")

HOST = os.environ.get("MQTT_HOST", "localhost")
PORT = int(os.environ.get("MQTT_PORT", "1883"))
CASAS = ["A-042", "B-118", "C-007", "A-091", "D-233", "B-054"]
INTERVALO = 1.2  # segundos

client = mqtt.Client()
estado = {c: {"base": 150 + random.random() * 700, "seq": 0} for c in CASAS}


def publicar_leitura(casa_id: str):
    st = estado[casa_id]
    st["base"] = min(1200, max(60, st["base"] + (random.random() - 0.5) * 120))
    watts = round(st["base"] * (0.9 + random.random() * 0.2), 1)
    wh = round(watts * INTERVALO / 3600, 6)
    st["seq"] += 1
    payload = json.dumps({
        "casaId": casa_id,
        "watts": watts,
        "wh": wh,
        "ts": int(time.time() * 1000),
        "tag": f"{casa_id}-{st['seq']}",
    })
    client.publish(f"satsmeter/{casa_id}/reading", payload)


def parar(*_):
    print("\n[sim] encerrando…")
    client.disconnect()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, parar)
    client.connect(HOST, PORT, 60)
    client.loop_start()
    print(f"[sim] conectado a mqtt://{HOST}:{PORT} · {len(CASAS)} casas · a cada {INTERVALO}s")
    ultimo_recarga = time.time()
    while True:
        for casa in CASAS:
            publicar_leitura(casa)
        # recarga periódica -> demonstra religa
        if time.time() - ultimo_recarga > 20:
            casa = random.choice(CASAS)
            sats = 5000 + random.randint(0, 5000)
            client.publish(f"satsmeter/{casa}/recarga", str(sats))
            print(f"[sim] recarga {casa}: +{sats} sats")
            ultimo_recarga = time.time()
        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
