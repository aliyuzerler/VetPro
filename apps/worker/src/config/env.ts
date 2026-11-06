import { z } from 'zod';

export const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  /** Redis yapılandırılmazsa worker pasif modda açılır (Faz 01 davranışı). */
  REDIS_URL: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export class WorkerEnvValidationError extends Error {
  constructor(issues: string[]) {
    super(`Geçersiz worker ortam değişkenleri:\n${issues.map((i) => ` - ${i}`).join('\n')}`);
    this.name = 'WorkerEnvValidationError';
  }
}

export function parseWorkerEnv(source: Record<string, string | undefined>): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new WorkerEnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export const WORKER_ENV_TOKEN = Symbol('WORKER_ENV');
