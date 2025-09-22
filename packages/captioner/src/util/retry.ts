import pRetry, { AbortError } from 'p-retry';
export const withRetry = <T>(fn:()=>Promise<T>) =>
  pRetry(fn, { retries: 3, factor: 2, minTimeout: 400, maxTimeout: 2500, onFailedAttempt: e => { /* noop logging hook */ }});
export { AbortError };