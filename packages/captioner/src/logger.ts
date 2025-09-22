import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['req.headers.authorization','OPENAI_API_KEY','GEMINI_API_KEY'], remove: true },
});
export default logger;