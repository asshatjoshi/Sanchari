# Sanchari

Self-service wheelchairs for malls and other public spaces. A visitor scans the QR code on a wheelchair, enters their name and mobile number, and the chair unlocks. A GPS geofence around the mall locks the chair if it is taken outside.

```
Phone ──HTTPS──▶ server/ (Node + Fastify + SQLite) ──MQTT──▶ firmware/ (ESP32 + solenoid lock + NEO-7M GPS)
```

- `firmware/`: ESP32 code (PlatformIO, Arduino framework)
- `server/`: rider page (`/w/<chairId>`), staff admin page (`/admin`), API and MQTT bridge
- `docs/hardware.md`: parts list, wiring, bench tests and open design issues
- `docs/protocol.md`: MQTT topics between the chairs and the server

## Run it locally (no hardware needed)

Requires Node 24+ and an MQTT broker (Mosquitto: `sudo apt install mosquitto`).

```bash
cd server
npm install
cp .env.example .env          # set ADMIN_TOKEN to something
npm start                     # http://localhost:3000
npm run sim -- SAN-0001       # in another terminal: a fake chair
```

1. Open http://localhost:3000/admin and sign in with your `ADMIN_TOKEN`.
2. Add chair `SAN-0001`. Optionally draw a geofence on geojson.io and paste it in.
3. Open http://localhost:3000/w/SAN-0001, enter a name and number, then unlock.
4. In the simulator, type `out` to leave the geofence, or `mute` to see what happens when a chair doesn't respond.

## Flash a real chair

```bash
cd firmware
cp include/secrets.h.example include/secrets.h    # Wi-Fi + broker details
pio run -t upload && pio device monitor
```

Set `CHAIR_ID` in `secrets.h` (or `config.h`) to the ID you added in the admin page. Wiring is in `docs/hardware.md`.

If the broker runs on your laptop, the ESP32 has to reach it over the network. Mosquitto 2 only listens on localhost by default, so for local testing add these lines to `/etc/mosquitto/conf.d/lan.conf` and restart Mosquitto:

```
listener 1883
allow_anonymous true
```

Use a username and password, or a hosted broker such as HiveMQ Cloud, for anything beyond your own network.

## Tests

```bash
cd server && npm test && npm run typecheck
cd firmware && pio test -e native      # geofence logic, runs on the PC
```
