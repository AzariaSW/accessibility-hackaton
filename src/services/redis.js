import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
