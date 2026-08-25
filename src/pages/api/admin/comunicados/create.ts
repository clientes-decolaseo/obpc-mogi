import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { createComunicado } from '../../../../lib/cms-storage';
import { isGitHubCmsEnabled } from '../../../../lib/cms-github';
import { readEnv } from '../../../../lib/env';

export const prerender = false;

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 4 * 1024 * 1024;

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return !!value && typeof value === 'object' && 'arrayBuffer' in value && 'size' in value && Number((value as File).size) > 0;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    requireAuth(cookies);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(err instanceof Error ? err.message : 'Não autorizado', 401);
  }

  if (readEnv('VERCEL') === '1' && !isGitHubCmsEnabled()) {
    return jsonError(
      'GITHUB_TOKEN não configurado na Vercel. Crie um token Fine-grained (Contents: Read and write) no repositório clientes-decolaseo/obpc-mogi e faça Redeploy.',
      500,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FormData inválido';
    return jsonError(`Não foi possível ler o envio (${message})`);
  }

  const titulo = String(form.get('titulo') ?? '').trim();
  const dataPublicacao = String(form.get('dataPublicacao') ?? '').trim();
  const file = form.get('imagem');

  if (!titulo || !dataPublicacao) {
    return jsonError('Título e data são obrigatórios');
  }

  if (!isUploadedFile(file)) {
    return jsonError('Imagem obrigatória');
  }

  if (file.size > MAX_BYTES) {
    return jsonError('Imagem deve ter no máximo 4MB');
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
    return jsonError('Formato inválido. Use jpg, png ou webp');
  }

  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao publicar';
    return jsonError(message, 500);
  }
};
