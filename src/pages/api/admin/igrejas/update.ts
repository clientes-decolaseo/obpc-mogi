import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { updateIgreja } from '../../../../lib/cms-storage';

export const prerender = false;

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 4 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
  const dirigente = String(form.get('dirigente') ?? '').trim();
  const endereco = String(form.get('endereco') ?? '').trim();
  const mapaUrl = String(form.get('mapaUrl') ?? '').trim();
  const telefoneWhatsapp = optionalText(form.get('telefoneWhatsapp'));
  const facebook = optionalText(form.get('facebook'));
  const email = optionalText(form.get('email'));
  const cep = optionalText(form.get('cep'));
  const file = form.get('imagem');

  if (!slug || !nome || !dirigente || !endereco || !mapaUrl) {
    return jsonError('slug, nome, dirigente, endereço e URL do mapa são obrigatórios');
  }

  if (!isHttpUrl(mapaUrl)) {
    return jsonError('URL do mapa inválida');
  }

  if (facebook && !isHttpUrl(facebook)) {
    return jsonError('URL do Facebook inválida');
  }

  if (email && !EMAIL_RE.test(email)) {
    return jsonError('E-mail inválido');
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
    const item = await updateIgreja(slug, {
      nome,
      dirigente,
      telefoneWhatsapp,
      facebook,
      email,
      endereco,
      cep,
      mapaUrl,
      imageBuffer,
      imageExt,
    });

    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar';
    const status = message.includes('não encontrada') ? 404 : 500;
    return jsonError(message, status);
  }
};
