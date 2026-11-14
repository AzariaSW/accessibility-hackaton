import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
export function apiSecretDigest(secret) {
  return createHmac('sha256', env.API_KEY_PEPPER).update(secret).digest('hex');
}
export function safeEqualHex(a, b) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
