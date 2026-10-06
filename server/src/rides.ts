import { randomUUID } from 'node:crypto';

import { ACK_TIMEOUT_MS, ONLINE_WINDOW_MS } from './config.ts';
import { addEvent, getChair, getRide, type ChairRow, type Db, type RideRow } from './db.ts';
import type { ChairBus } from './mqtt.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Stops one phone number from grabbing every chair in the mall.
const PHONE_LIMIT = 5;
const PHONE_WINDOW_MS = 10 * 60_000;

export function isOnline(chair: ChairRow, now = Date.now()): boolean {
  return chair.online === 1 && chair.last_seen !== null && now - chair.last_seen < ONLINE_WINDOW_MS;
}

export async function startRide(
  db: Db,
  bus: ChairBus,
  chairId: string,
  name: string,
  phone: string,
): Promise<RideRow> {
  const chair = getChair(db, chairId);
  if (!chair) throw new HttpError(404, 'Wheelchair not found');
  if (chair.status === 'in_use') throw new HttpError(409, 'This wheelchair is already in use');
  if (chair.status === 'maintenance') throw new HttpError(409, 'This wheelchair is out of service');
  if (!isOnline(chair)) throw new HttpError(503, 'This wheelchair is offline right now');

  const recent = db
    .prepare('SELECT COUNT(*) AS n FROM rides WHERE phone = ? AND created_at > ?')
    .get(phone, Date.now() - PHONE_WINDOW_MS) as { n: number };
  if (recent.n >= PHONE_LIMIT) throw new HttpError(429, 'Too many attempts. Please ask mall staff for help.');

  // Claim the chair atomically so two people can't start a ride on it at once.
  const claimed = db
    .prepare("UPDATE chairs SET status = 'in_use' WHERE id = ? AND status = 'available'")
    .run(chairId);
  if (claimed.changes === 0) throw new HttpError(409, 'This wheelchair is already in use');

  const ride: RideRow = {
    id: randomUUID(),
    chair_id: chairId,
    name,
    phone,
    status: 'pending',
    created_at: Date.now(),
    started_at: null,
    ended_at: null,
    ended_by: null,
  };
  db.prepare(
    "INSERT INTO rides (id, chair_id, name, phone, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
  ).run(ride.id, chairId, name, phone, ride.created_at);

  const ack = await bus.command(chairId, 'unlock', ride.id, ACK_TIMEOUT_MS);
  if (!ack?.ok) {
    db.prepare("UPDATE rides SET status = 'failed' WHERE id = ?").run(ride.id);
    db.prepare("UPDATE chairs SET status = 'available' WHERE id = ?").run(chairId);
    // In case the chair did unlock but the ack was lost.
    void bus.command(chairId, 'lock', ride.id, ACK_TIMEOUT_MS);
    addEvent(db, chairId, 'unlock_failed', { rideId: ride.id });
    throw new HttpError(504, "Couldn't unlock the wheelchair. Please try again.");
  }

  const startedAt = Date.now();
  db.prepare("UPDATE rides SET status = 'active', started_at = ? WHERE id = ?").run(startedAt, ride.id);
  addEvent(db, chairId, 'ride_started', { rideId: ride.id });
  return { ...ride, status: 'active', started_at: startedAt };
}

// `force` (staff only) ends the ride even if the chair doesn't confirm it locked;
// the chair is then put into maintenance so nobody else rents it.
export async function endRide(
  db: Db,
  bus: ChairBus,
  rideId: string,
  by: 'rider' | 'staff',
  force = false,
): Promise<RideRow> {
  const ride = getRide(db, rideId);
  if (!ride) throw new HttpError(404, 'Ride not found');
  if (ride.status !== 'active') throw new HttpError(409, 'This ride has already ended');

  const ack = await bus.command(ride.chair_id, 'lock', ride.id, ACK_TIMEOUT_MS);
  const locked = !!ack?.ok;
  if (!locked && !force) {
    throw new HttpError(504, "Couldn't confirm the wheelchair locked. Please try again.");
  }

  const endedAt = Date.now();
  db.prepare("UPDATE rides SET status = 'ended', ended_at = ?, ended_by = ? WHERE id = ?").run(
    endedAt,
    by,
    ride.id,
  );
  db.prepare('UPDATE chairs SET status = ? WHERE id = ?').run(
    locked ? 'available' : 'maintenance',
    ride.chair_id,
  );
  addEvent(db, ride.chair_id, 'ride_ended', { rideId: ride.id, by, locked });
  return { ...ride, status: 'ended', ended_at: endedAt, ended_by: by };
}
