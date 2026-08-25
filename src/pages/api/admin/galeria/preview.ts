import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { readGaleriaImage } from '../../../../lib/cms-storage';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const nome = url.searchParams.get('nome')?.trim() ?? '';
  if (!nome) {
    return new Response(JSON.stringify({ error: 'nome é obrigatório' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const image = await readGaleriaImage(nome);
  if (!image) {
    return new Response(JSON.stringify({ error: 'Imagem não encontrada' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(new Uint8Array(image.buffer), {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'no-store',
    },
  });
};
