import { createHmac, timingSafeEqual } from 'node:crypto';

const DEV_FALLBACK_SECRET = 'obpc-mogi-dev-only-insecure-secret';
const COOKIE_NAME = 'admin_session';
const SESSION_DAYS = 7;

export type SessionPayload = {
  email: string;
  exp: number;
};

function getSecret(): string {
  const secret = import.meta.env.SESSION_SECRET as string | undefined;
  if (!secret) {
    console.warn(
      '[session] SESSION_SECRET não definido no .env — usando secret de desenvolvimento. Nunca use isso em produção.',
    );
    return DEV_FALLBACK_SECRET;
  }
  return secret;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

/** Assina um payload JSON em formato "payload.assinatura" (base64url). */
export function signSession(payload: object): string {
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/** Valida assinatura/expiração e retorna o payload, ou null se inválido. */
export function verifySession(token: string): SessionPayload | null {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as SessionPayload;
    if (!payload?.email || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionPayload(email: string): SessionPayload {
  return {
    email,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export { COOKIE_NAME };
