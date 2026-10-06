import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePolygon, pointInPolygon } from '../src/geo.ts';
import { normalizePhone } from '../src/validate.ts';

test('normalizePhone accepts common Indian formats', () => {
  for (const input of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '98765-43210']) {
    assert.equal(normalizePhone(input), '9876543210', input);
  }
  for (const input of ['5876543210', '987654321', '98765432101', 'abc', '', undefined]) {
    assert.equal(normalizePhone(input), null, String(input));
  }
});

test('pointInPolygon matches the firmware for a concave shape', () => {
  const l: [number, number][] = [[0, 0], [0, 10], [5, 10], [5, 5], [10, 5], [10, 0]];
  assert.equal(pointInPolygon([2, 2], l), true);
  assert.equal(pointInPolygon([8, 2], l), true);
  assert.equal(pointInPolygon([8, 8], l), false);
});

test('parsePolygon rejects bad input with a readable message', () => {
  assert.throws(() => parsePolygon('nope'), /Expected/);
  assert.throws(() => parsePolygon([[0, 0], [1, 1]]), /at least 3/);
  assert.throws(() => parsePolygon([[0, 0], [1, 1], [100, 0]]), /out of range/);
});
