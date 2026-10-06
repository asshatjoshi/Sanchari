# Chair ↔ server MQTT protocol

All topics are `sanchari/chairs/<chairId>/<name>`, QoS 1, JSON payloads. The firmware (`firmware/src/main.cpp`), the server (`server/src/mqtt.ts`, `server/src/devices.ts`) and the simulator (`server/scripts/sim-chair.ts`) must agree on this.

| Topic | Direction | Payload |
|---|---|---|
| `cmd` | server → chair | `{"action":"unlock"\|"lock","rideId":"<uuid>"}`. Admin commands outside a ride use `rideId: "admin"`. |
| `ack` | chair → server | `{"rideId","action","ok":true,"lock":"locked"\|"unlocked"}`, echoing the command. The server matches acks on chairId + action + rideId and waits up to 5 s. |
| `config` | server → chair, **retained** | `{"geofence":[[lat,lng],...]}`, 3–64 points; `[]` clears it. The chair saves it in flash. |
| `telemetry` | chair → server | `{"fix":bool,"lat","lng" (only with fix),"sats","hdop","lock","batt" (volts),"rideId" (during a ride),"fence":"inside"\|"outside"\|"unknown"}`. Every 30 s idle, 10 s during a ride, and right after any command or fence change. |
| `event` | chair → server | `{"type":"boot"\|"geofence_exit"\|"geofence_return", "lat","lng" (if fix), "rideId"}` |
| `status` | chair → server, **retained** | `{"online":true}` on connect; the MQTT last will publishes `{"online":false}` when the chair drops off. |

Behaviour the server relies on:
- The chair always boots **locked** and sends a `boot` event. If a ride was active, the server re-sends `unlock`.
- Geofence exit/return is decided on the chair (works without network) after `GEOFENCE_DEBOUNCE` consecutive readings with a valid fix. Readings without a fix never change anything.
