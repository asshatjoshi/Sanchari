// Sanchari wheelchair controller.
//
// Waits for unlock/lock commands from the server over MQTT, reports location
// and lock state, and watches the geofence around the mall.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

#include "config.h"
#include "geofence.h"
#include "gps.h"
#include "lock.h"
#include "net.h"

namespace {

Preferences prefs;
GeofenceMonitor fence(GEOFENCE_DEBOUNCE);
String rideId;               // empty when no ride is active
bool lockedByFence = false;  // the fence (not the server) engaged the lock
bool bootReported = false;
uint32_t lastTelemetryMs = 0;
uint32_t lastFenceCheckMs = 0;

void buzzer(bool on) {
  if (PIN_BUZZER >= 0) digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
}

float batteryVolts() {
  if (PIN_BATTERY < 0) return -1;
  return analogReadMilliVolts(PIN_BATTERY) / 1000.0f * BATTERY_DIVIDER_RATIO;
}

void publishJson(const char* name, JsonDocument& doc) {
  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  net::publish(name, buf);
}

void sendEvent(const char* type) {
  JsonDocument doc;
  doc["type"] = type;
  if (rideId.length()) doc["rideId"] = rideId;
  gps::Fix f = gps::current();
  if (f.valid) {
    doc["lat"] = f.lat;
    doc["lng"] = f.lng;
  }
  publishJson("event", doc);
}

void sendTelemetry() {
  gps::Fix f = gps::current();
  JsonDocument doc;
  doc["fix"] = f.valid;
  if (f.valid) {
    doc["lat"] = serialized(String(f.lat, 6));
    doc["lng"] = serialized(String(f.lng, 6));
  }
  doc["sats"] = f.sats;
  doc["hdop"] = serialized(String(f.hdop, 1));
  doc["lock"] = lock::stateName();
  float v = batteryVolts();
  if (v >= 0) doc["batt"] = serialized(String(v, 2));
  if (rideId.length()) doc["rideId"] = rideId;
  doc["fence"] = fence.state() == GeofenceMonitor::kOutside  ? "outside"
                 : fence.state() == GeofenceMonitor::kInside ? "inside"
                                                             : "unknown";
  publishJson("telemetry", doc);
}

// ---- Commands from the server: {"action":"unlock"|"lock","rideId":"..."} ----
void handleCommand(const uint8_t* payload, size_t len) {
  JsonDocument cmd;
  if (deserializeJson(cmd, payload, len)) {
    Serial.println("[cmd] bad JSON");
    return;
  }
  const char* action = cmd["action"] | "";
  const char* id = cmd["rideId"] | "";
  bool ok = true;

  if (strcmp(action, "unlock") == 0) {
    rideId = id;
    lockedByFence = false;
    buzzer(false);
    lock::unlock();
  } else if (strcmp(action, "lock") == 0) {
    rideId = "";
    lockedByFence = false;
    buzzer(false);
    lock::lock();
  } else {
    ok = false;
  }

  JsonDocument ack;
  ack["rideId"] = id;
  ack["action"] = action;
  ack["ok"] = ok;
  ack["lock"] = lock::stateName();
  publishJson("ack", ack);
  sendTelemetry();
}

// ---- Geofence config: {"geofence":[[lat,lng], ...]} (retained, so it arrives on connect) ----
bool applyFenceJson(const char* json, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, json, len)) return false;
  JsonArray pts = doc["geofence"].as<JsonArray>();
  LatLng poly[GeofenceMonitor::kMaxPoints];
  size_t n = 0;
  for (JsonArray p : pts) {
    if (n >= GeofenceMonitor::kMaxPoints) return false;
    poly[n++] = {p[0].as<double>(), p[1].as<double>()};
  }
  if (n == 0) {
    fence.clear();
    Serial.println("[fence] cleared");
    return true;
  }
  bool ok = fence.setPolygon(poly, n);
  Serial.printf("[fence] %s polygon with %u points\n", ok ? "loaded" : "rejected", n);
  return ok;
}

void handleConfig(const uint8_t* payload, size_t len) {
  String json((const char*)payload, len);
  if (applyFenceJson(json.c_str(), json.length())) {
    prefs.putString("fence", json);  // survive reboots without network
  }
}

void onMessage(const char* name, const uint8_t* payload, size_t len) {
  if (strcmp(name, "cmd") == 0) handleCommand(payload, len);
  else if (strcmp(name, "config") == 0) handleConfig(payload, len);
}

void checkFence() {
  gps::Fix f = gps::current();
  GeofenceMonitor::Event e = fence.update(f.valid, {f.lat, f.lng});

  if (e == GeofenceMonitor::kExited) {
    Serial.println("[fence] chair left the geofence");
    buzzer(true);
    if (GEOFENCE_AUTO_LOCK && lock::isUnlocked()) {
      lock::lock();
      lockedByFence = true;
    }
    sendEvent("geofence_exit");
    sendTelemetry();
  } else if (e == GeofenceMonitor::kReturned) {
    Serial.println("[fence] chair back inside the geofence");
    buzzer(false);
    // Give the rider their chair back if the fence (not the server) locked it.
    if (lockedByFence && rideId.length()) lock::unlock();
    lockedByFence = false;
    sendEvent("geofence_return");
    sendTelemetry();
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.printf("\n[boot] Sanchari chair %s\n", CHAIR_ID);

  lock::begin();
  if (PIN_BUZZER >= 0) pinMode(PIN_BUZZER, OUTPUT);
  buzzer(false);
  gps::begin();

  prefs.begin("sanchari", false);
  String saved = prefs.getString("fence", "");
  if (saved.length()) applyFenceJson(saved.c_str(), saved.length());

  net::begin(onMessage);
}

void loop() {
  net::loop();
  gps::loop();

  uint32_t now = millis();

  if (net::connected() && !bootReported) {
    bootReported = true;
    sendEvent("boot");  // lets the server re-send unlock if a ride was in progress
  }

  if (now - lastFenceCheckMs >= GEOFENCE_CHECK_MS) {
    lastFenceCheckMs = now;
    checkFence();
  }

  uint32_t interval = rideId.length() ? TELEMETRY_RIDE_MS : TELEMETRY_IDLE_MS;
  if (net::connected() && now - lastTelemetryMs >= interval) {
    lastTelemetryMs = now;
    sendTelemetry();
  }
}
