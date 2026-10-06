import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getChair, getRide } from '../src/db.ts';
import { addOnlineChair, auth, setup } from './helpers.ts';

const rider = { chairId: 'SAN-0001', name: 'Asha', phone: '+91 98765 43210' };

test('a rider unlocks a chair and ends the ride', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);

  const start = await app.inject({ method: 'POST', url: '/api/rides', payload: rider });
  assert.equal(start.statusCode, 201, start.body);
  const { rideId } = start.json();
  assert.deepEqual(bus.commands.at(-1), { chairId: 'SAN-0001', action: 'unlock', rideId });
  assert.equal(getRide(db, rideId)?.phone, '9876543210');
  assert.equal(getChair(db, 'SAN-0001')?.status, 'in_use');

  const status = await app.inject({ method: 'GET', url: `/api/rides/${rideId}` });
  assert.equal(status.json().status, 'active');
  assert.equal(status.json().phone, undefined, 'phone number must not be exposed');

  const end = await app.inject({ method: 'POST', url: `/api/rides/${rideId}/end` });
  assert.equal(end.statusCode, 200, end.body);
  assert.equal(bus.commands.at(-1)?.action, 'lock');
  assert.equal(getChair(db, 'SAN-0001')?.status, 'available');
  assert.equal(getRide(db, rideId)?.status, 'ended');
});

test('a chair in use cannot be rented twice', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  await app.inject({ method: 'POST', url: '/api/rides', payload: rider });
  const second = await app.inject({ method: 'POST', url: '/api/rides', payload: { ...rider, phone: '9123456789' } });
  assert.equal(second.statusCode, 409);
});

test('invalid details are rejected before touching the chair', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  for (const payload of [
    { ...rider, phone: '12345' },
    { ...rider, phone: '5876543210' },
    { ...rider, name: '   ' },
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/rides', payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(bus.commands.length, 0);
});

test('offline and unknown chairs cannot be rented', async () => {
  const { app, db } = await setup();
  db.prepare('INSERT INTO chairs (id) VALUES (?)').run('SAN-0001'); // never connected
  assert.equal((await app.inject({ method: 'POST', url: '/api/rides', payload: rider })).statusCode, 503);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/rides', payload: { ...rider, chairId: 'NOPE-1' } })).statusCode,
    404,
  );
});

test('if the chair does not ack, the ride fails and the chair is freed', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  bus.respond = false;
  const res = await app.inject({ method: 'POST', url: '/api/rides', payload: rider });
  assert.equal(res.statusCode, 504);
  assert.equal(getChair(db, 'SAN-0001')?.status, 'available');
  assert.deepEqual(bus.commands.map((c) => c.action), ['unlock', 'lock']);
});

test('a rider cannot end the ride if the lock is not confirmed, but staff can force it', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  const { rideId } = (await app.inject({ method: 'POST', url: '/api/rides', payload: rider })).json();
  bus.respond = false;

  const riderEnd = await app.inject({ method: 'POST', url: `/api/rides/${rideId}/end` });
  assert.equal(riderEnd.statusCode, 504);
  assert.equal(getRide(db, rideId)?.status, 'active');

  const staffEnd = await app.inject({ method: 'POST', url: `/api/admin/rides/${rideId}/end`, headers: auth });
  assert.equal(staffEnd.statusCode, 200, staffEnd.body);
  assert.equal(getRide(db, rideId)?.status, 'ended');
  assert.equal(getChair(db, 'SAN-0001')?.status, 'maintenance');
});

test('one phone number is limited to 5 rides per 10 minutes', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  for (let i = 0; i < 5; i++) {
    const { rideId } = (await app.inject({ method: 'POST', url: '/api/rides', payload: rider })).json();
    await app.inject({ method: 'POST', url: `/api/rides/${rideId}/end` });
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/rides', payload: rider })).statusCode, 429);
});

test('a chair that reboots mid-ride is unlocked again', async () => {
  const { app, db, bus } = await setup();
  addOnlineChair(db, bus);
  const { rideId } = (await app.inject({ method: 'POST', url: '/api/rides', payload: rider })).json();
  bus.commands.length = 0;
  bus.emit('SAN-0001', 'event', { type: 'boot' });
  assert.deepEqual(bus.commands, [{ chairId: 'SAN-0001', action: 'unlock', rideId }]);
});
