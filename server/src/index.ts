import { buildApp } from './app.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { createMqttBus } from './mqtt.ts';

const db = openDb(config.dbPath);
const bus = createMqttBus(config.mqttUrl, config.mqttUsername, config.mqttPassword);
const app = await buildApp({
  db,
  bus,
  adminToken: config.adminToken,
  publicUrl: config.publicUrl,
  logger: true,
});

if (!config.adminToken) app.log.warn('ADMIN_TOKEN is not set: the admin page is disabled');

await app.listen({ port: config.port, host: config.host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await bus.close();
    db.close();
    process.exit(0);
  });
}
