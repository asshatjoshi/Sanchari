// Pretends to be a wheelchair's ESP32, speaking the same MQTT protocol, so the
// server and rider page can be tested without hardware.
//
//   npm run sim -- SAN-0001
//
// Then type commands: out | in | nofix | fix | mute | unmute | reboot | quit
import { createInterface } from 'node:readline';

import mqtt from 'mqtt';

import { pointInPolygon, type LatLng } from '../src/geo.ts';

const chairId = (process.argv[2] ?? 'SAN-0001').toUpperCase();
const url = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const base = `sanchari/chairs/${chairId}/`;

let unlocked = false;
let rideId = '';
let fence: LatLng[] = [];
let pos: LatLng = [12.9716, 77.5946];
let hasFix = true;
let muted = false; // when true, ignore commands (to test the server's timeout path)

const client = mqtt.connect(url, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: chairId,
  will: { topic: base + 'status', payload: Buffer.from('{"online":false}'), qos: 1, retain: true },
});

const send = (name: string, body: object, retain = false) =>
  client.publish(base + name, JSON.stringify(body), { qos: 1, retain });

const fenceState = () =>
  !fence.length || !hasFix ? 'unknown' : pointInPolygon(pos, fence) ? 'inside' : 'outside';

function telemetry() {
  send('telemetry', {
    fix: hasFix,
    ...(hasFix ? { lat: pos[0], lng: pos[1] } : {}),
    sats: hasFix ? 8 : 0,
    hdop: hasFix ? 1.2 : 99.9,
    lock: unlocked ? 'unlocked' : 'locked',
    batt: 12.4,
    ...(rideId ? { rideId } : {}),
    fence: fenceState(),
  });
}

function boot() {
  unlocked = false;
  rideId = '';
  send('status', { online: true }, true);
  send('event', { type: 'boot' });
  telemetry();
}

client.on('connect', () => {
  console.log(`[sim ${chairId}] connected to ${url}`);
  client.subscribe([base + 'cmd', base + 'config'], { qos: 1 });
  boot();
});

client.on('message', (topic, buf) => {
  const msg = JSON.parse(buf.toString());
  if (topic.endsWith('/config')) {
    fence = msg.geofence ?? [];
    if (fence.length) {
      // Start in the middle of the fence.
      pos = [fence.reduce((s, p) => s + p[0], 0) / fence.length, fence.reduce((s, p) => s + p[1], 0) / fence.length];
    }
    console.log(`[sim ${chairId}] geofence with ${fence.length} points`);
    return;
  }
  if (muted) return console.log(`[sim ${chairId}] (muted) ignoring ${msg.action}`);
  const ok = msg.action === 'unlock' || msg.action === 'lock';
  if (msg.action === 'unlock') { unlocked = true; rideId = msg.rideId; }
  if (msg.action === 'lock') { unlocked = false; rideId = ''; }
  console.log(`[sim ${chairId}] ${msg.action} -> ${unlocked ? 'UNLOCKED' : 'LOCKED'}`);
  send('ack', { rideId: msg.rideId, action: msg.action, ok, lock: unlocked ? 'unlocked' : 'locked' });
  telemetry();
});

setInterval(() => client.connected && telemetry(), rideId ? 10_000 : 30_000);

const rl = createInterface({ input: process.stdin });
console.log('commands: out | in | nofix | fix | mute | unmute | reboot | quit');
rl.on('line', (line) => {
  switch (line.trim()) {
    case 'out':
      pos = [pos[0] + 0.01, pos[1]]; // ~1 km north
      if (unlocked) unlocked = false;
      send('event', { type: 'geofence_exit', lat: pos[0], lng: pos[1], ...(rideId ? { rideId } : {}) });
      break;
    case 'in':
      pos = [pos[0] - 0.01, pos[1]];
      if (rideId) unlocked = true;
      send('event', { type: 'geofence_return', lat: pos[0], lng: pos[1], ...(rideId ? { rideId } : {}) });
      break;
    case 'nofix': hasFix = false; break;
    case 'fix': hasFix = true; break;
    case 'mute': muted = true; break;
    case 'unmute': muted = false; break;
    case 'reboot': boot(); break;
    case 'quit': client.end(true, () => process.exit(0)); return; // no clean disconnect: will fires
    default: return console.log('?');
  }
  telemetry();
  console.log(`[sim ${chairId}] ${line.trim()}: lock=${unlocked ? 'unlocked' : 'locked'} fence=${fenceState()}`);
});
