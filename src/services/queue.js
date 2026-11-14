import amqp from 'amqplib';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const VERIFICATION_QUEUE = 'identity.verification';
let connection;
let channel;
export async function connectQueue() {
  connection = await amqp.connect(env.RABBITMQ_URL);
  connection.on('error', (err) => logger.error({ err }, 'RabbitMQ connection error'));
  channel = await connection.createConfirmChannel();
  await channel.assertExchange('identity.dlx', 'direct', { durable: true });
  await channel.assertQueue('identity.verification.dead', { durable: true });
  await channel.bindQueue('identity.verification.dead', 'identity.dlx', VERIFICATION_QUEUE);
  await channel.assertQueue(VERIFICATION_QUEUE, { durable: true, arguments: { 'x-queue-type': 'quorum', 'x-dead-letter-exchange': 'identity.dlx', 'x-dead-letter-routing-key': VERIFICATION_QUEUE } });
  return channel;
}
export async function publishVerification(payload) {
  if (!channel) throw new Error('RabbitMQ is not connected');
  channel.sendToQueue(VERIFICATION_QUEUE, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: 'application/json',
    messageId: payload.jobId,
    timestamp: Date.now()
  });
  await channel.waitForConfirms();
}
export async function closeQueue() {
  await channel?.close();
  await connection?.close();
}
