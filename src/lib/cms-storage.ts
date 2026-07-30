// TODO: quando formos pra produção, trocar as implementações de write por chamadas à
// GitHub Contents API — a assinatura das funções deve continuar igual para não quebrar
// as rotas de API que as usam.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
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

export async function listComunicados(): Promise<ComunicadoListItem[]> {
  await mkdir(contentDir, { recursive: true });
  const files = (await readdir(contentDir)).filter((f) => f.endsWith('.json'));

  const items: ComunicadoListItem[] = [];
  for (const arquivo of files) {
    const raw = await readFile(path.join(contentDir, arquivo), 'utf8');
    const data = JSON.parse(raw) as {
      titulo: string;
      imagem: string;
      dataPublicacao: string;
    };
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
  await mkdir(contentDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const ext = imageExt.replace(/^\./, '').toLowerCase();
  const slug = await uniqueSlug(slugify(titulo));
  const imageFilename = `${slug}.${ext}`;
  const imagemPath = `/images/comunicados/${imageFilename}`;

  await writeFile(path.join(assetsDir, imageFilename), imageBuffer);

  const json = {
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
