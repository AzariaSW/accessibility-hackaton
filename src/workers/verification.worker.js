import amqp from 'amqplib';
import { env } from '../config/env.js';
import { db } from '../db/database.js';
import { logger } from '../config/logger.js';
import { identityProvider } from '../services/identity-provider.js';

const QUEUE = 'identity.verification';
const connection = await amqp.connect(env.RABBITMQ_URL);
const channel = await connection.createChannel();
await channel.assertExchange('identity.dlx', 'direct', { durable: true });
await channel.assertQueue('identity.verification.dead', { durable: true });
await channel.bindQueue('identity.verification.dead', 'identity.dlx', QUEUE);
await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-queue-type': 'quorum', 'x-dead-letter-exchange': 'identity.dlx', 'x-dead-letter-routing-key': QUEUE } });
channel.prefetch(5);
logger.info('Verification worker listening');
channel.consume(QUEUE, async msg => {
  if (!msg) return;
  let job;
  try {
    job = JSON.parse(msg.content.toString());
    const result = await identityProvider.verify({ registrationId: job.registrationId });
    const now = new Date().toISOString();
    db.prepare('UPDATE identity_verifications SET status=?,provider_reference=?,completed_at=? WHERE id=?')
      .run(result.status, result.providerReference, now, job.verificationId);
    db.prepare("UPDATE registrations SET status='manual_review',updated_at=? WHERE id=?")
      .run(now, job.registrationId);
    logger.info({ jobId: job.jobId, result: result.status }, 'Mock verification job processed');
    channel.ack(msg);
  } catch (err) {
    logger.error({ err, jobId: job?.jobId }, 'Verification job failed');
    // Park failed jobs for inspection instead of creating an infinite retry loop.
    channel.nack(msg, false, false);
  }
});
const stop = async () => { await channel.close(); await connection.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
