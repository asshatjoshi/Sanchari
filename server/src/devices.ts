// Handles messages the chairs publish (telemetry, events, status, acks).
import { ACK_TIMEOUT_MS } from './config.ts';
import { addEvent, getActiveRide, getChair, getGeofence, type Db } from './db.ts';
import { pointInPolygon, type LatLng } from './geo.ts';
import type { ChairBus, ChairMessageKind } from './mqtt.ts';

export function attachDeviceHandlers(db: Db, bus: ChairBus): void {
  bus.onMessage((chairId, kind, payload) => {
    try {
      handle(db, bus, chairId, kind, payload);
    } catch (err) {
      console.error(`[devices] error handling ${kind} from ${chairId}:`, err);
    }
  });
}

function handle(db: Db, bus: ChairBus, chairId: string, kind: ChairMessageKind, msg: any): void {
  const chair = getChair(db, chairId);
  if (!chair) return; // unknown chair: add it from the admin page first

  const now = Date.now();
  if (kind === 'status') {
    db.prepare('UPDATE chairs SET online = ?, last_seen = ? WHERE id = ?').run(
      msg.online ? 1 : 0,
      now,
      chairId,
    );
    addEvent(db, chairId, msg.online ? 'online' : 'offline');
    return;
  }

  db.prepare('UPDATE chairs SET online = 1, last_seen = ? WHERE id = ?').run(now, chairId);

  if (kind === 'telemetry') {
    const fix = msg.fix === true && Number.isFinite(msg.lat) && Number.isFinite(msg.lng);
    const batt = Number.isFinite(msg.batt) ? msg.batt : null;
    let outside = chair.outside_fence;
    if (fix && chair.geofence_id !== null) {
      const fence = getGeofence(db, chair.geofence_id);
      if (fence) outside = pointInPolygon([msg.lat, msg.lng], JSON.parse(fence.polygon) as LatLng[]) ? 0 : 1;
    }
    if (msg.fence === 'outside') outside = 1;

    db.prepare(
      `UPDATE chairs SET lock_state = ?, gps_fix = ?, batt = ?, outside_fence = ?,
         lat = CASE WHEN ? THEN ? ELSE lat END, lng = CASE WHEN ? THEN ? ELSE lng END
       WHERE id = ?`,
    ).run(msg.lock ?? null, fix ? 1 : 0, batt, outside, fix ? 1 : 0, msg.lat ?? null, fix ? 1 : 0, msg.lng ?? null, chairId);
    db.prepare(
      'INSERT INTO telemetry (chair_id, ts, lat, lng, fix, sats, lock, batt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(chairId, now, fix ? msg.lat : null, fix ? msg.lng : null, fix ? 1 : 0, msg.sats ?? null, msg.lock ?? null, batt);
    return;
  }

  if (kind === 'event') {
    const type = String(msg.type ?? 'unknown');
    addEvent(db, chairId, type, msg);
    if (type === 'geofence_exit') {
      db.prepare('UPDATE chairs SET outside_fence = 1 WHERE id = ?').run(chairId);
      console.warn(`[alert] ${chairId} left the geofence`);
    } else if (type === 'geofence_return') {
      db.prepare('UPDATE chairs SET outside_fence = 0 WHERE id = ?').run(chairId);
    } else if (type === 'boot') {
      // The chair always boots locked. If it rebooted mid-ride, unlock it again.
      const ride = getActiveRide(db, chairId);
      if (ride) {
        console.warn(`[devices] ${chairId} rebooted during ride ${ride.id}; re-sending unlock`);
        void bus.command(chairId, 'unlock', ride.id, ACK_TIMEOUT_MS);
      }
      // Make sure it has the current geofence even if the retained message was lost.
      if (chair.geofence_id !== null) {
        const fence = getGeofence(db, chair.geofence_id);
        if (fence) bus.publishGeofence(chairId, JSON.parse(fence.polygon));
      }
    }
  }
}
