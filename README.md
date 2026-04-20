# open-nfse

Cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br) — a API unificada da Receita Federal, obrigatória em todo o Brasil a partir de 1º de janeiro de 2026 (LC 214/2025). Fala direto na API oficial, sem gateway intermediário.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**📚 Documentação:** [fm-s.github.io/open-nfse](https://fm-s.github.io/open-nfse/) · [API cheat sheet](https://fm-s.github.io/open-nfse/api-cheatsheet) · [API completa](https://fm-s.github.io/open-nfse/api/)

## Status

**v0.7.1 — feature-complete.** Ciclo fiscal completo: consulta (chave + NSU), emissão segura com `DpsCounter` + `RetryStore`, cancelamento e substituição com máquina de 4 estados, validações locais (XSD / CPF+CNPJ / CEP), parâmetros municipais com cache, DANFSe em PDF (online + fallback local), `NfseClientFake` em `open-nfse/testing`. Foco até 1.0 é estabilização; a API pública pode receber ajustes, sem breaking changes sem aviso em CHANGELOG.

## Instalar

```bash
npm install open-nfse
```

Requer Node.js 20+ e certificado digital A1 (ICP-Brasil) em `.pfx` ou `.p12` do CNPJ emitente habilitado no Emissor Nacional.

## Exemplo mínimo

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
  OpcaoSimplesNacional, RegimeEspecialTributacao,
  ReceitaRejectionError,
} from 'open-nfse';
import { readFileSync } from 'node:fs';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
  dpsCounter: createInMemoryDpsCounter(),   // produção: UPDATE ... RETURNING no DB
  retryStore: createInMemoryRetryStore(),   // produção: tabela de pendentes
});

try {
  const r = await cliente.emitir({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: { opSimpNac: OpcaoSimplesNacional.MeEpp, regEspTrib: RegimeEspecialTributacao.Nenhum },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
    valores: { vServ: 1500.0, aliqIss: 2.5 },
    tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
  });

  if (r.status === 'ok') console.log(r.nfse.chaveAcesso);
  else if (r.status === 'retry_pending') console.warn('Pendente:', r.pending.id);
} catch (err) {
  if (err instanceof ReceitaRejectionError) console.error(`[${err.codigo}] ${err.descricao}`);
  else throw err;
}
```

Exemplos runnables em [`examples/emit-nfse/`](./examples/emit-nfse/). Para `fetchByChave`, `fetchByNsu`, `cancelar`, `substituir`, `gerarDanfse` e `NfseClientFake`, veja a [documentação](https://fm-s.github.io/open-nfse/).

## O que a lib cobre

| Escopo                                  | Guia                                                                 |
|-----------------------------------------|----------------------------------------------------------------------|
| Consulta por chave + distribuição por NSU | [Consultar](https://fm-s.github.io/open-nfse/guide/consultar)      |
| Emissão segura com counter + retry store | [Emitir](https://fm-s.github.io/open-nfse/guide/emitir)             |
| Cancelamento e substituição (4 estados) | [Substituir e cancelar](https://fm-s.github.io/open-nfse/guide/substituir-cancelar) |
| Validações XSD + CPF/CNPJ + CEP         | [Validações](https://fm-s.github.io/open-nfse/guide/validacoes)     |
| Parâmetros municipais com cache         | [Parâmetros](https://fm-s.github.io/open-nfse/guide/parametros)     |
| DANFSe em PDF (online + local)          | [DANFSe](https://fm-s.github.io/open-nfse/guide/danfse)             |
| Dublê em memória para testes            | [Testing](https://fm-s.github.io/open-nfse/guide/testing)           |
| Schema SQL sugerido para integração     | [Integração em serviços](https://fm-s.github.io/open-nfse/guide/integracao) |

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│   API pública (NfseClient + open-nfse/testing)             │
├────────────────────────────────────────────────────────────┤
│  Leitura            │  Emissão        │  Eventos            │
│  fetch-by-chave     │  emitir         │  cancelar           │
│  fetch-by-nsu       │  emitir-em-lote │  substituir (4-st)  │
│                     │  emitirDpsPronta│  replayPendingEvents│
│                                                            │
│  parse-xml ↔ build-xml + sign-xml (RTC v1.01 ↔ DTO)         │
│  build-dps (helper) + dps-id + validate-xml (XSD WASM)      │
├────────────────────────────────────────────────────────────┤
│  Validações: CPF/CNPJ DV · CEP (ViaCEP)                    │
│  Parâmetros municipais (6× consultar + cache)              │
│  DANFSe: fetch (ADN) + gerar (pdfkit local)                │
├────────────────────────────────────────────────────────────┤
│  HTTP client (undici + mTLS + HTTP/1.1, GZip/Base64, PDF)  │
├────────────────────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil, pluggable)        │
└────────────────────────────────────────────────────────────┘
```

A API oficial está dividida em **quatro hosts distintos** (SEFIN Nacional, ADN Contribuintes, ADN DANFSe, ADN Parâmetros Municipais) com contratos wire diferentes — camelCase vs PascalCase, `tipoAmbiente` int vs string. O `NfseClient` resolve o host por chamada; DTOs públicos normalizam.

## Princípios

DTO in, DTO out. Erros tipados em 3 níveis. Sem estado interno, com primitives de orquestração (`emitirEmLote`, máquina de 4 estados de `substituir`) e retry (`RetryStore` + `replayPendingEvents`). Types derivados dos XSDs RTC v1.01 oficiais; `xs:choice` vira discriminated union. Identificadores fiscais como `string` para preservar zeros. Builder de DPS separável do transporte (dry-run). Detalhes em [Princípios de design](https://fm-s.github.io/open-nfse/guide/principios).

## Ambientes

| Serviço                        | Produção Restrita (homologação)                    | Produção (notas válidas)                  |
|--------------------------------|----------------------------------------------------|-------------------------------------------|
| SEFIN Nacional                 | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `sefin.nfse.gov.br/SefinNacional`         |
| ADN Contribuintes              | `adn.producaorestrita.nfse.gov.br/contribuintes`   | `adn.nfse.gov.br/contribuintes`           |
| ADN DANFSe                     | `adn.producaorestrita.nfse.gov.br/danfse`          | `adn.nfse.gov.br/danfse`                  |
| ADN Parâmetros Municipais      | `adn.producaorestrita.nfse.gov.br/parametrizacao`  | `adn.nfse.gov.br/parametrizacao`          |

## Status dos municípios

Todo município é obrigado a aderir ao Padrão Nacional, mas a migração é gradual ao longo de 2026. A lib funciona com qualquer município aderente — a API é a mesma. Municípios ainda não aderentes continuam no sistema municipal até a migração.

## Contribuindo

Bugs e sugestões: [issues](https://github.com/fm-s/open-nfse/issues). PRs bem-vindos — rode `npm run lint && npm run typecheck && npm test` antes de abrir. Histórico de versões no [CHANGELOG.md](./CHANGELOG.md).

## Links

- [Portal oficial NFS-e Nacional](https://www.gov.br/nfse/pt-br)
- [Documentação técnica da Receita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Manual do Contribuinte v1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
- [Lei Complementar 214/2025](https://www.planalto.gov.br/)

## Aviso legal

Biblioteca **não oficial**, sem vínculo com a Receita Federal do Brasil. Software open source, distribuído sob licença MIT, sem garantias. Homologação e conformidade fiscal são responsabilidade de quem utiliza.
