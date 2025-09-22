import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
export declare const createScopedLogger: (scope: string) => pino.Logger<never, boolean>;
