// ============================================================================
//  SatsMeter — firmware do medidor (ESP32 + INA219 + relé)
//
//  Mede o consumo, integra energia (Wh) e publica leituras via MQTT para o
//  backend Node.js, que converte em sats e liquida em Lightning. Recebe de
//  volta o comando de relé (corte/religa) no tópico satsmeter/<casa>/rele.
//
//  Fiação (ver README): INA219 em série com a carga (SDA=21, SCL=22);
//  relé no GPIO 26 (contato NA — sem comando = circuito aberto).
//
//  Escolha o modo abaixo. MEDICAO_INA219 é o padrão e cai para o modo
//  simulado automaticamente se o sensor não for encontrado no boot.
// ============================================================================

#define MEDICAO_INA219   1
#define MEDICAO_SIMULADA 2
#define MODO_MEDICAO     MEDICAO_INA219   // <- troque aqui se quiser forçar simulação

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <time.h>
#include "config.h"

// --- pinos ---
static const int PINO_RELE = 26;
static const int PINO_SDA  = 21;
static const int PINO_SCL  = 22;
static const bool RELE_ATIVO_ALTO = true;   // ajuste conforme seu módulo de relé

// --- tempos ---
static const uint32_t INTERVALO_PUBLICACAO_MS = 1500;  // publica leitura
static const uint32_t INTERVALO_AMOSTRA_MS    = 200;   // amostra potência

// --- tópicos ---
static char topicoReading[64];
static char topicoRele[64];

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);
Adafruit_INA219 ina219;

bool     usandoIna219 = false;
double   whAcumulado  = 0.0;   // energia desde a última publicação (Wh)
double   wattsAtual   = 0.0;
uint32_t seqTag       = 0;     // idempotência: monotônico por dispositivo
uint32_t tUltimaAmostra = 0;
uint32_t tUltimaPublicacao = 0;
bool     releLigado   = true;  // fail-safe: entrega energia até o backend mandar cortar

// ---------------------------------------------------------------------------
void acionarRele(bool ligar) {
  releLigado = ligar;
  digitalWrite(PINO_RELE, (ligar == RELE_ATIVO_ALTO) ? HIGH : LOW);
  Serial.printf("[rele] %s\n", ligar ? "LIGADO (circuito fechado)" : "DESLIGADO (circuito aberto)");
}

// mede a potência instantânea (W)
double medirWatts() {
#if MODO_MEDICAO == MEDICAO_INA219
  if (usandoIna219) {
    double mW = ina219.getPower_mW();
    if (mW < 0) mW = 0;
    return mW / 1000.0;
  }
#endif
  // modo simulado (fallback ou forçado): random walk entre 60 e 1200 W
  static double base = 400.0;
  base += (random(-60, 61));
  if (base < 60) base = 60;
  if (base > 1200) base = 1200;
  return base;
}

// ---------------------------------------------------------------------------
void conectarWifi() {
  Serial.printf("[wifi] conectando a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] conectado · IP %s\n", WiFi.localIP().toString().c_str());
  // NTP para timestamps reais no extrato (opcional; sem isso, ts=0 e o backend usa a hora do servidor)
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

uint64_t epochMillis() {
  time_t agora = time(nullptr);
  if (agora < 1700000000) return 0;          // ainda não sincronizou -> backend usa a própria hora
  return (uint64_t)agora * 1000ULL;
}

void aoReceberMqtt(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  if (String(topic) == topicoRele) {
    if (msg == "on")  acionarRele(true);
    else if (msg == "off") acionarRele(false);
  }
}

void conectarMqtt() {
  while (!mqtt.connected()) {
    String clientId = String("satsmeter-") + CASA_ID;
    Serial.printf("[mqtt] conectando a %s:%d …", MQTT_HOST, MQTT_PORT);
    if (mqtt.connect(clientId.c_str())) {
      Serial.println(" ok");
      mqtt.subscribe(topicoRele);   // recebe comandos de corte/religa (retidos)
      Serial.printf("[mqtt] assinando %s\n", topicoRele);
    } else {
      Serial.printf(" falhou (rc=%d), tentando de novo em 2s\n", mqtt.state());
      delay(2000);
    }
  }
}

// ---------------------------------------------------------------------------
void publicarLeitura() {
  seqTag++;
  JsonDocument doc;
  doc["casaId"] = CASA_ID;
  doc["watts"]  = round(wattsAtual * 10) / 10.0;
  doc["wh"]     = whAcumulado;
  doc["ts"]     = epochMillis();
  doc["tag"]    = String(CASA_ID) + "-" + String(seqTag);

  char buf[192];
  size_t n = serializeJson(doc, buf);
  mqtt.publish(topicoReading, buf, n);
  Serial.printf("[pub] %s\n", buf);

  whAcumulado = 0.0;  // zera o acumulado da janela
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== SatsMeter medidor ===");

  pinMode(PINO_RELE, OUTPUT);
  acionarRele(true);   // boot: circuito fechado (fail-safe)

  snprintf(topicoReading, sizeof(topicoReading), "satsmeter/%s/reading", CASA_ID);
  snprintf(topicoRele,    sizeof(topicoRele),    "satsmeter/%s/rele",    CASA_ID);

#if MODO_MEDICAO == MEDICAO_INA219
  Wire.begin(PINO_SDA, PINO_SCL);
  if (ina219.begin()) {
    usandoIna219 = true;
    Serial.println("[medicao] INA219 detectado");
  } else {
    usandoIna219 = false;
    Serial.println("[medicao] INA219 ausente -> fallback para modo SIMULADO");
  }
#else
  usandoIna219 = false;
  Serial.println("[medicao] modo SIMULADO (forçado)");
#endif

  conectarWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(aoReceberMqtt);
  mqtt.setBufferSize(256);

  tUltimaAmostra = tUltimaPublicacao = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWifi();
  if (!mqtt.connected()) conectarMqtt();
  mqtt.loop();

  uint32_t agora = millis();

  // integra energia: Wh += P(W) * dt(h)
  if (agora - tUltimaAmostra >= INTERVALO_AMOSTRA_MS) {
    double dtH = (agora - tUltimaAmostra) / 3600000.0;
    wattsAtual = medirWatts();
    whAcumulado += wattsAtual * dtH;
    tUltimaAmostra = agora;
  }

  // publica a leitura da janela
  if (agora - tUltimaPublicacao >= INTERVALO_PUBLICACAO_MS) {
    publicarLeitura();
    tUltimaPublicacao = agora;
  }
}
