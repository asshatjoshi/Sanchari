// Staff/admin API, protected by ADMIN_TOKEN (sent as "Authorization: Bearer <token>").
import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';

import { ACK_TIMEOUT_MS } from '../config.ts';
import { addEvent, getActiveRide, getChair, getGeofence, type Db, type GeofenceRow } from '../db.ts';
import { parsePolygon } from '../geo.ts';
import type { Action, ChairBus } from '../mqtt.ts';
import { endRide, HttpError, isOnline } from '../rides.ts';
import { CHAIR_ID_RE } from '../validate.ts';

interface Options {
  db: Db;
  bus: ChairBus;
  adminToken?: string;
  publicUrl?: string;
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function adminRoutes(app: FastifyInstance, { db, bus, adminToken, publicUrl }: Options) {
  app.get('/admin', (_req, reply) => reply.sendFile('admin.html'));

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/admin/')) return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!adminToken || !tokenMatches(token, adminToken)) throw new HttpError(401, 'Unauthorized');
  });

  const publishFence = (chairId: string, fence: GeofenceRow | undefined) =>
    bus.publishGeofence(chairId, fence ? JSON.parse(fence.polygon) : null);

  // ---- Chairs ----
  app.get('/api/admin/chairs', async () => {
    const chairs = db.prepare('SELECT * FROM chairs ORDER BY id').all() as any[];
    return chairs.map((c) => {
      const ride = getActiveRide(db, c.id);
      return {
        ...c,
        online: isOnline(c),
        outside_fence: !!c.outside_fence,
        gps_fix: !!c.gps_fix,
        ride: ride && { id: ride.id, name: ride.name, phone: ride.phone, startedAt: ride.started_at },
      };
    });
  });

  // Create or update a chair.
  app.put<{ Params: { id: string }; Body: { label?: string; geofenceId?: number | null; status?: string } }>(
    '/api/admin/chairs/:id',
    async (req) => {
      const id = req.params.id.toUpperCase();
      if (!CHAIR_ID_RE.test(id)) throw new HttpError(400, 'Chair ID must be 3-32 letters, digits or dashes');
      const body = req.body ?? {};
      if (body.status !== undefined && !['available', 'maintenance'].includes(body.status)) {
        throw new HttpError(400, 'Status can only be set to available or maintenance');
      }
      if (body.geofenceId != null && !getGeofence(db, body.geofenceId)) {
        throw new HttpError(400, 'Unknown geofence');
      }

      const existing = getChair(db, id);
      if (!existing) db.prepare('INSERT INTO chairs (id) VALUES (?)').run(id);
      if (body.status !== undefined && existing?.status === 'in_use') {
        throw new HttpError(409, 'End the active ride first');
      }
      if (body.label !== undefined) db.prepare('UPDATE chairs SET label = ? WHERE id = ?').run(body.label || null, id);
      if (body.status !== undefined) db.prepare('UPDATE chairs SET status = ? WHERE id = ?').run(body.status, id);
      if (body.geofenceId !== undefined) {
        db.prepare('UPDATE chairs SET geofence_id = ?, outside_fence = 0 WHERE id = ?').run(body.geofenceId, id);
        publishFence(id, body.geofenceId === null ? undefined : getGeofence(db, body.geofenceId));
      }
      return getChair(db, id);
    },
  );

  // Manual lock/unlock, for bench testing and for helping a rider (e.g. after
  // the geofence locked the chair).
  app.post<{ Params: { id: string; action: string } }>('/api/admin/chairs/:id/:action', async (req) => {
    const { id, action } = req.params;
    if (action !== 'lock' && action !== 'unlock') throw new HttpError(404, 'Not found');
    if (!getChair(db, id)) throw new HttpError(404, 'Wheelchair not found');
    const rideId = getActiveRide(db, id)?.id ?? 'admin';
    const ack = await bus.command(id, action as Action, rideId, ACK_TIMEOUT_MS);
    addEvent(db, id, `admin_${action}`, { ok: !!ack?.ok });
    if (!ack?.ok) throw new HttpError(504, 'The chair did not respond');
    return ack;
  });

  app.get<{ Params: { id: string } }>('/api/admin/chairs/:id/qr.svg', async (req, reply) => {
    const chair = getChair(db, req.params.id);
    if (!chair) throw new HttpError(404, 'Wheelchair not found');
    const base = publicUrl ?? `${req.protocol}://${req.host}`;
    const svg = await QRCode.toString(`${base}/w/${chair.id}`, { type: 'svg', margin: 2, width: 512 });
    reply.type('image/svg+xml');
    return svg;
  });

  // ---- Rides ----
  app.post<{ Params: { id: string } }>('/api/admin/rides/:id/end', async (req) => {
    return endRide(db, bus, req.params.id, 'staff', true);
  });

  app.get<{ Querystring: { limit?: string } }>('/api/admin/rides', async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    return db.prepare('SELECT * FROM rides ORDER BY created_at DESC LIMIT ?').all(limit);
  });

  // ---- Geofences ----
  app.get('/api/admin/geofences', async () => {
    return (db.prepare('SELECT * FROM geofences ORDER BY id').all() as unknown as GeofenceRow[]).map((g) => ({
      ...g,
      polygon: JSON.parse(g.polygon),
    }));
  });

  const parseFenceBody = (req: FastifyRequest<{ Body: { name?: string; polygon?: unknown } }>) => {
    const name = req.body?.name?.trim();
    if (!name) throw new HttpError(400, 'Give the geofence a name');
    try {
      return { name, polygon: parsePolygon(req.body.polygon) };
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  };

  app.post<{ Body: { name?: string; polygon?: unknown } }>('/api/admin/geofences', async (req, reply) => {
    const { name, polygon } = parseFenceBody(req);
    const res = db.prepare('INSERT INTO geofences (name, polygon) VALUES (?, ?)').run(name, JSON.stringify(polygon));
    reply.code(201);
    return { id: Number(res.lastInsertRowid), name, polygon };
  });

  app.put<{ Params: { id: string }; Body: { name?: string; polygon?: unknown } }>(
    '/api/admin/geofences/:id',
    async (req) => {
      const id = Number(req.params.id);
      if (!getGeofence(db, id)) throw new HttpError(404, 'Geofence not found');
      const { name, polygon } = parseFenceBody(req);
      db.prepare('UPDATE geofences SET name = ?, polygon = ? WHERE id = ?').run(name, JSON.stringify(polygon), id);
      const fence = getGeofence(db, id);
      const chairs = db.prepare('SELECT id FROM chairs WHERE geofence_id = ?').all(id) as { id: string }[];
      for (const c of chairs) publishFence(c.id, fence);
      return { id, name, polygon };
    },
  );

  // ---- Events ----
  app.get<{ Querystring: { limit?: string } }>('/api/admin/events', async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
  });
}
