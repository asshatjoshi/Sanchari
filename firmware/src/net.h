// Wi-Fi + MQTT. Everything network-specific lives here so it can be swapped for
// an LTE modem later without touching the rest of the firmware.
//
// Topics are sanchari/chairs/<CHAIR_ID>/<name>. The chair subscribes to `cmd`
// and `config`, and publishes `ack`, `telemetry`, `event` and `status`.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace net {

// `name` is the last topic segment, e.g. "cmd".
typedef void (*MessageHandler)(const char* name, const uint8_t* payload, size_t len);

void begin(MessageHandler handler);
void loop();  // keeps Wi-Fi and MQTT connected; never blocks for long
bool connected();
bool publish(const char* name, const char* payload, bool retained = false);

}  // namespace net
