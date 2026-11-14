import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { redis } from './services/redis.js';
import { connectQueue, closeQueue } from './services/queue.js';

let server;
async function start() {
  await redis.connect();
  await redis.ping();
  await connectQueue();
  server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));
}
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server?.close();
  await Promise.allSettled([redis.quit(), closeQueue()]);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
start().catch(err => { logger.fatal({ err }, 'Startup failed'); process.exit(1); });
