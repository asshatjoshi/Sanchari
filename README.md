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

## Test from your phone (ngrok)

To scan a chair's QR code with a real phone, the phone has to reach the server running on your laptop. [ngrok](https://ngrok.com) gives the laptop a public `https://` address, so the phone can use mobile data or any Wi-Fi. Only the server goes through ngrok. The chair (simulator or ESP32) keeps talking to the MQTT broker on your laptop.

```
Phone (any network) ──▶ ngrok ──▶ server on your laptop (port 3000) ◀──MQTT── chair / simulator
```

One-time setup:
1. Create a free account at https://ngrok.com and install ngrok.
2. Save your authtoken: `ngrok config add-authtoken <your-token>`. Keep it out of the repo and chats; reset it on the ngrok dashboard if it leaks.
3. Free accounts get one fixed domain (dashboard → Domains), like `something.ngrok-free.dev`. Put it in `server/.env`:
   ```
   PUBLIC_URL=https://something.ngrok-free.dev
   ```
   QR codes from the admin page use `PUBLIC_URL`, so they keep working across restarts.

Each test session, in three terminals:

```bash
cd server && npm start            # 1. server
ngrok http 3000                   # 2. tunnel (uses your fixed domain)
cd server && npm run sim -- SAN-0001   # 3. fake chair (or power on a real one)
```

Then open `/admin` (on the laptop, http://localhost:3000/admin), click **QR** next to the chair, and scan it with your phone. On the free plan, ngrok shows a "You are about to visit…" page the first time; tap **Visit Site**. Unlocking on the phone should flip the chair to **unlocked / in use** on the admin page within a few seconds.

ngrok is for testing only. Test data passes through ngrok's servers, and it only works while your laptop is running. Production needs the server on a cloud host with its own domain and a hosted MQTT broker.

Phones on the same Wi-Fi can also skip ngrok and use `http://<laptop-LAN-IP>:3000`, but guest networks and the laptop's firewall often block that (`sudo ufw allow 3000/tcp` opens it).

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
