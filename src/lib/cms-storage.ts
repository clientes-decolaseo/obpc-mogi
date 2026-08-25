import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnv } from './env';
import {
  isGitHubCmsEnabled,
  githubListComunicados,
  githubCreateComunicado,
  githubUpdateComunicado,
  githubDeleteComunicado,
  githubReadComunicadoImage,
  githubListGaleria,
  githubCreateGaleriaImage,
  githubDeleteGaleriaImage,
  githubReadGaleriaImage,
  githubListDepartamentos,
  githubCreateDepartamento,
  githubUpdateDepartamento,
  githubDeleteDepartamento,
  githubReadDepartamentoImage,
  githubListIgrejas,
  githubCreateIgreja,
  githubUpdateIgreja,
  githubDeleteIgreja,
  githubReadIgrejaImage,
} from './cms-github';

export type { GaleriaListItem, DepartamentoListItem, IgrejaListItem } from './cms-github';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const contentDir = path.join(rootDir, 'src', 'content', 'comunicados');
const assetsDir = path.join(rootDir, 'src', 'assets', 'comunicados');

export type ComunicadoListItem = {
  slug: string;
  titulo: string;
  dataPublicacao: string;
  imagem: string;
  arquivo: string;
};

export type CreateComunicadoInput = {
  titulo: string;
  dataPublicacao: string;
  imageBuffer: Buffer;
  imageExt: string;
};

export type UpdateComunicadoInput = {
  titulo: string;
  dataPublicacao: string;
  imageBuffer?: Buffer;
  imageExt?: string;
};

type ComunicadoJson = {
  titulo: string;
  imagem: string;
  dataPublicacao: string;
};

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

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'comunicado';
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const jsonPath = path.join(contentDir, `${candidate}.json`);
    try {
      await readFile(jsonPath);
      attempt += 1;
    } catch {
      return candidate;
    }
  }
}

async function readComunicadoJson(slug: string): Promise<ComunicadoJson> {
  const raw = await readFile(path.join(contentDir, `${slug}.json`), 'utf8');
  return JSON.parse(raw) as ComunicadoJson;
}

function assertWritable(): void {
  if (readEnv('VERCEL') === '1' && !isGitHubCmsEnabled()) {
    throw new Error(
      'O servidor da Vercel não permite gravar arquivos. Configure GITHUB_TOKEN (Contents: Read and write) nas Environment Variables e faça Redeploy.',
    );
  }
}

export async function listComunicados(): Promise<ComunicadoListItem[]> {
  if (isGitHubCmsEnabled()) return githubListComunicados();

  await mkdir(contentDir, { recursive: true });
  const files = (await readdir(contentDir)).filter((f) => f.endsWith('.json'));

  const items: ComunicadoListItem[] = [];
  for (const arquivo of files) {
    const raw = await readFile(path.join(contentDir, arquivo), 'utf8');
    const data = JSON.parse(raw) as ComunicadoJson;
    items.push({
      slug: arquivo.replace(/\.json$/, ''),
      titulo: data.titulo,
      dataPublicacao: data.dataPublicacao,
      imagem: data.imagem,
      arquivo,
    });
  }

  return items.sort(
    (a, b) => new Date(b.dataPublicacao).valueOf() - new Date(a.dataPublicacao).valueOf(),
  );
}

