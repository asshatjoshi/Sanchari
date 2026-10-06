// u-blox NEO-7M on UART2, parsed with TinyGPSPlus.
#pragma once

#include <stdint.h>

namespace gps {

struct Fix {
  bool valid;  // good enough for the geofence to act on
  double lat;
  double lng;
  uint32_t sats;
  double hdop;
};

void begin();
void loop();  // call every loop iteration to drain the UART
Fix current();

}  // namespace gps
