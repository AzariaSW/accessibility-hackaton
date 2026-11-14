import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env.js';

const file = resolve(env.DATABASE_PATH);
mkdirSync(dirname(file), { recursive: true });
export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  secret_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Default key',
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_credentials_company ON api_credentials(company_id);
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','verification_pending','verified','rejected','manual_review','expired','completed')),
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registrations_tenant ON registrations(company_id, created_at);
CREATE TABLE IF NOT EXISTS registration_steps (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  saved_at TEXT NOT NULL,
  UNIQUE(registration_id, step_key)
);
CREATE TABLE IF NOT EXISTS identity_verifications (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  registration_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);
