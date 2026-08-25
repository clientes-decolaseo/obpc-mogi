/** Lê variável de ambiente em runtime (Vercel/Node) e no dev do Astro. */
export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null || raw === '') return undefined;
  return String(raw).trim().replaceAll('\\$', '$');
}
