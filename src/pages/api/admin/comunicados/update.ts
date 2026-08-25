import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { updateComunicado } from '../../../../lib/cms-storage';

export const prerender = false;

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 4 * 1024 * 1024;

function resolveExt(file: File): string {
  const nameExt = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeExt = file.type.replace('image/', '').toLowerCase();
  const raw = ALLOWED_EXT.has(nameExt) ? nameExt : ALLOWED_EXT.has(typeExt) ? typeExt : '';
  return raw === 'jpeg' ? 'jpg' : raw;
}

export const PUT: APIRoute = async ({ request, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const slug = String(form.get('slug') ?? '').trim();
      const titulo = String(form.get('titulo') ?? '').trim();
      const dataPublicacao = String(form.get('dataPublicacao') ?? '').trim();
      const file = form.get('imagem');

      if (!slug || !titulo || !dataPublicacao) {
        return new Response(JSON.stringify({ error: 'slug, título e data são obrigatórios' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let imageBuffer: Buffer | undefined;
      let imageExt: string | undefined;

      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) {
          return new Response(JSON.stringify({ error: 'Imagem deve ter no máximo 4MB' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        imageExt = resolveExt(file);
        if (!imageExt) {
          return new Response(JSON.stringify({ error: 'Formato inválido. Use jpg, png ou webp' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        imageBuffer = Buffer.from(await file.arrayBuffer());
      }

      const item = await updateComunicado(slug, {
        titulo,
        dataPublicacao,
        imageBuffer,
        imageExt,
      });

      return new Response(JSON.stringify({ ok: true, item }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = (await request.json()) as {
      slug?: string;
      titulo?: string;
      dataPublicacao?: string;
    };
    const slug = body.slug?.trim() ?? '';
    const titulo = body.titulo?.trim() ?? '';
    const dataPublicacao = body.dataPublicacao?.trim() ?? '';

    if (!slug || !titulo || !dataPublicacao) {
      return new Response(JSON.stringify({ error: 'slug, título e data são obrigatórios' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const item = await updateComunicado(slug, { titulo, dataPublicacao });
    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar';
    const status = message.includes('não encontrado') ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
