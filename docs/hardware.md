# Prototype hardware

## Parts

| Part | Notes |
|---|---|
| ESP32 DevKit V1 (ESP32-WROOM-32, 30 or 38 pin) | Not a WROVER board: those use GPIO16/17 for PSRAM. |
| u-blox NEO-7M GPS module + its patch antenna | Antenna must face the sky. Most breakout boards accept 3.3–5 V. |
| 12 V solenoid lock, fail-secure | "Fail-secure" = locked when unpowered. Draws ~0.5–1 A while unlocked. |
| IRLZ44N logic-level N-channel MOSFET | Switches the solenoid from a 3.3 V GPIO. |
| 1N5819 (or 1N4007) diode | Flyback diode across the solenoid. **Required**: without it the coil's voltage spike kills the MOSFET/ESP32. |
| 220 Ω and 10 kΩ resistors | Gate resistor and gate pull-down (keeps the lock locked while the ESP32 boots). |
| 12 V battery: 3S Li-ion pack with BMS (12.6 V full) or a small 12 V SLA | |
| Buck converter 12 V → 5 V (MP1584 or LM2596 module) | Set to 5.0 V **before** connecting the ESP32. |
| 100 kΩ + 22 kΩ resistors | Battery voltage divider (12.6 V → 2.27 V). |
| Active buzzer, 3.3 V | Sounds when the chair leaves the geofence. |

## Wiring

```
 12V battery + ──┬──────────────────────┬───────────────┐
                 │                      │               │
            [Buck 12→5V]          Solenoid (+)      100kΩ
                 │                      │               ├────────── GPIO34 (battery sense)
            ESP32 VIN (5V)        Solenoid (−)       22kΩ
                                        │               │
                                   MOSFET drain        GND
         1N5819 across the solenoid: stripe (cathode) to +12V, anode to solenoid (−)

 GPIO25 ── 220Ω ──┬── MOSFET gate          MOSFET source ── GND
                  └── 10kΩ ── GND

 NEO-7M  VCC → ESP32 3V3 (or 5V if your board has a regulator)
         GND → GND
         TX  → GPIO16 (ESP32 RX2)
         RX  → GPIO17 (ESP32 TX2)

 Buzzer  + → GPIO27,  − → GND

 All grounds (battery −, buck −, ESP32 GND, MOSFET source, GPS GND) must be connected together.
```

Pins are defined in `firmware/include/config.h`. IRLZ44N pinout, looking at the front with legs down: Gate, Drain, Source.

## Bench test order

1. Buck converter alone: set to 5.0 V with a multimeter.
2. ESP32 on USB only, flash the firmware, open the serial monitor: it should boot and try Wi-Fi.
3. Add the GPS. Put the antenna by a window or outdoors; a cold start can take 1–2 minutes. Telemetry will show `"fix":true` and a satellite count.
4. Add the MOSFET + solenoid on 12 V (USB can stay connected). Unlock from the admin page: the solenoid should click and the ESP32 must not reset. If it resets, the flyback diode is missing/backwards or the grounds aren't shared.
5. Battery sense: compare the `batt` value in telemetry with a multimeter and adjust `BATTERY_DIVIDER_RATIO` if needed.

## Design issues to settle before a pilot

- **GPS indoors.** Inside a mall the NEO-7M rarely gets a fix. The firmware ignores readings without a good fix (≥ 4 satellites, HDOP < 5), so the geofence only acts once the chair is outside where the sky is visible — which is when it matters. Indoor tracking would need something else (e.g. BLE beacons).
- **Locking an occupied chair.** With `GEOFENCE_AUTO_LOCK 1` the lock engages when the chair leaves the fence. If the lock blocks a wheel, that can strand a disabled rider in a car park. Decide what the lock physically holds. Safer options: buzzer + staff alert only (`GEOFENCE_AUTO_LOCK 0`), or only locking when the chair is stationary. If the rider brings the chair back inside, the firmware unlocks it again, and staff can unlock it from the admin page.
- **Battery drain.** A fail-secure solenoid draws current for the whole ride. Fine for a prototype; for production use a latching (bistable) solenoid or a small motorised lock that only draws power while switching.
- **Network.** Prototype uses Wi-Fi. Mall Wi-Fi usually has a captive login page the ESP32 can't get through, so use your own router or a phone hotspot. Production should move to an LTE-M/4G modem (e.g. SIM7080G, A7670); only `firmware/src/net.cpp` needs to change.
