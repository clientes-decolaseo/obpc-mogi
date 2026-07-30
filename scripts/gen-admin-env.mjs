import bcrypt from 'bcryptjs';
import fs from 'fs';

const h = bcrypt.hashSync('trocar123', 10);
console.log('hash', h);
console.log('ok', bcrypt.compareSync('trocar123', h));

// Escapa $ para o Vite/dotenv não expandir como variáveis
const escaped = h.replaceAll('$', '\\$');

const env = [
  'ADMIN_EMAIL=admin@obpcmogi.com.br',
  `ADMIN_PASSWORD_HASH=${escaped}`,
  'SESSION_SECRET=obpc-mogi-dev-session-secret-7f3a9c2e1b8d4a6f0e5c9b2a7d1e4f8c',
  '',
].join('\n');

fs.writeFileSync('.env', env);
console.log('wrote .env');

import { loadEnv } from 'vite';
const loaded = loadEnv('development', process.cwd(), '');
console.log('loaded hash', JSON.stringify(loaded.ADMIN_PASSWORD_HASH));
console.log('loaded compare', bcrypt.compareSync('trocar123', loaded.ADMIN_PASSWORD_HASH));
