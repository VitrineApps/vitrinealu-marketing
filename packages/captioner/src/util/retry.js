import pRetry, { AbortError } from 'p-retry';
export const withRetry = (fn) => pRetry(fn, { retries: 3, factor: 2, minTimeout: 400, maxTimeout: 2500, onFailedAttempt: e => { } });
export { AbortError };
