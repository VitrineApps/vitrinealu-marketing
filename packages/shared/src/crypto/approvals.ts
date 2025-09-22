import crypto from 'node:crypto';

export interface ApprovalPayload {
  postId: string;
  action: 'approve' | 'reject';
  exp?: number;
}

export function sign(payload: ApprovalPayload, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

export function verify(token: string, payload: ApprovalPayload, secret: string): boolean {
  const expected = sign(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}

export function buildApproveUrl(postId: string, action: 'approve' | 'reject', baseUrl: string, secret: string, ttlMinutes: number = 10080): string {
  const payload: ApprovalPayload = {
    postId,
    action,
    exp: Date.now() + ttlMinutes * 60 * 1000
  };
  const token = sign(payload, secret);
  const params = new URLSearchParams({
    token,
    payload: JSON.stringify(payload)
  });
  return `${baseUrl}?${params.toString()}`;
}