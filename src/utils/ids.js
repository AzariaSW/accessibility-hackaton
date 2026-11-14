import { randomBytes, randomUUID } from 'node:crypto';
export const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`;
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
