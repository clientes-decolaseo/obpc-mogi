import type { AstroCookies } from 'astro';
import { COOKIE_NAME, verifySession, type SessionPayload } from './session';

/** Valida o cookie de sessão admin. Lança Response 401 se inválido. */
export function requireAuth(cookies: AstroCookies): SessionPayload {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    throw new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = verifySession(token);
  if (!payload) {
    throw new Response(JSON.stringify({ error: 'Sessão inválida ou expirada' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return payload;
}

export function getSession(cookies: AstroCookies): SessionPayload | null {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
