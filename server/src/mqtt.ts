// Talks to the chairs over MQTT. Topic layout (see docs/protocol.md):
//   sanchari/chairs/<id>/cmd        server -> chair   {"action","rideId"}
//   sanchari/chairs/<id>/config     server -> chair   {"geofence":[[lat,lng],...]}  (retained)
//   sanchari/chairs/<id>/ack        chair -> server   {"rideId","action","ok","lock"}
//   sanchari/chairs/<id>/telemetry  chair -> server
//   sanchari/chairs/<id>/event      chair -> server   {"type", ...}
//   sanchari/chairs/<id>/status     chair -> server   {"online"}  (retained, last will)
import mqtt from 'mqtt';

import type { LatLng } from './geo.ts';

export type Action = 'unlock' | 'lock';
export type ChairMessageKind = 'ack' | 'telemetry' | 'event' | 'status';

export interface Ack {
  rideId: string;
  action: Action;
  ok: boolean;
  lock: string;
}

export type ChairMessageHandler = (chairId: string, kind: ChairMessageKind, payload: any) => void;

// The rest of the server only sees this interface, so tests can swap in a fake.
export interface ChairBus {
  // Resolves with the chair's ack, or null if none arrived within timeoutMs.
  command(chairId: string, action: Action, rideId: string, timeoutMs: number): Promise<Ack | null>;
  publishGeofence(chairId: string, polygon: LatLng[] | null): void;
  onMessage(handler: ChairMessageHandler): void;
  close(): Promise<void>;
}

const PREFIX = 'sanchari/chairs/';
const KINDS = new Set<string>(['ack', 'telemetry', 'event', 'status']);

export function createMqttBus(url: string, username?: string, password?: string): ChairBus {
  const client = mqtt.connect(url, {
    username,
    password,
    clientId: `sanchari-server-${process.pid}`,
    reconnectPeriod: 2000,
  });
  const handlers: ChairMessageHandler[] = [];
  const pending = new Map<string, (ack: Ack) => void>();
  const key = (chairId: string, action: string, rideId: string) => `${chairId}|${action}|${rideId}`;

  client.on('connect', () => {
    console.log(`[mqtt] connected to ${url}`);
    client.subscribe(`${PREFIX}+/+`, { qos: 1 });
  });
  client.on('error', (err) => console.error('[mqtt]', err.message));

  client.on('message', (topic, buf) => {
    const parts = topic.split('/');
    if (parts.length !== 4 || !KINDS.has(parts[3])) return;
    const [, , chairId, kind] = parts;
    let payload: any;
    try {
      payload = JSON.parse(buf.toString());
    } catch {
      console.warn(`[mqtt] ignoring non-JSON message on ${topic}`);
      return;
    }
    if (kind === 'ack') {
      const k = key(chairId, payload.action, payload.rideId ?? '');
      pending.get(k)?.(payload as Ack);
      pending.delete(k);
    }
    for (const h of handlers) h(chairId, kind as ChairMessageKind, payload);
  });

  return {
    command(chairId, action, rideId, timeoutMs) {
      return new Promise((resolve) => {
        const k = key(chairId, action, rideId);
        const timer = setTimeout(() => {
          pending.delete(k);
          resolve(null);
        }, timeoutMs);
        pending.set(k, (ack) => {
          clearTimeout(timer);
          resolve(ack);
        });
        client.publish(`${PREFIX}${chairId}/cmd`, JSON.stringify({ action, rideId }), { qos: 1 });
      });
    },
    publishGeofence(chairId, polygon) {
      client.publish(`${PREFIX}${chairId}/config`, JSON.stringify({ geofence: polygon ?? [] }), {
        qos: 1,
        retain: true,
      });
    },
    onMessage(handler) {
      handlers.push(handler);
    },
    async close() {
      await client.endAsync();
    },
  };
}
