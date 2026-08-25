import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { listIgrejas } from '../../../../lib/cms-storage';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const items = await listIgrejas();
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar igrejas';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
