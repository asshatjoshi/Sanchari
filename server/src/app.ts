import { fileURLToPath } from 'node:url';

import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

import type { Db } from './db.ts';
import { attachDeviceHandlers } from './devices.ts';
import type { ChairBus } from './mqtt.ts';
import { adminRoutes } from './routes/admin.ts';
import { publicRoutes } from './routes/public.ts';

export interface AppOptions {
  db: Db;
  bus: ChairBus;
  adminToken?: string;
  publicUrl?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions) {
  // trustProxy: hosts like Render/Railway sit behind a proxy; needed for the
  // real client IP (rate limiting) and https:// in QR links.
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });

  // Errors with a `status` (HttpError) go back to the client as {error: message}.
  app.setErrorHandler((err: any, _req, reply) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500 && status !== 503 && status !== 504) app.log.error(err);
    reply.code(status).send({ error: status === 500 ? 'Something went wrong' : err.message });
  });

  await app.register(rateLimit, { global: false });
  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../public', import.meta.url)),
    index: false,
  });

  attachDeviceHandlers(opts.db, opts.bus);
  await app.register(publicRoutes, { db: opts.db, bus: opts.bus });
  await app.register(adminRoutes, opts);
  return app;
}
