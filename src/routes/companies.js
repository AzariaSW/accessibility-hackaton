import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { id, randomToken } from '../utils/ids.js';
import { apiSecretDigest } from '../utils/crypto.js';
import { requireCompany } from '../middleware/company-auth.js';

const router = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform(v => v.toLowerCase())
});
router.post('/register', (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const companyId = id('co');
    const credentialId = id('key');
    const secret = randomToken(32);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO companies (id,name,email,created_at) VALUES (?,?,?,?)').run(companyId, input.name, input.email, now);
      db.prepare('INSERT INTO api_credentials (id,company_id,secret_hash,created_at) VALUES (?,?,?,?)').run(credentialId, companyId, apiSecretDigest(secret), now);
    });
    tx();
    res.status(201).json({ company: { id: companyId, name: input.name, email: input.email }, apiKey: `${credentialId}.${secret}`, warning: 'Copy this API key now. It will not be shown again.' });
  } catch (err) { next(err); }
});
router.get('/me', requireCompany, (req, res) => {
  const company = db.prepare('SELECT id,name,email,status,created_at FROM companies WHERE id = ?').get(req.company.id);
  res.json({ company });
});
router.post('/credentials/rotate', requireCompany, (req, res) => {
  const credentialId = id('key');
  const secret = randomToken(32);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE api_credentials SET revoked_at = ? WHERE company_id = ? AND revoked_at IS NULL').run(now, req.company.id);
    db.prepare('INSERT INTO api_credentials (id,company_id,secret_hash,label,created_at) VALUES (?,?,?,?,?)').run(credentialId, req.company.id, apiSecretDigest(secret), 'Rotated key', now);
  });
  tx();
  res.status(201).json({ apiKey: `${credentialId}.${secret}`, warning: 'Previous API keys have been revoked. Copy this key now.' });
});
export default router;
