import fs from 'fs';

const base = process.env.ADMIN_BASE || 'http://localhost:4330';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login() {
  const loginRes = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@obpcmogi.com.br', password: 'trocar123' }),
  });
  const body = await loginRes.json();
  const setCookie = loginRes.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  console.log('LOGIN', loginRes.status, body);
  if (!loginRes.ok) process.exit(1);
  return cookie;
}

const cookie = await login();

// Edit existing junho (or first from list)
const listRes = await fetch(`${base}/api/admin/comunicados/list`, {
  headers: { Cookie: cookie },
});
const listBody = await listRes.json();
console.log('LIST', listRes.status, 'count', listBody.items?.length);

const junho = listBody.items?.find((i) => i.slug === 'junho') || listBody.items?.[0];
const editRes = await fetch(`${base}/api/admin/comunicados/update`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    slug: junho.slug,
    titulo: junho.titulo.includes('(editado)')
      ? junho.titulo.replace(' (editado)', '')
      : `${junho.titulo} (editado)`,
    dataPublicacao: junho.dataPublicacao.slice(0, 10),
  }),
});
const editBody = await editRes.json();
console.log('EDIT', editRes.status, editBody.item?.titulo);

// Revert edit title for junho if we changed it - actually leave or revert
if (junho.slug === 'junho') {
  await fetch(`${base}/api/admin/comunicados/update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      slug: 'junho',
      titulo: 'Programação de Junho',
      dataPublicacao: '2026-06-01',
    }),
  });
  console.log('EDIT revert junho ok');
}

// Ensure teste-cms exists then delete
if (!fs.existsSync('src/content/comunicados/teste-cms.json')) {
  const form = new FormData();
  form.append('titulo', 'Teste CMS');
  form.append('dataPublicacao', '2026-07-30');
  form.append('imagem', new Blob([png], { type: 'image/png' }), 'teste-cms.png');
  const createRes = await fetch(`${base}/api/admin/comunicados/create`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  });
  console.log('CREATE', createRes.status, await createRes.json());
} else {
  console.log('CREATE skip (já existia)');
}

const delRes = await fetch(`${base}/api/admin/comunicados/delete`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ slug: 'teste-cms' }),
});
console.log('DELETE', delRes.status, await delRes.json());
console.log('json after delete', fs.existsSync('src/content/comunicados/teste-cms.json'));
console.log('img after delete', fs.existsSync('src/assets/comunicados/teste-cms.png'));

// Create again to confirm create still works, then delete again for clean state
const form2 = new FormData();
form2.append('titulo', 'Teste Fluxo Create');
form2.append('dataPublicacao', '2026-07-30');
form2.append('imagem', new Blob([png], { type: 'image/png' }), 'fluxo.png');
const create2 = await fetch(`${base}/api/admin/comunicados/create`, {
  method: 'POST',
  headers: { Cookie: cookie },
  body: form2,
});
const created = await create2.json();
console.log('CREATE2', create2.status, created.item?.slug);

const del2 = await fetch(`${base}/api/admin/comunicados/delete`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ slug: created.item.slug }),
});
console.log('DELETE2', del2.status, await del2.json());

console.log('check-ignore reminder: .gitignore:17:.env');
