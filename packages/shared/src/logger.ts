import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  timestamp: pino.stdTimeFunctions.isoTime
});

export const createScopedLogger = (scope: string) => logger.child({ scope });
