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
const GALERIA_DIR = 'src/assets/galeria';
const GALERIA_META = 'src/content/galeria-meta.json';
const DEPT_CONTENT_DIR = 'src/content/departamentos';
const DEPT_ASSETS_DIR = 'src/assets/departamentos';
const IGREJA_CONTENT_DIR = 'src/content/igrejas';
const IGREJA_ASSETS_DIR = 'src/assets/igrejas';
const UA = 'obpcmogi-cms';
const GALERIA_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

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
    readEnv('GITHUB_REPO') || (owner && slug ? `${owner}/${slug}` : 'clientes-decolaseo/obpc-mogi');
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

export type GaleriaListItem = {
  nomeArquivo: string;
  legenda: string;
};

type GaleriaMeta = Record<string, string>;

function contentTypeForExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function isGaleriaImageName(nome: string): boolean {
  return !nome.includes('/') && !nome.includes('\\') && !nome.includes('..') && GALERIA_IMAGE_EXT.test(nome);
}

async function readGaleriaMeta(): Promise<{ sha?: string; data: GaleriaMeta }> {
  const file = await getFile(GALERIA_META);
  if (!file) return { data: {} };
  try {
    const parsed = JSON.parse(file.buffer.toString('utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { sha: file.sha, data: parsed as GaleriaMeta };
    }
  } catch {
    // meta corrompido — segue vazio mas preserva sha pra sobrescrever
  }
  return { sha: file.sha, data: {} };
}

export async function githubListGaleria(): Promise<GaleriaListItem[]> {
  const files = await listDir(GALERIA_DIR);
  const meta = await readGaleriaMeta();
  return files
    .filter((f) => f.type !== 'dir' && isGaleriaImageName(f.name))
    .map((f) => ({
      nomeArquivo: f.name,
      legenda: typeof meta.data[f.name] === 'string' ? meta.data[f.name] : '',
    }))
    .sort((a, b) => a.nomeArquivo.localeCompare(b.nomeArquivo, 'pt-BR'));
}

export async function githubCreateGaleriaImage({
  imageBuffer,
  imageExt,
  legenda,
}: {
  imageBuffer: Buffer;
  imageExt: string;
  legenda: string;
}): Promise<GaleriaListItem> {
  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const nomeArquivo = `galeria-${Date.now()}.${ext}`;
  const caption = legenda.trim();

  await putFile(`${GALERIA_DIR}/${nomeArquivo}`, imageBuffer, `cms: adicionar foto ${nomeArquivo}`);

  if (caption) {
    try {
      const meta = await readGaleriaMeta();
      meta.data[nomeArquivo] = caption;
      await putFile(
        GALERIA_META,
        Buffer.from(`${JSON.stringify(meta.data, null, 2)}\n`, 'utf8'),
        `cms: legenda da foto ${nomeArquivo}`,
        meta.sha,
      );
    } catch (err) {
      const image = await getFile(`${GALERIA_DIR}/${nomeArquivo}`);
      if (image) {
        await deleteFile(`${GALERIA_DIR}/${nomeArquivo}`, image.sha, `cms: rollback foto ${nomeArquivo}`);
      }
      throw err;
    }
  }

  return { nomeArquivo, legenda: caption };
}

export async function githubDeleteGaleriaImage(nomeArquivo: string): Promise<void> {
  const nome = nomeArquivo.split(/[/\\]/).pop() || '';
  if (!isGaleriaImageName(nome)) {
    throw new Error('Nome de arquivo inválido');
  }

  const image = await getFile(`${GALERIA_DIR}/${nome}`);
  if (!image) throw new Error('Foto não encontrada');

  await deleteFile(`${GALERIA_DIR}/${nome}`, image.sha, `cms: remover foto ${nome}`);

  const meta = await readGaleriaMeta();
  if (Object.prototype.hasOwnProperty.call(meta.data, nome)) {
    delete meta.data[nome];
    await putFile(
      GALERIA_META,
      Buffer.from(`${JSON.stringify(meta.data, null, 2)}\n`, 'utf8'),
      `cms: remover legenda ${nome}`,
      meta.sha,
    );
  }
}

export async function githubReadGaleriaImage(
  nomeArquivo: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  const nome = nomeArquivo.split(/[/\\]/).pop() || '';
  if (!isGaleriaImageName(nome)) return null;
  try {
    const file = await getFile(`${GALERIA_DIR}/${nome}`);
    if (!file) return null;
    const ext = nome.split('.').pop()?.toLowerCase() || 'jpg';
    return { buffer: file.buffer, ext, contentType: contentTypeForExt(ext === 'jpeg' ? 'jpg' : ext) };
  } catch {
    return null;
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

export type DepartamentoListItem = {
  slug: string;
  nome: string;
  sigla: string;
  descricaoCurta: string;
  descricaoCompleta: string;
  lideranca: string;
  imagem: string;
  ordem: number;
};

type DepartamentoJson = Omit<DepartamentoListItem, 'slug'>;

function jsonToDepartamento(slug: string, data: DepartamentoJson): DepartamentoListItem {
  return {
    slug,
    nome: data.nome,
    sigla: data.sigla,
    descricaoCurta: data.descricaoCurta,
    descricaoCompleta: data.descricaoCompleta,
    lideranca: data.lideranca,
    imagem: data.imagem,
    ordem: Number(data.ordem) || 0,
  };
}

async function uniqueDepartamentoSlug(base: string): Promise<string> {
  const files = await listDir(DEPT_CONTENT_DIR);
  const used = new Set(
    files.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, '')),
  );
  const slug = base || 'departamento';
  let attempt = 0;
  while (used.has(attempt === 0 ? slug : `${slug}-${attempt}`)) {
    attempt += 1;
  }
  return attempt === 0 ? slug : `${slug}-${attempt}`;
}

async function readDepartamentoJson(slug: string): Promise<{ sha: string; data: DepartamentoJson } | null> {
  const file = await getFile(`${DEPT_CONTENT_DIR}/${slug}.json`);
  if (!file) return null;
  const data = JSON.parse(file.buffer.toString('utf8')) as DepartamentoJson;
  return { sha: file.sha, data };
}

export async function githubListDepartamentos(): Promise<DepartamentoListItem[]> {
  const files = (await listDir(DEPT_CONTENT_DIR)).filter((f) => f.name.endsWith('.json'));
  const items: DepartamentoListItem[] = [];

  for (const file of files) {
    const slug = file.name.replace(/\.json$/, '');
    const parsed = await readDepartamentoJson(slug);
    if (!parsed) continue;
    items.push(jsonToDepartamento(slug, parsed.data));
  }

  return items.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function githubCreateDepartamento({
  nome,
  sigla,
  descricaoCurta,
  descricaoCompleta,
  lideranca,
  ordem,
  imageBuffer,
  imageExt,
}: {
  nome: string;
  sigla: string;
  descricaoCurta: string;
  descricaoCompleta: string;
  lideranca: string;
  ordem: number;
  imageBuffer: Buffer;
  imageExt: string;
}): Promise<DepartamentoListItem> {
  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const slug = await uniqueDepartamentoSlug(slugify(nome));
  const imageFilename = `${slug}.${ext}`;
  const imagem = `/images/departamentos/${imageFilename}`;
  const json: DepartamentoJson = {
    nome,
    sigla,
    descricaoCurta,
    descricaoCompleta,
    lideranca,
    imagem,
    ordem,
  };

  await putFile(
    `${DEPT_ASSETS_DIR}/${imageFilename}`,
    imageBuffer,
    `cms: adicionar imagem do departamento ${nome}`,
  );

  try {
    await putFile(
      `${DEPT_CONTENT_DIR}/${slug}.json`,
      Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8'),
      `cms: adicionar departamento ${nome}`,
    );
  } catch (err) {
    const image = await getFile(`${DEPT_ASSETS_DIR}/${imageFilename}`);
    if (image) {
      await deleteFile(
        `${DEPT_ASSETS_DIR}/${imageFilename}`,
        image.sha,
        `cms: rollback imagem ${imageFilename}`,
      );
    }
    throw err;
  }

  return jsonToDepartamento(slug, json);
}

export async function githubUpdateDepartamento(
  slug: string,
  dados: {
    nome: string;
    sigla: string;
    descricaoCurta: string;
    descricaoCompleta: string;
    lideranca: string;
    ordem: number;
    imageBuffer?: Buffer;
    imageExt?: string;
  },
): Promise<DepartamentoListItem> {
  const current = await readDepartamentoJson(slug);
  if (!current) throw new Error('Departamento não encontrado');

  let imagem = current.data.imagem;

  if (dados.imageBuffer && dados.imageExt) {
    const ext = dados.imageExt.replace(/^\./, '').toLowerCase();
    const oldFilename = filenameFromImagemPath(current.data.imagem);
    const newFilename = `${slug}.${ext}`;
    const existing = await getFile(`${DEPT_ASSETS_DIR}/${newFilename}`);

    await putFile(
      `${DEPT_ASSETS_DIR}/${newFilename}`,
      dados.imageBuffer,
      `cms: atualizar imagem do departamento ${slug}`,
      existing?.sha,
    );

    if (oldFilename && oldFilename !== newFilename) {
      const oldFile = await getFile(`${DEPT_ASSETS_DIR}/${oldFilename}`);
      if (oldFile) {
        await deleteFile(
          `${DEPT_ASSETS_DIR}/${oldFilename}`,
          oldFile.sha,
          `cms: remover imagem antiga ${oldFilename}`,
        );
      }
    }

    imagem = `/images/departamentos/${newFilename}`;
  }

  const json: DepartamentoJson = {
    nome: dados.nome,
    sigla: dados.sigla,
    descricaoCurta: dados.descricaoCurta,
    descricaoCompleta: dados.descricaoCompleta,
    lideranca: dados.lideranca,
    imagem,
    ordem: dados.ordem,
  };

  await putFile(
    `${DEPT_CONTENT_DIR}/${slug}.json`,
    Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8'),
    `cms: atualizar departamento ${slug}`,
    current.sha,
  );

  return jsonToDepartamento(slug, json);
}

export async function githubDeleteDepartamento(slug: string): Promise<void> {
  const current = await readDepartamentoJson(slug);
  if (!current) throw new Error('Departamento não encontrado');

  await deleteFile(
    `${DEPT_CONTENT_DIR}/${slug}.json`,
    current.sha,
    `cms: remover departamento ${slug}`,
  );

  const filename = filenameFromImagemPath(current.data.imagem);
  if (filename) {
    const image = await getFile(`${DEPT_ASSETS_DIR}/${filename}`);
    if (image) {
      await deleteFile(`${DEPT_ASSETS_DIR}/${filename}`, image.sha, `cms: remover imagem ${filename}`);
    }
  }
}

export async function githubReadDepartamentoImage(
  slug: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  try {
    const current = await readDepartamentoJson(slug);
    if (!current) return null;
    const filename = filenameFromImagemPath(current.data.imagem);
    if (!filename) return null;
    const file = await getFile(`${DEPT_ASSETS_DIR}/${filename}`);
    if (!file) return null;
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    return { buffer: file.buffer, ext, contentType: contentTypeForExt(ext === 'jpeg' ? 'jpg' : ext) };
  } catch {
    return null;
  }
}

const IGREJA_ORDEM_SEED = [
  'sede',
  'alto-guaianases',
  'biritiba-mirim',
  'botujuru',
  'biritiba-ussu',
  'bras-cubas',
  'cesar-de-souza',
  'chacara-guanabara',
  'conjunto-cocuera',
  'guararema',
  'itapety',
  'jardim-aeroporto-ii',
  'jardim-lair',
  'jardim-vieira',
  'jardim-das-bandeiras',
  'lucinda',
  'franca',
  'bolivia',
  'parque-olimpico',
  'rodeio',
  'sabauna',
  'salesopolis',
  'varinhas',
  'vila-moraes',
  'vila-natal',
  'vila-paulista',
] as const;

export type IgrejaListItem = {
  slug: string;
  nome: string;
  dirigente: string;
  telefoneWhatsapp?: string;
  facebook?: string;
  email?: string;
  endereco: string;
  cep?: string;
  mapaUrl: string;
  imagem: string;
};

type IgrejaJson = IgrejaListItem;

function igrejaSlugFromNome(nome: string): string {
  const stripped = nome.replace(/^igreja\s+obpc\s*[–\-—:]?\s*/i, '');
  return slugify(stripped);
}

function buildIgrejaJson(fields: {
  slug: string;
  nome: string;
  dirigente: string;
  endereco: string;
  mapaUrl: string;
  imagem: string;
  telefoneWhatsapp?: string;
  facebook?: string;
  email?: string;
  cep?: string;
}): IgrejaJson {
  const json: IgrejaJson = {
    nome: fields.nome,
    dirigente: fields.dirigente,
    endereco: fields.endereco,
    mapaUrl: fields.mapaUrl,
    imagem: fields.imagem,
    slug: fields.slug,
  };
  if (fields.telefoneWhatsapp) json.telefoneWhatsapp = fields.telefoneWhatsapp;
  if (fields.facebook) json.facebook = fields.facebook;
  if (fields.email) json.email = fields.email;
  if (fields.cep) json.cep = fields.cep;
  return json;
}

function jsonToIgreja(data: IgrejaJson, fallbackSlug: string): IgrejaListItem {
  return {
    slug: data.slug || fallbackSlug,
    nome: data.nome,
    dirigente: data.dirigente,
    telefoneWhatsapp: data.telefoneWhatsapp,
    facebook: data.facebook,
    email: data.email,
    endereco: data.endereco,
    cep: data.cep,
    mapaUrl: data.mapaUrl,
    imagem: data.imagem,
  };
}

async function uniqueIgrejaSlug(base: string): Promise<string> {
  const files = await listDir(IGREJA_CONTENT_DIR);
  const used = new Set(
    files.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, '')),
  );
  const slug = base || 'igreja';
  let attempt = 0;
  while (used.has(attempt === 0 ? slug : `${slug}-${attempt}`)) {
    attempt += 1;
  }
  return attempt === 0 ? slug : `${slug}-${attempt}`;
}

