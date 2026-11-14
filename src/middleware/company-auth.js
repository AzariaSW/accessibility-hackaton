import { db } from '../db/database.js';
import { apiSecretDigest, safeEqualHex } from '../utils/crypto.js';

export function requireCompany(req, res, next) {
  const raw = req.get('x-api-key');
  if (!raw) return res.status(401).json({ error: { code: 'API_KEY_REQUIRED', message: 'Company API key required' } });
  const [credentialId, secret, extra] = raw.split('.');
  if (!credentialId || !secret || extra) return res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
  const row = db.prepare(`SELECT c.id AS company_id, c.status, k.secret_hash
    FROM api_credentials k JOIN companies c ON c.id = k.company_id
    WHERE k.id = ? AND k.revoked_at IS NULL`).get(credentialId);
  const digest = apiSecretDigest(secret);
  if (!row || row.status !== 'active' || !safeEqualHex(row.secret_hash, digest)) {
    return res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
  }
  req.company = { id: row.company_id };
  next();
}
