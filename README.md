# open-nfse

Cliente TypeScript/Node.js para o Padrão Nacional de NFS-e (nfse.gov.br), falando direto com a API oficial da Receita Federal.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

## Status

**v0.1** entrega apenas leitura: consulta de NFS-e por chave de acesso, distribuição de DF-e por NSU e parsing completo do XML (RTC v1.01) para objetos tipados. Emissão (v0.2), eventos (v0.3), DANFSe (v0.4) e parâmetros municipais (v0.5) estão no roadmap — veja [ROADMAP.md](./ROADMAP.md). A API pública pode mudar até a 1.0.

## Contexto

A partir de **1º de janeiro de 2026**, toda NFS-e no Brasil passa a ser emitida pelo Padrão Nacional (LC 214/2025), com uma única API mantida pela Receita Federal em substituição aos ~5.570 sistemas municipais.

Este pacote é uma camada fina sobre essa API: mTLS com certificado A1, parsing/geração de XML conforme os XSDs oficiais, e DTOs tipados. Sem gateway intermediário.

## Instalação

```bash
npm install open-nfse
# ou
pnpm add open-nfse
# ou
yarn add open-nfse
```

## Requisitos

- Node.js 20+
- Certificado digital **A1** (ICP-Brasil) do CNPJ emitente em formato `.pfx` ou `.p12`
- CNPJ habilitado no Emissor Nacional com Inscrição Municipal ativa

## Uso

### Configurar o cliente

```typescript
import { NfseClient, Ambiente } from 'open-nfse';
import { readFileSync } from 'node:fs';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita, // ou Ambiente.Producao
  certificado: {
    pfx: readFileSync('./certificado.pfx'),
    password: process.env.CERT_PASSWORD!,
  },
});
```

### Consultar NFS-e por chave de acesso

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

console.log(resultado.chaveAcesso);
console.log(resultado.xmlNfse); // XML assinado pela Sefin (raw string, escape hatch)

// XML totalmente parseado em objetos tipados
const nfse = resultado.nfse;
console.log(nfse.infNFSe.emit.xNome);                     // "VOGA LTDA"
console.log(nfse.infNFSe.valores.vLiq);                   // 51.60
console.log(nfse.infNFSe.DPS.infDPS.serv.cServ.cTribNac); // "250101"

// Discriminated unions para variantes do XSD (xs:choice)
const toma = nfse.infNFSe.DPS.infDPS.toma;
if (toma && 'CPF' in toma.identificador) {
  console.log('Tomador CPF:', toma.identificador.CPF);
}
```

### Distribuição de DF-e por NSU

```typescript
let ultimoNsu = 0; // na primeira vez; depois persista o último retornado

