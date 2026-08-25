import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { updateDepartamento } from '../../../../lib/cms-storage';

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
  return (
    !!value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    'size' in value &&
    Number((value as File).size) > 0
  );
}

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
    return jsonError(err instanceof Error ? err.message : 'Não autorizado', 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FormData inválido';
    return jsonError(`Não foi possível ler o envio (${message})`);
  }

  const slug = String(form.get('slug') ?? '').trim();
  const nome = String(form.get('nome') ?? '').trim();
  const sigla = String(form.get('sigla') ?? '').trim();
  const descricaoCurta = String(form.get('descricaoCurta') ?? '').trim();
  const descricaoCompleta = String(form.get('descricaoCompleta') ?? '').trim();
  const lideranca = String(form.get('lideranca') ?? '').trim();
  const ordem = Number(form.get('ordem'));
  const file = form.get('imagem');

  if (!slug || !nome || !sigla || !descricaoCurta || !descricaoCompleta || !lideranca) {
    return jsonError('slug, nome, sigla, descrições e liderança são obrigatórios');
  }

  if (!Number.isFinite(ordem) || !Number.isInteger(ordem)) {
    return jsonError('Ordem deve ser um número inteiro');
  }

  let imageBuffer: Buffer | undefined;
  let imageExt: string | undefined;

  if (isUploadedFile(file)) {
    if (file.size > MAX_BYTES) {
      return jsonError('Imagem deve ter no máximo 4MB');
    }
    imageExt = resolveExt(file);
    if (!imageExt) {
      return jsonError('Formato inválido. Use jpg, png ou webp');
    }
    imageBuffer = Buffer.from(await file.arrayBuffer());
  }

  try {
    const item = await updateDepartamento(slug, {
      nome,
      sigla,
      descricaoCurta,
      descricaoCompleta,
      lideranca,
      ordem,
      imageBuffer,
      imageExt,
    });

    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar';
    const status = message.includes('não encontrado') ? 404 : 500;
    return jsonError(message, status);
  }
};
