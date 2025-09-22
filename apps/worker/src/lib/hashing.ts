import crypto from 'node:crypto';

export const computeSha256 = (buffer: Buffer): string => {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
};
