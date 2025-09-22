import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();

export const createId = (prefix = 'job'): string => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

export const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    return null;
  }
};
