import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { deleteGaleriaImage } from '../../../../lib/cms-storage';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let nomeArquivo = '';
  try {
    const body = (await request.json()) as { nomeArquivo?: string };
    nomeArquivo = body.nomeArquivo?.trim() ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!nomeArquivo) {
    return new Response(JSON.stringify({ error: 'nomeArquivo é obrigatório' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await deleteGaleriaImage(nomeArquivo);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir';
    const status = message.includes('não encontrada') || message.includes('inválido') ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
