// What riders use: the page behind the QR code and the rides API.
import type { FastifyInstance } from 'fastify';

import { getChair, getRide, type Db } from '../db.ts';
import type { ChairBus } from '../mqtt.ts';
import { endRide, isOnline, startRide, HttpError } from '../rides.ts';
import { normalizeName, normalizePhone } from '../validate.ts';

export async function publicRoutes(app: FastifyInstance, { db, bus }: { db: Db; bus: ChairBus }) {
  app.get('/', (_req, reply) => reply.sendFile('index.html'));
  // The QR code on each chair points here.
  app.get('/w/:chairId', (_req, reply) => reply.sendFile('ride.html'));

  app.get<{ Params: { id: string } }>('/api/chairs/:id', async (req) => {
    const chair = getChair(db, req.params.id.toUpperCase());
    if (!chair) throw new HttpError(404, 'Wheelchair not found');
    return {
      id: chair.id,
      label: chair.label,
      available: chair.status === 'available' && isOnline(chair),
      status: chair.status,
      online: isOnline(chair),
    };
  });

  app.post<{ Body: { chairId?: unknown; name?: unknown; phone?: unknown } }>(
    '/api/rides',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = req.body ?? {};
      const chairId = typeof body.chairId === 'string' ? body.chairId.toUpperCase() : '';
      const name = normalizeName(body.name);
      const phone = normalizePhone(body.phone);
      if (!name) throw new HttpError(400, 'Please enter your name');
      if (!phone) throw new HttpError(400, 'Please enter a valid 10-digit mobile number');

      const ride = await startRide(db, bus, chairId, name, phone);
      reply.code(201);
      return { rideId: ride.id, chairId: ride.chair_id, startedAt: ride.started_at };
    },
  );

  // The ride ID is a random UUID only the rider's phone knows, so it doubles as
  // the permission to see and end the ride.
  app.get<{ Params: { id: string } }>('/api/rides/:id', async (req) => {
    const ride = getRide(db, req.params.id);
    if (!ride) throw new HttpError(404, 'Ride not found');
    return { rideId: ride.id, chairId: ride.chair_id, status: ride.status, startedAt: ride.started_at, endedAt: ride.ended_at };
  });

  app.post<{ Params: { id: string } }>(
    '/api/rides/:id/end',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const ride = await endRide(db, bus, req.params.id, 'rider');
      return { rideId: ride.id, status: ride.status, endedAt: ride.ended_at };
    },
  );
}
