// All settings come from environment variables (or server/.env — see .env.example).
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? 'data/sanchari.db',
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  mqttUsername: process.env.MQTT_USERNAME || undefined,
  mqttPassword: process.env.MQTT_PASSWORD || undefined,
  // Protects /api/admin/*. Admin is disabled when unset.
  adminToken: process.env.ADMIN_TOKEN || undefined,
  // Base URL printed into QR codes, e.g. https://sanchari.example.com.
  // Falls back to the host the admin page was opened on.
  publicUrl: process.env.PUBLIC_URL || undefined,
};

export const ACK_TIMEOUT_MS = 5000;
// A chair counts as offline if nothing was heard from it for this long
// (telemetry arrives every 30 s when idle).
export const ONLINE_WINDOW_MS = 90_000;
