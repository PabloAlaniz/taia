import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://pabloalaniz.github.io',
  base: '/taia/',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'TAIA',
      description: 'Tablero open-source para coordinar equipos de agentes IA.',
      logo: { src: './src/assets/taia.svg' },
      defaultLocale: 'root',
      locales: { root: { label: 'Español', lang: 'es' } },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/PabloAlaniz/taia' }],
      editLink: { baseUrl: 'https://github.com/PabloAlaniz/taia/edit/main/apps/docs/' },
      lastUpdated: false,
      sidebar: [
        {
          label: 'Inicio',
          items: [
            { label: 'Qué es TAIA', link: '/' },
            { slug: 'inicio/instalacion' },
            { slug: 'inicio/elegir-setup' },
          ],
        },
        { label: 'Conceptos', items: [{ autogenerate: { directory: 'conceptos' } }] },
        { label: 'Guías', items: [{ autogenerate: { directory: 'guias' } }] },
        { label: 'Runtimes', items: [{ autogenerate: { directory: 'runtimes' } }] },
        { label: 'Referencia', items: [{ autogenerate: { directory: 'referencia' } }] },
        { slug: 'problemas' },
        {
          label: 'Arquitectura',
          items: [
            { slug: 'arquitectura/vision-general' },
            { slug: 'arquitectura/modelo-de-contexto' },
            { label: 'ADRs', items: [{ autogenerate: { directory: 'arquitectura/adr' } }] },
          ],
        },
        { slug: 'roadmap' },
      ],
    }),
  ],
})