async function readIgrejaJson(slug: string): Promise<{ sha: string; data: IgrejaJson } | null> {
  const file = await getFile(`${IGREJA_CONTENT_DIR}/${slug}.json`);
  if (!file) return null;
  const data = JSON.parse(file.buffer.toString('utf8')) as IgrejaJson;
  return { sha: file.sha, data };
}

export async function githubListIgrejas(): Promise<IgrejaListItem[]> {
  const files = (await listDir(IGREJA_CONTENT_DIR)).filter((f) => f.name.endsWith('.json'));
  const items: IgrejaListItem[] = [];

  for (const file of files) {
    const fileSlug = file.name.replace(/\.json$/, '');
    const parsed = await readIgrejaJson(fileSlug);
    if (!parsed) continue;
    items.push(jsonToIgreja(parsed.data, fileSlug));
  }

  return items.sort((a, b) => {
    const ia = IGREJA_ORDEM_SEED.indexOf(a.slug as (typeof IGREJA_ORDEM_SEED)[number]);
    const ib = IGREJA_ORDEM_SEED.indexOf(b.slug as (typeof IGREJA_ORDEM_SEED)[number]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

export async function githubCreateIgreja({
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
}: {
  nome: string;
  dirigente: string;
  telefoneWhatsapp?: string;
  facebook?: string;
  email?: string;
  endereco: string;
  cep?: string;
  mapaUrl: string;
  imageBuffer: Buffer;
  imageExt: string;
}): Promise<IgrejaListItem> {
  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const slug = await uniqueIgrejaSlug(igrejaSlugFromNome(nome));
  const imageFilename = `${slug}.${ext}`;
  const imagem = `/images/igrejas/${imageFilename}`;
  const json = buildIgrejaJson({
    slug,
    nome,
    dirigente,
    endereco,
    mapaUrl,
    imagem,
    telefoneWhatsapp,
    facebook,
    email,
    cep,
  });

  await putFile(
    `${IGREJA_ASSETS_DIR}/${imageFilename}`,
    imageBuffer,
    `cms: adicionar imagem da igreja ${nome}`,
  );

  try {
    await putFile(
      `${IGREJA_CONTENT_DIR}/${slug}.json`,
      Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8'),
      `cms: adicionar igreja ${nome}`,
    );
  } catch (err) {
    const image = await getFile(`${IGREJA_ASSETS_DIR}/${imageFilename}`);
    if (image) {
      await deleteFile(
        `${IGREJA_ASSETS_DIR}/${imageFilename}`,
        image.sha,
        `cms: rollback imagem ${imageFilename}`,
      );
    }
    throw err;
  }

  return jsonToIgreja(json, slug);
}

export async function githubUpdateIgreja(
  slug: string,
  dados: {
    nome: string;
    dirigente: string;
    telefoneWhatsapp?: string;
    facebook?: string;
    email?: string;
    endereco: string;
    cep?: string;
    mapaUrl: string;
    imageBuffer?: Buffer;
    imageExt?: string;
  },
): Promise<IgrejaListItem> {
  const current = await readIgrejaJson(slug);
  if (!current) throw new Error('Igreja não encontrada');

  let imagem = current.data.imagem;

  if (dados.imageBuffer && dados.imageExt) {
    const ext = dados.imageExt.replace(/^\./, '').toLowerCase();
    const oldFilename = filenameFromImagemPath(current.data.imagem);
    const newFilename = `${slug}.${ext}`;
    const existing = await getFile(`${IGREJA_ASSETS_DIR}/${newFilename}`);

    await putFile(
      `${IGREJA_ASSETS_DIR}/${newFilename}`,
      dados.imageBuffer,
      `cms: atualizar imagem da igreja ${slug}`,
      existing?.sha,
    );

    if (oldFilename && oldFilename !== newFilename) {
      const oldFile = await getFile(`${IGREJA_ASSETS_DIR}/${oldFilename}`);
      if (oldFile) {
        await deleteFile(
          `${IGREJA_ASSETS_DIR}/${oldFilename}`,
          oldFile.sha,
          `cms: remover imagem antiga ${oldFilename}`,
        );
      }
    }

    imagem = `/images/igrejas/${newFilename}`;
  }

  const json = buildIgrejaJson({
    slug,
    nome: dados.nome,
    dirigente: dados.dirigente,
    endereco: dados.endereco,
    mapaUrl: dados.mapaUrl,
    imagem,
    telefoneWhatsapp: dados.telefoneWhatsapp,
    facebook: dados.facebook,
    email: dados.email,
    cep: dados.cep,
  });

  await putFile(
    `${IGREJA_CONTENT_DIR}/${slug}.json`,
    Buffer.from(`${JSON.stringify(json, null, 2)}\n`, 'utf8'),
    `cms: atualizar igreja ${slug}`,
    current.sha,
  );

  return jsonToIgreja(json, slug);
}

export async function githubDeleteIgreja(slug: string): Promise<void> {
  const current = await readIgrejaJson(slug);
  if (!current) throw new Error('Igreja não encontrada');

  await deleteFile(
    `${IGREJA_CONTENT_DIR}/${slug}.json`,
    current.sha,
    `cms: remover igreja ${slug}`,
  );

  const filename = filenameFromImagemPath(current.data.imagem);
  if (filename) {
    const image = await getFile(`${IGREJA_ASSETS_DIR}/${filename}`);
    if (image) {
      await deleteFile(`${IGREJA_ASSETS_DIR}/${filename}`, image.sha, `cms: remover imagem ${filename}`);
    }
  }
}

export async function githubReadIgrejaImage(
  slug: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  try {
    const current = await readIgrejaJson(slug);
    if (!current) return null;
    const filename = filenameFromImagemPath(current.data.imagem);
    if (!filename) return null;
    const file = await getFile(`${IGREJA_ASSETS_DIR}/${filename}`);
    if (!file) return null;
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    return { buffer: file.buffer, ext, contentType: contentTypeForExt(ext === 'jpeg' ? 'jpg' : ext) };
  } catch {
    return null;
  }
}
