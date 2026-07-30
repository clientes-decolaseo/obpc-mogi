import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { createComunicado } from '../../../../lib/cms-storage';

export const prerender = false;

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'FormData inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const titulo = String(form.get('titulo') ?? '').trim();
  const dataPublicacao = String(form.get('dataPublicacao') ?? '').trim();
  const file = form.get('imagem');

  if (!titulo || !dataPublicacao) {
    return new Response(JSON.stringify({ error: 'Título e data são obrigatórios' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!(file instanceof File) || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Imagem obrigatória' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Imagem deve ter no máximo 5MB' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nameExt = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeExt = file.type.replace('image/', '').toLowerCase();
  const imageExt = ALLOWED_EXT.has(nameExt)
    ? nameExt === 'jpeg'
      ? 'jpg'
      : nameExt
    : ALLOWED_EXT.has(typeExt)
      ? typeExt === 'jpeg'
        ? 'jpg'
        : typeExt
      : '';

  if (!imageExt || !ALLOWED_EXT.has(imageExt === 'jpg' ? 'jpg' : imageExt)) {
    return new Response(JSON.stringify({ error: 'Formato inválido. Use jpg, png ou webp' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const created = await createComunicado({
    titulo,
    dataPublicacao,
    imageBuffer,
    imageExt,
  });

  return new Response(JSON.stringify({ ok: true, item: created }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
