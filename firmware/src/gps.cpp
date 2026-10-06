#include "gps.h"

#include <Arduino.h>
#include <TinyGPSPlus.h>

#include "config.h"

namespace gps {
namespace {

TinyGPSPlus parser;

}  // namespace

void begin() { Serial2.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX); }

void loop() {
  while (Serial2.available()) parser.encode(Serial2.read());
}

Fix current() {
  Fix f = {};
  f.sats = parser.satellites.isValid() ? parser.satellites.value() : 0;
  f.hdop = parser.hdop.isValid() ? parser.hdop.hdop() : 99.9;
  if (parser.location.isValid()) {
    f.lat = parser.location.lat();
    f.lng = parser.location.lng();
    f.valid = parser.location.age() < GPS_MAX_AGE_MS && f.sats >= GPS_MIN_SATS &&
              f.hdop < GPS_MAX_HDOP;
  }
  return f;
}

}  // namespace gps
