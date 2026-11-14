import { createHash } from 'node:crypto';
import { redis } from '../services/redis.js';
export async function requireRegistration(req, res, next) {
  try {
    const token = req.get('x-registration-token');
    if (!token) return res.status(401).json({ error: { code: 'REGISTRATION_TOKEN_REQUIRED', message: 'Registration token required' } });
    const digest = createHash('sha256').update(token).digest('hex');
    const raw = await redis.get(`registration:token:${digest}`);
    if (!raw) return res.status(401).json({ error: { code: 'REGISTRATION_SESSION_EXPIRED', message: 'Registration session is invalid or expired' } });
    req.registrationSession = JSON.parse(raw);
    next();
  } catch (err) { next(err); }
}
