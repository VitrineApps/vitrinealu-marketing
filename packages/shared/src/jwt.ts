import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  role: string;
  exp: number;
}

export interface JWTConfig {
  secret: Secret;
  expiresIn: string;
}

export const createJWT = (payload: Omit<JWTPayload, 'exp'>, secret: string): string => {
  const payloadWithExp = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  return jwt.sign(payloadWithExp, secret);
};

export const verifyJWT = (token: string, secret: string): JWTPayload => {
  return jwt.verify(token, secret) as JWTPayload;
};