export async function createComunicado({
  titulo,
  dataPublicacao,
  imageBuffer,
  imageExt,
}: CreateComunicadoInput): Promise<ComunicadoListItem> {
  if (isGitHubCmsEnabled()) {
    return githubCreateComunicado({ titulo, dataPublicacao, imageBuffer, imageExt });
  }
  assertWritable();

  await mkdir(contentDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const slug = await uniqueSlug(slugify(titulo));
  const imageFilename = `${slug}.${ext}`;
  const imagemPath = `/images/comunicados/${imageFilename}`;

  await writeFile(path.join(assetsDir, imageFilename), imageBuffer);

  const json: ComunicadoJson = {
    titulo,
    imagem: imagemPath,
    dataPublicacao,
  };
  await writeFile(path.join(contentDir, `${slug}.json`), `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  return {
    slug,
    titulo,
    dataPublicacao,
    imagem: imagemPath,
    arquivo: `${slug}.json`,
  };
}

export async function updateComunicado(
  slug: string,
  dados: UpdateComunicadoInput,
): Promise<ComunicadoListItem> {
  if (isGitHubCmsEnabled()) return githubUpdateComunicado(slug, dados);
  assertWritable();

  await mkdir(contentDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const jsonPath = path.join(contentDir, `${slug}.json`);
  let current: ComunicadoJson;
  try {
    current = await readComunicadoJson(slug);
  } catch {
    throw new Error('Comunicado não encontrado');
  }

  let imagemPath = current.imagem;

  if (dados.imageBuffer && dados.imageExt) {
    const ext = dados.imageExt.replace(/^\./, '').toLowerCase();
    const oldFilename = filenameFromImagemPath(current.imagem);
    const newFilename = `${slug}.${ext}`;
    const newPath = path.join(assetsDir, newFilename);

    await writeFile(newPath, dados.imageBuffer);

    if (oldFilename && oldFilename !== newFilename) {
      try {
        await unlink(path.join(assetsDir, oldFilename));
      } catch {
        // arquivo antigo pode não existir
      }
    }

    imagemPath = `/images/comunicados/${newFilename}`;
  }

  const json: ComunicadoJson = {
    titulo: dados.titulo,
    imagem: imagemPath,
    dataPublicacao: dados.dataPublicacao,
  };
  await writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  return {
    slug,
    titulo: json.titulo,
    dataPublicacao: json.dataPublicacao,
    imagem: json.imagem,
    arquivo: `${slug}.json`,
  };
}

export async function deleteComunicado(slug: string): Promise<void> {
  if (isGitHubCmsEnabled()) return githubDeleteComunicado(slug);
  assertWritable();

  const jsonPath = path.join(contentDir, `${slug}.json`);
  let current: ComunicadoJson;
  try {
    current = await readComunicadoJson(slug);
  } catch {
    throw new Error('Comunicado não encontrado');
  }

  const filename = filenameFromImagemPath(current.imagem);
  await unlink(jsonPath);

  if (filename) {
    try {
      await unlink(path.join(assetsDir, filename));
    } catch {
      // imagem pode já ter sido removida
    }
  }
}

/** Lê o arquivo de imagem de um comunicado (para preview no admin). */
export async function readComunicadoImage(
  slug: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  if (isGitHubCmsEnabled()) return githubReadComunicadoImage(slug);

  try {
    const current = await readComunicadoJson(slug);
    const filename = filenameFromImagemPath(current.imagem);
    if (!filename) return null;
    const buffer = await readFile(path.join(assetsDir, filename));
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    return { buffer, ext, contentType };
  } catch {
    return null;
  }
}

function requireGitHubCms(): void {
  if (!isGitHubCmsEnabled()) {
    throw new Error(
      'GITHUB_TOKEN não configurado. Sem ele o painel não consegue gravar a galeria na Vercel.',
    );
  }
}

export async function listGaleria() {
  requireGitHubCms();
  return githubListGaleria();
}

export async function createGaleriaImage(input: {
  imageBuffer: Buffer;
  imageExt: string;
  legenda: string;
}) {
  requireGitHubCms();
  return githubCreateGaleriaImage(input);
}

export async function deleteGaleriaImage(nomeArquivo: string) {
  requireGitHubCms();
  return githubDeleteGaleriaImage(nomeArquivo);
}

export async function readGaleriaImage(nomeArquivo: string) {
  requireGitHubCms();
  return githubReadGaleriaImage(nomeArquivo);
}

export async function listDepartamentos() {
  requireGitHubCms();
  return githubListDepartamentos();
}

export async function createDepartamento(input: {
  nome: string;
  sigla: string;
  descricaoCurta: string;
  descricaoCompleta: string;
  lideranca: string;
  ordem: number;
  imageBuffer: Buffer;
  imageExt: string;
}) {
  requireGitHubCms();
  return githubCreateDepartamento(input);
}

export async function updateDepartamento(
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
) {
  requireGitHubCms();
  return githubUpdateDepartamento(slug, dados);
}

export async function deleteDepartamento(slug: string) {
  requireGitHubCms();
  return githubDeleteDepartamento(slug);
}

export async function readDepartamentoImage(slug: string) {
  requireGitHubCms();
  return githubReadDepartamentoImage(slug);
}

export async function listIgrejas() {
  requireGitHubCms();
  return githubListIgrejas();
}

export async function createIgreja(input: {
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
}) {
  requireGitHubCms();
  return githubCreateIgreja(input);
}

export async function updateIgreja(
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
) {
  requireGitHubCms();
  return githubUpdateIgreja(slug, dados);
}

export async function deleteIgreja(slug: string) {
  requireGitHubCms();
  return githubDeleteIgreja(slug);
}

export async function readIgrejaImage(slug: string) {
  requireGitHubCms();
  return githubReadIgrejaImage(slug);
}
