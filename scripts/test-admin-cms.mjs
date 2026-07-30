import fs from 'fs';

const base = process.env.ADMIN_BASE || 'http://localhost:4330';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const adminRes = await fetch(`${base}/admin`);
console.log('GET /admin', adminRes.status);

const loginRes = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@obpcmogi.com.br', password: 'trocar123' }),
});
const loginBody = await loginRes.json();
const setCookie = loginRes.headers.getSetCookie?.() || [];
const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');
console.log('POST login', loginRes.status, loginBody);

if (!loginRes.ok) process.exit(1);

const form = new FormData();
form.append('titulo', 'Teste CMS');
form.append('dataPublicacao', '2026-07-30');
form.append('imagem', new Blob([png], { type: 'image/png' }), 'teste-cms.png');

const createRes = await fetch(`${base}/api/admin/comunicados/create`, {
  method: 'POST',
  headers: { Cookie: cookieHeader },
  body: form,
});
const createBody = await createRes.text();
console.log('POST create', createRes.status, createBody);

console.log('json exists', fs.existsSync('src/content/comunicados/teste-cms.json'));
console.log('img exists', fs.existsSync('src/assets/comunicados/teste-cms.png'));
if (fs.existsSync('src/content/comunicados/teste-cms.json')) {
  console.log(fs.readFileSync('src/content/comunicados/teste-cms.json', 'utf8'));
}
