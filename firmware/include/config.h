// Per-chair and hardware configuration. Wi-Fi and broker credentials live in
// secrets.h (copy secrets.h.example; it is git-ignored).
#pragma once

#include "secrets.h"

// Must match the chair ID in the server database and on the QR code.
#ifndef CHAIR_ID
#define CHAIR_ID "SAN-0001"
#endif

// ---- Pins (ESP32 DevKit) — see docs/hardware.md for wiring ----
#define PIN_LOCK 25     // gate of the MOSFET driving the solenoid (HIGH = energised)
#define PIN_BUZZER 27   // active buzzer, HIGH = on (-1 to disable)
#define PIN_BATTERY 34  // battery voltage via divider, ADC1 only (-1 to disable)
#define PIN_GPS_RX 16   // ESP32 RX  <- NEO-7M TX
#define PIN_GPS_TX 17   // ESP32 TX  -> NEO-7M RX
#define GPS_BAUD 9600

// Fail-secure solenoid: energised = unlocked, unpowered = locked. Flip this if
// your lock is fail-safe (energised = locked).
#define LOCK_ENERGISED_UNLOCKS 1

// Battery divider: 100k (top) / 22k (bottom) keeps a 12.6 V pack under 3.3 V.
#define BATTERY_DIVIDER_RATIO ((100.0f + 22.0f) / 22.0f)

// ---- Timing ----
#define TELEMETRY_IDLE_MS 30000
#define TELEMETRY_RIDE_MS 10000
#define GEOFENCE_CHECK_MS 5000
#define GEOFENCE_DEBOUNCE 3  // consecutive readings outside/inside before acting

// ---- GPS fix quality required before the geofence acts ----
#define GPS_MIN_SATS 4
#define GPS_MAX_HDOP 5.0
#define GPS_MAX_AGE_MS 3000

// What happens when the chair leaves the fence. The buzzer always sounds and the
// server is always told. With 1, the lock also engages — see "Design issues" in
// docs/hardware.md before using this with someone in the chair.
#define GEOFENCE_AUTO_LOCK 1
