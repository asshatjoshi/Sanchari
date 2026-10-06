import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Times are stored as milliseconds since the epoch.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS geofences (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  polygon TEXT NOT NULL            -- JSON [[lat, lng], ...]
);

CREATE TABLE IF NOT EXISTS chairs (
  id            TEXT PRIMARY KEY,  -- e.g. SAN-0001, printed on the QR code
  label         TEXT,
  geofence_id   INTEGER REFERENCES geofences(id),
  status        TEXT NOT NULL DEFAULT 'available',  -- available | in_use | maintenance
  online        INTEGER NOT NULL DEFAULT 0,
  last_seen     INTEGER,
  lock_state    TEXT,
  lat           REAL,
  lng           REAL,
  gps_fix       INTEGER NOT NULL DEFAULT 0,
  batt          REAL,
  outside_fence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rides (
  id         TEXT PRIMARY KEY,     -- random UUID; also what lets the rider end the ride
  chair_id   TEXT NOT NULL REFERENCES chairs(id),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  status     TEXT NOT NULL,        -- pending | active | ended | failed
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at   INTEGER,
  ended_by   TEXT                  -- rider | staff
);
CREATE INDEX IF NOT EXISTS rides_chair_status ON rides(chair_id, status);
CREATE INDEX IF NOT EXISTS rides_phone_created ON rides(phone, created_at);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY,
  chair_id TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  type     TEXT NOT NULL,
  data     TEXT
);

CREATE TABLE IF NOT EXISTS telemetry (
  id       INTEGER PRIMARY KEY,
  chair_id TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  lat      REAL,
  lng      REAL,
  fix      INTEGER NOT NULL,
  sats     INTEGER,
  lock     TEXT,
  batt     REAL
);
CREATE INDEX IF NOT EXISTS telemetry_chair_ts ON telemetry(chair_id, ts);
`;

export type Db = DatabaseSync;

export interface ChairRow {
  id: string;
  label: string | null;
  geofence_id: number | null;
  status: 'available' | 'in_use' | 'maintenance';
  online: number;
  last_seen: number | null;
  lock_state: string | null;
  lat: number | null;
  lng: number | null;
  gps_fix: number;
  batt: number | null;
  outside_fence: number;
}

export interface RideRow {
  id: string;
  chair_id: string;
  name: string;
  phone: string;
  status: 'pending' | 'active' | 'ended' | 'failed';
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  ended_by: string | null;
}

export interface GeofenceRow {
  id: number;
  name: string;
  polygon: string;
}

// Pass ':memory:' for tests.
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function getChair(db: Db, id: string): ChairRow | undefined {
  return db.prepare('SELECT * FROM chairs WHERE id = ?').get(id) as ChairRow | undefined;
}

export function getRide(db: Db, id: string): RideRow | undefined {
  return db.prepare('SELECT * FROM rides WHERE id = ?').get(id) as RideRow | undefined;
}

export function getActiveRide(db: Db, chairId: string): RideRow | undefined {
  return db
    .prepare("SELECT * FROM rides WHERE chair_id = ? AND status = 'active'")
    .get(chairId) as RideRow | undefined;
}

export function getGeofence(db: Db, id: number): GeofenceRow | undefined {
  return db.prepare('SELECT * FROM geofences WHERE id = ?').get(id) as GeofenceRow | undefined;
}

export function addEvent(db: Db, chairId: string, type: string, data?: unknown): void {
  db.prepare('INSERT INTO events (chair_id, ts, type, data) VALUES (?, ?, ?, ?)').run(
    chairId,
    Date.now(),
    type,
    data === undefined ? null : JSON.stringify(data),
  );
}
