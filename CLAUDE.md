# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sanchari: self-service wheelchair rental in malls. A rider scans the QR code on a chair, opens `/w/<chairId>`, enters name and phone, and the server tells the chair's ESP32 over MQTT to energise a solenoid and unlock it. A NEO-7M GPS feeds a geofence. MVP scope only: no OTP or payments yet (planned later).

**Read `docs/story.md` at the start of each session.** It's the plain-English record of what's been built, why each decision was made, what was discussed with the user, and which questions are still open. When the user asks to update it, add to its dated log and keep its simple-first style.

## Commands

Node and PlatformIO are installed per-user (`~/.local/node/bin`, `~/.platformio/penv/bin`); add them to `PATH` if a non-login shell can't find them.

Server (`cd server`):
- `npm start` / `npm run dev` (watch). Loads `server/.env` if present.
- `npm test` runs all tests. Single file: `node --test test/rides.test.ts`. Single test: `node --test --test-name-pattern="reboots" test/rides.test.ts`
- `npm run typecheck`
- `npm run sim -- SAN-0001`: fake chair speaking the real MQTT protocol (stdin commands: out, in, nofix, fix, mute, unmute, reboot, quit)
- Phone testing: `ngrok http 3000` (ngrok is installed at `~/.local/bin/ngrok`, and the authtoken is already saved in `~/.config/ngrok/ngrok.yml`). The account has a fixed domain, and `PUBLIC_URL` in `server/.env` must match it so admin QR codes point there. Restart the server after changing `.env`. Only HTTP goes through the tunnel; chairs use the local Mosquitto on `localhost:1883`. See the README's "Test from your phone" section.

Firmware (`cd firmware`):
- `pio run`: build. `pio run -t upload && pio device monitor`: flash and watch serial.
- `pio test -e native`: geofence unit tests on the PC (Unity)
- Building needs `include/secrets.h` (git-ignored; copy `secrets.h.example`).

## Architecture

- **Protocol contract**: `docs/protocol.md` defines the MQTT topics and payloads. Three implementations must stay in sync: `firmware/src/main.cpp`, `server/src/mqtt.ts` + `server/src/devices.ts`, and `server/scripts/sim-chair.ts`.
- **Command/ack**: the server publishes `cmd` and awaits a matching `ack` (chairId + action + rideId) for up to 5 s (`ChairBus.command`). A ride only becomes `active` after the unlock ack. If there's no ack, the ride is `failed` and the chair is freed. A rider's "end ride" also needs a lock ack, while staff can force-end, which puts the chair in `maintenance`.
- **`ChairBus` interface** (`server/src/mqtt.ts`): the only way the server talks to chairs. Tests use `FakeBus` (`server/test/helpers.ts`) with `app.inject`, so there's no broker in tests.
- **Geofence is decided on the chair** (`firmware/lib/geofence/`, pure C++ so it's testable natively), with debounce, and readings without a GPS fix are ignored. The server mirrors `pointInPolygon` in `server/src/geo.ts` only for dashboard flags. Polygons are stored as `[[lat, lng], ...]`; GeoJSON input (`[lng, lat]`) is converted in `parsePolygon`. The max point count (64) is shared with the firmware's `kMaxPoints`.
- **Chair boots locked** and sends a `boot` event. The server re-sends unlock if a ride was active, and re-publishes the geofence (`config` is also retained on the broker).
- **Online** = `status` retained/last-will flag plus a message within `ONLINE_WINDOW_MS`.
- **Auth**: the ride UUID is the rider's capability for `/api/rides/:id` (never return the phone number there). `/api/admin/*` requires `Authorization: Bearer $ADMIN_TOKEN`. Admin is disabled when the token is unset.
- Server TypeScript runs directly under Node's type stripping (no build step). Use only erasable syntax (no enums, namespaces or constructor parameter properties) and import with `.ts` extensions. The DB is `node:sqlite` (synchronous) and the schema lives in `server/src/db.ts`.
- Frontend is plain HTML/JS in `server/public/`. Set user-provided text with `textContent` only.
- Firmware network code is isolated in `firmware/src/net.*` so Wi-Fi can be swapped for an LTE modem. Pins and timing are in `firmware/include/config.h`.

## Hardware notes

See `docs/hardware.md`. Its "Design issues" section (indoor GPS, auto-locking an occupied chair, solenoid power draw) is still open. Ask about these before changing geofence or lock behaviour.
