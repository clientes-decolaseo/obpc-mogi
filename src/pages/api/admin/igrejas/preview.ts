import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { readIgrejaImage } from '../../../../lib/cms-storage';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const slug = url.searchParams.get('slug')?.trim() ?? '';
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug é obrigatório' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const image = await readIgrejaImage(slug);
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
