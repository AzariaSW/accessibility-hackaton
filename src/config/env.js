import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default('./data/app.sqlite'),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  REGISTRATION_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).default(86400),
  API_KEY_PEPPER: z.string().min(32),
  REGISTRATION_TOKEN_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
