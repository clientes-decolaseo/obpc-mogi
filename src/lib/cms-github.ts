import { readEnv } from './env';

type ComunicadoListItem = {
  slug: string;
  titulo: string;
  dataPublicacao: string;
  imagem: string;
  arquivo: string;
};

type CreateComunicadoInput = {
  titulo: string;
  dataPublicacao: string;
  imageBuffer: Buffer;
  imageExt: string;
};

type UpdateComunicadoInput = {
  titulo: string;
  dataPublicacao: string;
  imageBuffer?: Buffer;
  imageExt?: string;
};

const API = 'https://api.github.com';
const CONTENT_DIR = 'src/content/comunicados';
const ASSETS_DIR = 'src/assets/comunicados';
const UA = 'obpcmogi-cms';

type ComunicadoJson = {
  titulo: string;
  imagem: string;
  dataPublicacao: string;
};

type GhFile = {
  name: string;
  path: string;
  sha: string;
  type: string;
  content?: string;
  encoding?: string;
  download_url?: string | null;
};

function repoConfig() {
  const token = readEnv('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN não configurado. Sem ele o painel não consegue gravar na Vercel.');
  }

  const owner = readEnv('VERCEL_GIT_REPO_OWNER');
  const slug = readEnv('VERCEL_GIT_REPO_SLUG');
  const repo =
    readEnv('GITHUB_REPO') || (owner && slug ? `${owner}/${slug}` : 'sennaricarte/obpc-mogi');
  const branch = readEnv('GITHUB_BRANCH') || 'main';

  return { token, repo, branch };
}

export function isGitHubCmsEnabled(): boolean {
  return Boolean(readEnv('GITHUB_TOKEN'));
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function filenameFromImagemPath(imagem: string): string {
  return imagem.split('/').pop() || '';
}

function jsonToItem(slug: string, data: ComunicadoJson): ComunicadoListItem {
  return {
    slug,
    titulo: data.titulo,
    dataPublicacao: data.dataPublicacao,
    imagem: data.imagem,
    arquivo: `${slug}.json`,
  };
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const { token } = repoConfig();
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
      ...(init.headers || {}),
    },
  });
}

async function ghJson<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null; text: string }> {
  const res = await gh(path, init);
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text };
}

function githubError(status: number, text: string): Error {
  if (status === 401) {
    return new Error('Token GitHub inválido. Recrie GITHUB_TOKEN com permissão de Contents: Read and write.');
  }
  if (status === 403) {
    return new Error('Sem permissão para gravar no repositório. Verifique o GITHUB_TOKEN.');
  }
  let snippet = text.replace(/\s+/g, ' ').slice(0, 180);
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (parsed.message) snippet = parsed.message;
  } catch {
    // keep raw snippet
  }
  return new Error(`Falha ao gravar no GitHub (${status})${snippet ? ': ' + snippet : ''}`);
}

async function listDir(dirPath: string): Promise<GhFile[]> {
  const { repo, branch } = repoConfig();
  const { status, data, text } = await ghJson<GhFile[] | GhFile>(
    `/repos/${repo}/contents/${dirPath}?ref=${encodeURIComponent(branch)}`,
  );
  if (status === 404) return [];
  if (status >= 400) throw githubError(status, text);
  return Array.isArray(data) ? data : [];
}

