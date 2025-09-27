import { logger } from '@vitrinealu/shared/logger';

import { env } from './config.js';
import { createServer } from './server.js';
import './lib/queue.js'; // Re-enabled
// import './webhooks/background.js';

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection', reason);
  // Don't exit the process, just log the error
});

const start = async () => {
  const app = createServer();
  const port = Number(process.env.PORT ?? 4000); // Use 4000
  const host = process.env.HOST ?? '127.0.0.1'; // Use 127.0.0.1 instead of 0.0.0.0 for Windows

  try {
    const address = await app.listen({ port, host });
    console.log(`Worker server started on ${host}:${port}, listening at ${address}`);
    
    // Test the server is actually working
    app.get('/test', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });
    
    console.log('Server setup complete');
  } catch (error) {
    console.error('Failed to start worker server', error);
    process.exit(1);
  }
};

void start();
