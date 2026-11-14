import { Router } from 'express';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '../db/database.js';
import { redis } from '../services/redis.js';
import { publishVerification } from '../services/queue.js';
import { requireCompany } from '../middleware/company-auth.js';
import { requireRegistration } from '../middleware/registration-auth.js';
import { env } from '../config/env.js';
import { id, randomToken } from '../utils/ids.js';

const router = Router();
const STEP_ORDER = ['personal_information', 'contact_information', 'account_security', 'identity_document', 'review'];
const schemas = {
  personal_information: z.object({ fullName: z.string().trim().min(2).max(160), dateOfBirth: z.iso.date().optional() }).strict(),
  contact_information: z.object({ phoneNumber: z.string().trim().min(7).max(20) }).strict(),
  account_security: z.object({ password: z.string().min(12).max(128) }).strict(),
  identity_document: z.object({ finNumber: z.string().trim().min(4).max(64).optional() }).strict(),
  review: z.object({ confirmed: z.literal(true) }).strict()
};
const tokenDigest = token => createHash('sha256').update(token).digest('hex');

router.post('/', requireCompany, async (req, res, next) => {
  try {
    const registrationId = id('reg');
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + env.REGISTRATION_SESSION_TTL_SECONDS * 1000).toISOString();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO registrations (id,company_id,status,current_step,created_at,updated_at,expires_at) VALUES (?,?,\'in_progress\',1,?,?,?)')
      .run(registrationId, req.company.id, now, now, expiresAt);
    const session = { registrationId, companyId: req.company.id, currentStep: 1, expiresAt };
    await redis.set(`registration:token:${tokenDigest(token)}`, JSON.stringify(session), 'EX', env.REGISTRATION_SESSION_TTL_SECONDS);
    await redis.set(`registration:data:${registrationId}`, JSON.stringify({}), 'EX', env.REGISTRATION_SESSION_TTL_SECONDS);
    res.status(201).json({ registrationId, registrationToken: token, currentStep: STEP_ORDER[0], expiresAt, warning: 'The registration token is shown once. Keep it secure.' });
  } catch (err) { next(err); }
});

router.get('/:registrationId', requireCompany, (req, res) => {
  const row = db.prepare('SELECT id,status,current_step,created_at,updated_at,expires_at FROM registrations WHERE id = ? AND company_id = ?').get(req.params.registrationId, req.company.id);
  if (!row) return res.status(404).json({ error: { code: 'REGISTRATION_NOT_FOUND', message: 'Registration not found' } });
  res.json({ registration: row });
});

router.get('/:registrationId/session', requireRegistration, async (req, res) => {
  if (req.registrationSession.registrationId !== req.params.registrationId) return res.status(403).json({ error: { code: 'SESSION_MISMATCH', message: 'Session does not match registration' } });
  const raw = await redis.get(`registration:data:${req.params.registrationId}`);
  res.json({ registrationId: req.params.registrationId, currentStep: req.registrationSession.currentStep, savedSteps: Object.keys(raw ? JSON.parse(raw) : {}) });
});

router.put('/:registrationId/steps/:step', requireRegistration, async (req, res, next) => {
  try {
    const { registrationId } = req.params;
    const step = req.params.step;
    const session = req.registrationSession;
    if (session.registrationId !== registrationId) return res.status(403).json({ error: { code: 'SESSION_MISMATCH', message: 'Session does not match registration' } });
    if (!schemas[step]) return res.status(404).json({ error: { code: 'UNKNOWN_STEP', message: 'Unknown registration step' } });
    const stepIndex = STEP_ORDER.indexOf(step);
    if (stepIndex + 1 > session.currentStep) return res.status(409).json({ error: { code: 'STEP_OUT_OF_ORDER', message: 'Complete the previous step first' } });
    const input = schemas[step].parse(req.body);
    const dataKey = `registration:data:${registrationId}`;
    const allData = JSON.parse((await redis.get(dataKey)) || '{}');
    if (step === 'account_security') {
      allData[step] = { passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) };
    } else {
      allData[step] = input;
    }
    await redis.set(dataKey, JSON.stringify(allData), 'EX', env.REGISTRATION_SESSION_TTL_SECONDS);
    const nextStep = stepIndex + 2;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO registration_steps (id,registration_id,step_key,status,saved_at) VALUES (?,?,?,'saved',?)
      ON CONFLICT(registration_id,step_key) DO UPDATE SET status='saved', saved_at=excluded.saved_at`).run(id('step'), registrationId, step, now);
    db.prepare('UPDATE registrations SET current_step = ?, updated_at = ? WHERE id = ?').run(nextStep, now, registrationId);
    session.currentStep = nextStep;
    const token = req.get('x-registration-token');
    await redis.set(`registration:token:${tokenDigest(token)}`, JSON.stringify(session), 'EX', env.REGISTRATION_SESSION_TTL_SECONDS);
    res.json({ registrationId, saved: step, nextStep: STEP_ORDER[nextStep - 1] ?? null, complete: step === 'review' });
  } catch (err) { next(err); }
});

router.post('/:registrationId/verify', requireRegistration, async (req, res, next) => {
  try {
    const { registrationId } = req.params;
    if (req.registrationSession.registrationId !== registrationId) return res.status(403).json({ error: { code: 'SESSION_MISMATCH', message: 'Session does not match registration' } });
    const row = db.prepare('SELECT id,status FROM registrations WHERE id = ?').get(registrationId);
    if (!row) return res.status(404).json({ error: { code: 'REGISTRATION_NOT_FOUND', message: 'Registration not found' } });
    const data = JSON.parse((await redis.get(`registration:data:${registrationId}`)) || '{}');
    if (!data.identity_document) return res.status(409).json({ error: { code: 'IDENTITY_STEP_REQUIRED', message: 'Save the identity document step first' } });
    if (!data.review?.confirmed) return res.status(409).json({ error: { code: 'REVIEW_REQUIRED', message: 'Complete the review and confirmation step first' } });
    if (row.status !== 'in_progress') return res.status(409).json({ error: { code: 'INVALID_REGISTRATION_STATE', message: 'This registration cannot be submitted again' } });
    const verificationId = id('ver');
    const jobId = id('job');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO identity_verifications (id,registration_id,provider,status,created_at) VALUES (?,?,\'mock\',\'pending\',?)').run(verificationId, registrationId, now);
    db.prepare("UPDATE registrations SET status='verification_pending',updated_at=? WHERE id=?").run(now, registrationId);
    // Queue only a reference. Do not put identity details, FIN, passwords or images in RabbitMQ.
    await publishVerification({ jobId, verificationId, registrationId });
    res.status(202).json({ verificationId, status: 'pending', message: 'Verification job queued. The configured provider is currently a mock and cannot verify real identities.' });
  } catch (err) { next(err); }
});

export default router;
