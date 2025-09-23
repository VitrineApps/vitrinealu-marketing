import pino from 'pino';

// Create main logger
export const logger = pino({
  name: 'video-api',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});

// Export default logger
export default logger;