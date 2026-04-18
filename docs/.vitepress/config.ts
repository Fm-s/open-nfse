import { type DefaultTheme, defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };

// Ajuste o `base` para o nome do repo quando publicar em GitHub Pages.
// Exemplo: https://fm-s.github.io/open-nfse/  →  base = '/open-nfse/'
const BASE = '/open-nfse/';

export default defineConfig({
  title: 'open-nfse',
  description:
    'Biblioteca TypeScript/Node.js para o Padrão Nacional de NFS-e (nfse.gov.br) — consulta, emissão, eventos, tudo direto na API oficial da Receita Federal.',
  lang: 'pt-BR',
  base: BASE,
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#1f6feb' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'open-nfse' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Cliente TypeScript/Node.js para o Padrão Nacional de NFS-e — consulta, emissão, eventos e validações.',
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: 'Guia', link: '/guide/introducao' },
      { text: 'API', link: '/api/' },
      {
        text: 'Links',
        items: [
          { text: 'npm', link: 'https://www.npmjs.com/package/open-nfse' },
          { text: 'GitHub', link: 'https://github.com/fm-s/open-nfse' },
          { text: 'Changelog', link: 'https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md' },
          { text: 'Portal NFS-e', link: 'https://www.gov.br/nfse/pt-br' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introdução',
          items: [
            { text: 'O que é', link: '/guide/introducao' },
            { text: 'Começando', link: '/guide/getting-started' },
            { text: 'Princípios de design', link: '/guide/principios' },
          ],
        },
        {
          text: 'Uso',
          items: [
            { text: 'Consultar NFS-e', link: '/guide/consultar' },
            { text: 'Emitir NFS-e', link: '/guide/emitir' },
            { text: 'Substituir e cancelar', link: '/guide/substituir-cancelar' },
            { text: 'Validações', link: '/guide/validacoes' },
            { text: 'Parâmetros municipais', link: '/guide/parametros' },
            { text: 'DANFSe (PDF)', link: '/guide/danfse' },
          ],
        },
        {
          text: 'Operação',
          items: [
            { text: 'Integração em serviços', link: '/guide/integracao' },
            { text: 'Erros tipados', link: '/guide/erros' },
            { text: 'Ambientes e endpoints', link: '/guide/ambientes' },
            { text: 'Testando com o fake', link: '/guide/testing' },
          ],
        },
      ],
      '/api/': [
        { text: 'Overview', link: '/api/' },
        ...(typedocSidebar as DefaultTheme.SidebarItem[]),
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/fm-s/open-nfse' }],

    footer: {
      message: 'Licença MIT — biblioteca não oficial, sem vínculo com a Receita Federal.',
      copyright: `© ${new Date().getFullYear()} Felipe Souza`,
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/fm-s/open-nfse/edit/main/docs/:path',
      text: 'Editar esta página no GitHub',
    },

    outline: {
      level: [2, 3],
      label: 'Nesta página',
    },
  },

  // TypeDoc escreve para docs/api — VitePress scaneia e usa como páginas.
  // Os arquivos ficam gitignorados (regenerados em cada build).
  ignoreDeadLinks: 'localhostLinks',
});
