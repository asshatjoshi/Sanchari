import { buildApp } from '../src/app.ts';
import { openDb, type Db } from '../src/db.ts';
import type { Ack, Action, ChairBus, ChairMessageHandler, ChairMessageKind } from '../src/mqtt.ts';
import type { LatLng } from '../src/geo.ts';

// In-memory stand-in for the MQTT bus. `respond` decides whether the "chair"
// acks a command; tests can also push device messages with `emit`.
export class FakeBus implements ChairBus {
  respond = true;
  commands: { chairId: string; action: Action; rideId: string }[] = [];
  fences: { chairId: string; polygon: LatLng[] | null }[] = [];
  handlers: ChairMessageHandler[] = [];

  async command(chairId: string, action: Action, rideId: string): Promise<Ack | null> {
    this.commands.push({ chairId, action, rideId });
    return this.respond ? { rideId, action, ok: true, lock: action === 'unlock' ? 'unlocked' : 'locked' } : null;
  }
  publishGeofence(chairId: string, polygon: LatLng[] | null) {
    this.fences.push({ chairId, polygon });
  }
  onMessage(handler: ChairMessageHandler) {
    this.handlers.push(handler);
  }
  emit(chairId: string, kind: ChairMessageKind, payload: object) {
    for (const h of this.handlers) h(chairId, kind, payload);
  }
  async close() {}
}

export const ADMIN_TOKEN = 'test-token';
export const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };

export async function setup(): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; db: Db; bus: FakeBus }> {
  const db = openDb(':memory:');
  const bus = new FakeBus();
  const app = await buildApp({ db, bus, adminToken: ADMIN_TOKEN, publicUrl: 'https://sanchari.test' });
  return { app, db, bus };
}

// Adds a chair and marks it online, as if it had just connected.
export function addOnlineChair(db: Db, bus: FakeBus, id = 'SAN-0001') {
  db.prepare('INSERT INTO chairs (id) VALUES (?)').run(id);
  bus.emit(id, 'status', { online: true });
}