async function getFile(filePath: string): Promise<{ sha: string; buffer: Buffer } | null> {
  const { repo, branch, token } = repoConfig();
  const { status, data, text } = await ghJson<GhFile>(
    `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
  );
  if (status === 404) return null;
  if (status >= 400 || !data) throw githubError(status, text);

  if (data.content && data.encoding === 'base64') {
    return {
      sha: data.sha,
      buffer: Buffer.from(data.content.replace(/\n/g, ''), 'base64'),
    };
  }

  if (data.download_url) {
    const bin = await fetch(data.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': UA,
      },
    });
    if (!bin.ok) throw githubError(bin.status, await bin.text());
    return {
      sha: data.sha,
      buffer: Buffer.from(await bin.arrayBuffer()),
    };
  }

  return { sha: data.sha, buffer: Buffer.alloc(0) };
}

async function putFile(filePath: string, buffer: Buffer, message: string, sha?: string): Promise<void> {
  const { repo, branch } = repoConfig();
  const body: Record<string, string> = {
    message,
    content: buffer.toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const { status, text } = await ghJson(`/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (status >= 400) throw githubError(status, text);
}

async function deleteFile(filePath: string, sha: string, message: string): Promise<void> {
  const { repo, branch } = repoConfig();
  const { status, text } = await ghJson(`/repos/${repo}/contents/${filePath}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch }),
  });
  if (status >= 400 && status !== 404) throw githubError(status, text);
}

async function uniqueSlug(base: string): Promise<string> {
  const files = await listDir(CONTENT_DIR);
  const used = new Set(files.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, '')));
  const slug = base || 'comunicado';
  let attempt = 0;
  while (used.has(attempt === 0 ? slug : `${slug}-${attempt}`)) {
    attempt += 1;
  }
  return attempt === 0 ? slug : `${slug}-${attempt}`;
}

async function readJson(slug: string): Promise<{ sha: string; data: ComunicadoJson } | null> {
  const file = await getFile(`${CONTENT_DIR}/${slug}.json`);
  if (!file) return null;
  const data = JSON.parse(file.buffer.toString('utf8')) as ComunicadoJson;
  return { sha: file.sha, data };
}

export async function githubListComunicados(): Promise<ComunicadoListItem[]> {
  const files = (await listDir(CONTENT_DIR)).filter((f) => f.name.endsWith('.json'));
  const items: ComunicadoListItem[] = [];

  for (const file of files) {
    const slug = file.name.replace(/\.json$/, '');
    const parsed = await readJson(slug);
    if (!parsed) continue;
    items.push(jsonToItem(slug, parsed.data));
  }

  return items.sort(
    (a, b) => new Date(b.dataPublicacao).valueOf() - new Date(a.dataPublicacao).valueOf(),
  );
}

export async function githubCreateComunicado({
  titulo,
  dataPublicacao,
  imageBuffer,
  imageExt,
}: CreateComunicadoInput): Promise<ComunicadoListItem> {
  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const slug = await uniqueSlug(slugify(titulo));
  const imageFilename = `${slug}.${ext}`;
  const imagemPath = `/images/comunicados/${imageFilename}`;
  const json: ComunicadoJson = { titulo, imagem: imagemPath, dataPublicacao };
  const jsonBuffer = Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8');

  await putFile(
    `${ASSETS_DIR}/${imageFilename}`,
    imageBuffer,
    `cms: adicionar imagem do comunicado ${titulo}`,
  );

  try {
    await putFile(
      `${CONTENT_DIR}/${slug}.json`,
      jsonBuffer,
      `cms: adicionar comunicado ${titulo}`,
    );
  } catch (err) {
    const image = await getFile(`${ASSETS_DIR}/${imageFilename}`);
    if (image) {
      await deleteFile(`${ASSETS_DIR}/${imageFilename}`, image.sha, `cms: rollback imagem ${imageFilename}`);
    }
    throw err;
  }

  return jsonToItem(slug, json);
}

export async function githubUpdateComunicado(
  slug: string,
  dados: UpdateComunicadoInput,
): Promise<ComunicadoListItem> {
  const current = await readJson(slug);
  if (!current) throw new Error('Comunicado não encontrado');

  let imagemPath = current.data.imagem;

  if (dados.imageBuffer && dados.imageExt) {
    const ext = dados.imageExt.replace(/^\./, '').toLowerCase();
    const oldFilename = filenameFromImagemPath(current.data.imagem);
    const newFilename = `${slug}.${ext}`;
    const existing = await getFile(`${ASSETS_DIR}/${newFilename}`);

    await putFile(
      `${ASSETS_DIR}/${newFilename}`,
      dados.imageBuffer,
      `cms: atualizar imagem do comunicado ${slug}`,
      existing?.sha,
    );

    if (oldFilename && oldFilename !== newFilename) {
      const oldFile = await getFile(`${ASSETS_DIR}/${oldFilename}`);
      if (oldFile) {
        await deleteFile(
          `${ASSETS_DIR}/${oldFilename}`,
          oldFile.sha,
          `cms: remover imagem antiga ${oldFilename}`,
        );
      }
    }

    imagemPath = `/images/comunicados/${newFilename}`;
  }

  const json: ComunicadoJson = {
    titulo: dados.titulo,
    imagem: imagemPath,
    dataPublicacao: dados.dataPublicacao,
  };

  await putFile(
    `${CONTENT_DIR}/${slug}.json`,
    Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8'),
    `cms: atualizar comunicado ${slug}`,
    current.sha,
  );

  return jsonToItem(slug, json);
}

export async function githubDeleteComunicado(slug: string): Promise<void> {
  const current = await readJson(slug);
  if (!current) throw new Error('Comunicado não encontrado');

  await deleteFile(
    `${CONTENT_DIR}/${slug}.json`,
    current.sha,
    `cms: remover comunicado ${slug}`,
  );

  const filename = filenameFromImagemPath(current.data.imagem);
  if (filename) {
    const image = await getFile(`${ASSETS_DIR}/${filename}`);
    if (image) {
      await deleteFile(`${ASSETS_DIR}/${filename}`, image.sha, `cms: remover imagem ${filename}`);
    }
  }
}

export async function githubReadComunicadoImage(
  slug: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  try {
    const current = await readJson(slug);
    if (!current) return null;
    const filename = filenameFromImagemPath(current.data.imagem);
    if (!filename) return null;
    const file = await getFile(`${ASSETS_DIR}/${filename}`);
    if (!file) return null;
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { buffer: file.buffer, ext, contentType };
  } catch {
    return null;
  }
}
