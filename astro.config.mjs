import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://obpcmogi.com.br',
  output: 'static',
  adapter: vercel({
    maxDuration: 10,
  }),
  security: {
    allowedDomains: [
      { hostname: 'obpcmogi.com.br', protocol: 'https' },
      { hostname: 'www.obpcmogi.com.br', protocol: 'https' },
      { hostname: '*.vercel.app', protocol: 'https' },
    ],
  },
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
