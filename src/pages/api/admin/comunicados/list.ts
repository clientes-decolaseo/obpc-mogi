import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { listComunicados } from '../../../../lib/cms-storage';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const items = await listComunicados();
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
