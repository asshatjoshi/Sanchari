import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getChair } from '../src/db.ts';
import { auth, setup } from './helpers.ts';

// A square around a point in Bengaluru, as GeoJSON ([lng, lat], closed ring).
const geojson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[77.5936, 12.9706], [77.5956, 12.9706], [77.5956, 12.9726], [77.5936, 12.9726], [77.5936, 12.9706]]],
    },
  }],
};

test('admin API requires the token', async () => {
  const { app } = await setup();
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/chairs' })).statusCode, 401);
  const wrong = await app.inject({ method: 'GET', url: '/api/admin/chairs', headers: { authorization: 'Bearer nope' } });
  assert.equal(wrong.statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/chairs', headers: auth })).statusCode, 200);
});

test('geofence from GeoJSON is stored as [lat, lng] and pushed to its chairs', async () => {
  const { app, bus } = await setup();
  const fence = await app.inject({ method: 'POST', url: '/api/admin/geofences', headers: auth, payload: { name: 'Mall', polygon: geojson } });
  assert.equal(fence.statusCode, 201, fence.body);
  const { id, polygon } = fence.json();
  assert.equal(polygon.length, 4, 'closing point dropped');
  assert.deepEqual(polygon[0], [12.9706, 77.5936]);

  const chair = await app.inject({ method: 'PUT', url: '/api/admin/chairs/san-0001', headers: auth, payload: { geofenceId: id } });
  assert.equal(chair.statusCode, 200, chair.body);
  assert.deepEqual(bus.fences.at(-1), { chairId: 'SAN-0001', polygon });

  const bad = await app.inject({ method: 'POST', url: '/api/admin/geofences', headers: auth, payload: { name: 'x', polygon: [[1, 2]] } });
  assert.equal(bad.statusCode, 400);
});

test('telemetry outside the fence flags the chair; events are recorded', async () => {
  const { app, db, bus } = await setup();
  const { id } = (await app.inject({ method: 'POST', url: '/api/admin/geofences', headers: auth, payload: { name: 'Mall', polygon: geojson } })).json();
  await app.inject({ method: 'PUT', url: '/api/admin/chairs/SAN-0001', headers: auth, payload: { geofenceId: id } });

  bus.emit('SAN-0001', 'telemetry', { fix: true, lat: 12.9716, lng: 77.5946, lock: 'locked', batt: 12.3 });
  assert.equal(getChair(db, 'SAN-0001')?.outside_fence, 0);
  assert.equal(getChair(db, 'SAN-0001')?.online, 1);

  bus.emit('SAN-0001', 'telemetry', { fix: true, lat: 12.98, lng: 77.5946, lock: 'locked' });
  assert.equal(getChair(db, 'SAN-0001')?.outside_fence, 1);

  bus.emit('SAN-0001', 'telemetry', { fix: false, lock: 'locked' });
  assert.equal(getChair(db, 'SAN-0001')?.lat, 12.98, 'last known position kept without a fix');

  bus.emit('SAN-0001', 'event', { type: 'geofence_exit' });
  const events = (await app.inject({ method: 'GET', url: '/api/admin/events', headers: auth })).json();
  assert.equal(events[0].type, 'geofence_exit');
});

test('QR code points at the chair page', async () => {
  const { app, db } = await setup();
  db.prepare('INSERT INTO chairs (id) VALUES (?)').run('SAN-0001');
  const res = await app.inject({ method: 'GET', url: '/api/admin/chairs/SAN-0001/qr.svg', headers: auth });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /svg/);
});
