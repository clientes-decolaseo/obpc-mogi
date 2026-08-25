import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { deleteIgreja } from '../../../../lib/cms-storage';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let slug = '';
  try {
    const body = (await request.json()) as { slug?: string };
    slug = body.slug?.trim() ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug é obrigatório' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await deleteIgreja(slug);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir';
    const status = message.includes('não encontrada') ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
