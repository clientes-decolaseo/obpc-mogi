import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const igrejas = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/igrejas' }),
  schema: z.object({
    nome: z.string(),
    dirigente: z.string(),
    telefoneWhatsapp: z.string().optional(),
    facebook: z.string().url().optional(),
    email: z.string().email().optional(),
    endereco: z.string(),
    cep: z.string().optional(),
    mapaUrl: z.string().url(),
    imagem: z.string(),
    slug: z.string(),
  }),
});

const departamentos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/departamentos' }),
  schema: z.object({
    nome: z.string(),
    sigla: z.string(),
    descricaoCurta: z.string(),
    descricaoCompleta: z.string(),
    lideranca: z.string(),
    imagem: z.string(),
    ordem: z.number(),
  }),
});

const comunicados = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx,json}', base: './src/content/comunicados' }),
  schema: z.object({
    titulo: z.string(),
    imagem: z.string(),
    dataPublicacao: z.coerce.date(),
    dataExpiracao: z.coerce.date().optional(),
  }),
});

export const collections = { igrejas, departamentos, comunicados };
