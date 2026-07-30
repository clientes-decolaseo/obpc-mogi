import type { APIRoute } from 'astro';
import bcrypt from 'bcryptjs';
import {
  COOKIE_NAME,
  createSessionPayload,
  signSession,
} from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = body.email?.trim() ?? '';
  const password = body.password ?? '';
  const adminEmail = import.meta.env.ADMIN_EMAIL as string | undefined;
  const passwordHash = import.meta.env.ADMIN_PASSWORD_HASH as string | undefined;

  if (!adminEmail || !passwordHash) {
    return new Response(JSON.stringify({ error: 'Admin não configurado no servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const emailOk = email === adminEmail;
  const passwordOk = emailOk && bcrypt.compareSync(password, passwordHash);

  if (!passwordOk) {
    return new Response(JSON.stringify({ error: 'Credenciais inválidas' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = signSession(createSessionPayload(email));
  const isProd = import.meta.env.PROD === true;

  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