while (true) {
  const r = await cliente.fetchByNsu({ ultimoNsu });
  for (const doc of r.documentos) {
    console.log(doc.nsu, doc.tipoDocumento, doc.chaveAcesso);
    console.log(doc.xmlDocumento); // XML já descomprimido/decodificado
  }
  if (r.ultimoNsu === ultimoNsu) break; // sem novos documentos
  ultimoNsu = r.ultimoNsu;
}
await cliente.close(); // libera o dispatcher mTLS
```

> **Comportamento do ADN.** `/DFe/{NSU}` devolve **HTTP 404 com body** quando não há documentos pendentes e **HTTP 400 com body** em caso de rejeição. Nenhum dos dois é erro HTTP — ambos carregam a mesma resposta `NsuQueryResult`. `fetchByNsu` trata isso automaticamente: **não lança** `NotFoundError`, retorna o resultado com `status === 'NENHUM_DOCUMENTO_LOCALIZADO'` ou `'REJEICAO'`.
>
> Mesmo no caminho "caught up", a Receita inclui uma mensagem informativa em `erros` (ex. `E2220 — Nenhum documento localizado`). A fonte de verdade é o campo `status`; `erros[]` pode carregar avisos mesmo em sucesso.

### Ainda não implementado

Itens no roadmap que **ainda não existem** na v0.1:

- `cliente.emitir({...})` — emissão síncrona de NFS-e (v0.2)
- `cliente.cancelar({...})` e demais eventos (v0.3)
- `cliente.gerarDanfse(chave)` — PDF local (v0.4)
- Parâmetros municipais com cache (v0.5)
- `NfseClientFake` em `open-nfse/testing` (v0.6)

## Princípios de design

1. **DTO in, DTO out.** Callers não veem XML, GZip, Base64, mTLS ou XMLDSig. O `xmlNfse` raw é exposto em `NfseQueryResult` como escape hatch.
2. **Erros tipados.** Hierarquia em três níveis (`Error` → `OpenNfseError` → grupo → concreto): `ExpiredCertificateError`, `NotFoundError`, `ReceitaRejectionError`, etc.
3. **Sem estado.** Nenhum banco, framework ou estado global. É biblioteca, não sistema.
4. **Schema-driven.** Types derivam dos XSDs oficiais (RTC v1.01). `xs:choice` vira discriminated union em TS.
5. **Identificadores como `string`** (CNPJ, CPF, CEP, cMun, cTribNac) para preservar zeros à esquerda. Decimais como `number` — consumidores que precisam de aritmética fiscal exata devem envolver em Decimal.js.
6. **Builder de DPS separável do transporte** (v0.2). Validar e gerar XML assinado sem enviar, para preview e testes.
7. **Provider de certificado pluggable.** Interface `CertificateProvider`; implementações para arquivo, buffer e futuros KMS/Vault.

## Arquitetura

```
┌──────────────────────────────────────────────┐
│            API pública (NfseClient)          │
├──────────────────────────────────────────────┤
│   NFS-e                │   DF-e (distribuição)│
│   fetch-by-chave       │   fetch-by-nsu       │
│                        │                      │
│   parser XML → domínio tipado (RTC v1.01)    │
├──────────────────────────────────────────────┤
│   HTTP client (undici + mTLS, GZip/Base64)   │
├──────────────────────────────────────────────┤
│   Certificado A1 (node-forge, ICP-Brasil)    │
└──────────────────────────────────────────────┘
```

A API oficial está dividida em **hosts distintos** (SEFIN Nacional e ADN Contribuintes) com contratos wire diferentes — camelCase vs PascalCase, `tipoAmbiente` int vs string. O `NfseClient` resolve o host correto por chamada e os DTOs públicos normalizam para uma única convenção.

## Ambientes

| Ambiente | SEFIN Nacional (consulta por chave, emissão) | ADN Contribuintes (DF-e por NSU) |
|---|---|---|
| **Produção Restrita** (homologação) | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `adn.producaorestrita.nfse.gov.br/contribuintes` |
| **Produção** (notas válidas) | `sefin.nfse.gov.br/SefinNacional` | `adn.nfse.gov.br/contribuintes` |

## Roadmap

Plano completo em [ROADMAP.md](./ROADMAP.md).

- **v0.1** — consulta por chave, distribuição por NSU, parser RTC v1.01 *(shipped)*
- **v0.2** — emissão síncrona de NFS-e
- **v0.3** — eventos (cancelamento, substituição)
- **v0.4** — geração local de DANFSe (PDF)
- **v0.5** — parâmetros municipais com cache
- **v1.0** — API pública estável, cobertura do manual v1.2

## Status dos municípios

Todo município é obrigado a aderir ao Padrão Nacional, mas a migração é gradual ao longo de 2026. A lib funciona com **qualquer município aderente** — a API é a mesma. Para municípios ainda não aderentes, é necessário usar o sistema municipal até a migração.

## Contribuindo

Bugs e sugestões: abra uma [issue](https://github.com/fm-s/open-nfse/issues). PRs são bem-vindos — rode `npm run lint && npm run typecheck && npm test` antes de abrir.

## Créditos

Desenvolvido por [Felipe Souza](https://github.com/fm-s) com auxílio do [Claude Code](https://claude.com/claude-code) (Anthropic) na escrita, revisão e parsing dos XSDs do Padrão Nacional.

## Licença

MIT © [Felipe Souza](https://github.com/fm-s)

## Links úteis

- [Portal oficial NFS-e Nacional](https://www.gov.br/nfse/pt-br)
- [Documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Manual do Contribuinte (v1.2)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
- [Lei Complementar 214/2025](https://www.planalto.gov.br/)

## Aviso legal

Biblioteca **não oficial**, sem vínculo com a Receita Federal do Brasil. Software open source, distribuído sob licença MIT, sem garantias. Homologação e conformidade fiscal são responsabilidade de quem utiliza.
