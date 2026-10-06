#include "net.h"

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <string.h>

#include "certs.h"
#include "config.h"

namespace net {
namespace {

const char kTopicPrefix[] = "sanchari/chairs/" CHAIR_ID "/";

#if MQTT_USE_TLS
WiFiClientSecure transport;
#else
WiFiClient transport;
#endif
PubSubClient mqtt(transport);

MessageHandler handler = nullptr;
uint32_t nextAttemptMs = 0;
uint32_t backoffMs = 1000;
const uint32_t kMaxBackoffMs = 30000;

String topic(const char* name) { return String(kTopicPrefix) + name; }

void onMessage(char* fullTopic, uint8_t* payload, unsigned int len) {
  const size_t prefixLen = sizeof(kTopicPrefix) - 1;
  if (handler && strncmp(fullTopic, kTopicPrefix, prefixLen) == 0) {
    handler(fullTopic + prefixLen, payload, len);
  }
}

void tryConnect() {
  Serial.printf("[net] connecting to MQTT %s:%d ... ", MQTT_HOST, MQTT_PORT);
  // Last will: the broker marks the chair offline if it drops off the network.
  String statusTopic = topic("status");
  const char* user = strlen(MQTT_USER) ? MQTT_USER : nullptr;
  const char* pass = strlen(MQTT_PASS) ? MQTT_PASS : nullptr;
  bool ok = mqtt.connect(CHAIR_ID, user, pass, statusTopic.c_str(), 1, true,
                         "{\"online\":false}");
  if (!ok) {
    Serial.printf("failed (state %d), retry in %lus\n", mqtt.state(), backoffMs / 1000);
    nextAttemptMs = millis() + backoffMs;
    backoffMs = min(backoffMs * 2, kMaxBackoffMs);
    return;
  }
  Serial.println("ok");
  backoffMs = 1000;
  mqtt.subscribe(topic("cmd").c_str(), 1);
  mqtt.subscribe(topic("config").c_str(), 1);
  mqtt.publish(statusTopic.c_str(), "{\"online\":true}", true);
}

}  // namespace

void begin(MessageHandler h) {
  handler = h;
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[net] joining Wi-Fi '%s'\n", WIFI_SSID);

#if MQTT_USE_TLS
  transport.setCACert(kMqttRootCa);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(2048);  // geofence polygons can be ~1 KB of JSON
  mqtt.setKeepAlive(30);
}

void loop() {
  static bool wifiWasUp = false;
  bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (wifiUp != wifiWasUp) {
    wifiWasUp = wifiUp;
    if (wifiUp) {
      Serial.printf("[net] Wi-Fi up, IP %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println("[net] Wi-Fi down");
    }
  }
  if (!wifiUp) return;

  if (!mqtt.connected() && (int32_t)(millis() - nextAttemptMs) >= 0) tryConnect();
  mqtt.loop();
}

bool connected() { return mqtt.connected(); }

bool publish(const char* name, const char* payload, bool retained) {
  if (!mqtt.connected()) return false;
  return mqtt.publish(topic(name).c_str(), payload, retained);
}

}  // namespace net
