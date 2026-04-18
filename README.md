# open-nfse

Cliente TypeScript/Node.js para o Padrão Nacional de NFS-e (nfse.gov.br), falando direto com a API oficial da Receita Federal.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**📚 Documentação completa em [fm-s.github.io/open-nfse](https://fm-s.github.io/open-nfse/)** — guias, API reference auto-gerada do código, schema de integração em SQL, princípios de design.

## Status

**v0.7 — feature-complete** para o ciclo fiscal completo: consulta (chave + NSU), emissão segura com `DpsCounter`, cancelamento e substituição com máquina de 4 estados + rollback automático, `RetryStore` pluggable para falhas transientes, validações locais (XSD / CPF+CNPJ / CEP), parâmetros municipais com cache, DANFSe em PDF (online com fallback para renderer local) e `NfseClientFake` em `open-nfse/testing` para testes. Agora o foco é estabilização até 1.0 — a API pública pode receber ajustes até lá.

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

### Emitir NFS-e

A emissão "segura" (default, a partir da v0.4) recebe params de alto nível (sem `nDPS`), roda as validações offline primeiro e **só então** consulta o `DpsCounter` — uma DPS quebrada nunca queima um número de série. Retorna um resultado discriminado: `ok` em caso de autorização, `retry_pending` em falha transiente (persistido no `RetryStore` para replay), throw em rejeições permanentes.

```typescript
import {
  NfseClient,
  Ambiente,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  ReceitaRejectionError,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: provider,
  dpsCounter: createInMemoryDpsCounter(),     // produção: wrap seu DB (UPDATE ... RETURNING)
  retryStore: createInMemoryRetryStore(),     // produção: wrap seu DB (upsert/list/delete)
});

try {
  const r = await cliente.emitir({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
    valores: { vServ: 1500.0, aliqIss: 2.5 },
    tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
  });

  if (r.status === 'ok') {
    console.log(r.nfse.chaveAcesso);          // 50 dígitos
    console.log(r.nfse.nfse.infNFSe.nNFSe);   // número sequencial no município
    console.log(r.nfse.xmlNfse);              // XML oficial assinado pela Sefin
  } else if (r.status === 'retry_pending') {
    // Falha de rede/timeout/5xx — já persistido no retryStore.
    // Um cron que chama cliente.replayPendingEvents() re-POSTa idempotentemente.
    console.warn('Pendente para replay:', r.pending.id);
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // Rejeição permanente — o nDPS foi consumido, a nota foi definitivamente rejeitada.
    console.error(`[${err.codigo}] ${err.descricao}`);
    for (const m of err.mensagens.slice(1)) console.error(`  + [${m.codigo}] ${m.descricao}`);
  } else {
    throw err;
  }
}
```

Dry-run continua disponível para preview sem enviar:

```typescript
const preview = await cliente.emitir({ ...params, dryRun: true });
console.log(preview.xmlDpsAssinado);      // XML assinado pronto para inspeção
console.log(preview.xmlDpsGZipB64);       // payload GZip+Base64 pronto para POST manual
```

### Escape hatch — `emitirDpsPronta(dps)`

Para quando você já tem uma `DPS` completamente montada (replay customizado, testes determinísticos, fluxos que bypassam o counter):

```typescript
import { buildDps } from 'open-nfse';

const dps = buildDps({ ...params, nDPS: '42' });
const r = await cliente.emitirDpsPronta(dps);   // throw em tudo, sem counter, sem retry store
```

### Emissão em lote

O SEFIN não tem endpoint de batch — `emitirEmLote` paraleliza no cliente, com concorrência configurável, e nunca derruba o lote inteiro por uma falha individual. Recebe `DPS[]` já montado (use `buildDps` para cada):

```typescript
const r = await cliente.emitirEmLote([dps1, dps2, dps3], { concurrency: 2 });

console.log(`${r.successCount} ok / ${r.failureCount} falhas / ${r.skippedCount} skips`);

for (const item of r.items) {
  if (item.status === 'success')  console.log('ok:', item.result.chaveAcesso);
  if (item.status === 'failure')  console.log('fail:', item.error.message);
  if (item.status === 'skipped')  console.log('skipped (stopOnError ativo)');
}
```

### Cancelar, substituir e DANFSe

```typescript
// Cancelar uma NFS-e (evento 101101)
const c = await cliente.cancelar({
  chaveAcesso: '21113002200574753000100000000000146726037032711025',
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaCancelamento.ErroEmissao,
  xMotivo: 'Valor digitado incorretamente',
});

// Substituir (emite nova + cancela original via 105102, com rollback automático)
const s = await cliente.substituir({
  chaveOriginal: chave,
  novaDps: buildDps({ ...params }),
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaSubstituicao.Outros,
  xMotivo: 'Correção de valor',
});

// DANFSe PDF — default auto (ADN online → fallback local)
const pdf = await cliente.gerarDanfse(nfse);    // Buffer
await fs.writeFile('danfse.pdf', pdf);
```

Exemplos runnables em [`examples/emit-nfse/`](./examples/emit-nfse/).

### Integração em serviços

A lib não tem **estado interno** (sem DB, cache global ou singleton escondido), mas oferece primitives de **orquestração** (`emitirEmLote`, máquina de compensação de `substituir`) e **retry** (`RetryStore` pluggable, `replayPendingEvents`). Persistência durável, CRON e reconciliação ficam com seu serviço. O guia [Integração em serviços](https://fm-s.github.io/open-nfse/guide/integracao) traz um schema SQL completo (PostgreSQL) para persistir submissions, NFS-e autorizadas, cursor de NSU, eventos e o backing store para o `RetryStore`.

### Testando seu serviço

`open-nfse/testing` exporta um `NfseClientFake` em memória, estruturalmente compatível com `NfseClient` (via `NfseClientLike`):

```typescript
import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing';

const fake = new NfseClientFake();
fake.seed.emitir({ chaveAcesso, nfse });           // programa respostas
const r = await fake.emitir({ ...params });
```

Detalhes em [fm-s.github.io/open-nfse/guide/testing](https://fm-s.github.io/open-nfse/guide/testing).

## Princípios de design

1. **DTO in, DTO out.** Callers não veem XML, GZip, Base64, mTLS ou XMLDSig. O `xmlNfse` raw é exposto em `NfseQueryResult` como escape hatch.
2. **Erros tipados.** Hierarquia em três níveis (`Error` → `OpenNfseError` → grupo → concreto): `ExpiredCertificateError`, `NotFoundError`, `ReceitaRejectionError`, etc.
3. **Sem estado interno, com primitives de orquestração e retry.** A lib não tem banco, cache global ou singleton escondido, mas oferece `emitirEmLote` (worker pool), `substituir` (máquina de compensação) e `RetryStore` + `replayPendingEvents`. Persistência durável fica com seu serviço.
4. **Schema-driven.** Types derivam dos XSDs oficiais (RTC v1.01). `xs:choice` vira discriminated union em TS.
5. **Identificadores como `string`** (CNPJ, CPF, CEP, cMun, cTribNac) para preservar zeros à esquerda. Decimais como `number` — consumidores que precisam de aritmética fiscal exata devem envolver em Decimal.js.
6. **Builder de DPS separável do transporte** (v0.2). Validar e gerar XML assinado sem enviar, para preview e testes.
7. **Provider de certificado pluggable.** Interface `CertificateProvider`; implementações para arquivo, buffer e futuros KMS/Vault.

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

A API oficial está dividida em **quatro hosts distintos** (SEFIN Nacional, ADN Contribuintes, ADN DANFSe, ADN Parâmetros Municipais) com contratos wire diferentes — camelCase vs PascalCase, `tipoAmbiente` int vs string. O `NfseClient` resolve o host correto por chamada e os DTOs públicos normalizam para uma única convenção.

## Ambientes

| Serviço | Produção Restrita (homologação) | Produção (notas válidas) |
|---|---|---|
| **SEFIN Nacional** (consulta por chave, emissão, eventos) | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `sefin.nfse.gov.br/SefinNacional` |
| **ADN Contribuintes** (DF-e por NSU) | `adn.producaorestrita.nfse.gov.br/contribuintes` | `adn.nfse.gov.br/contribuintes` |
| **ADN DANFSe** (PDF oficial) | `adn.producaorestrita.nfse.gov.br/danfse` | `adn.nfse.gov.br/danfse` |
| **ADN Parâmetros Municipais** | `adn.producaorestrita.nfse.gov.br/parametrizacao` | `adn.nfse.gov.br/parametrizacao` |

## Roadmap

- **v0.1** — consulta por chave, distribuição por NSU, parser RTC v1.01 *(shipped)*
- **v0.2** — emissão síncrona + emissão em lote + dry-run *(shipped)*
- **v0.3** — eventos (cancelamento + substituição com máquina de 4 estados + `RetryStore`) *(shipped)*
- **v0.4** — fluxo seguro de emissão com `DpsCounter` e integração do `RetryStore` *(shipped)*
- **v0.5** — parâmetros municipais com cache pluggable *(shipped)*
- **v0.6** — `NfseClientFake` em `open-nfse/testing` *(shipped)*
- **v0.7** — DANFSe em PDF (fetch ADN + renderer local com fallback automático) *(shipped)*
- **v1.0** — API pública estável, cobertura do manual v1.2

Histórico completo no [CHANGELOG.md](./CHANGELOG.md).

## Status dos municípios

Todo município é obrigado a aderir ao Padrão Nacional, mas a migração é gradual ao longo de 2026. A lib funciona com **qualquer município aderente** — a API é a mesma. Para municípios ainda não aderentes, é necessário usar o sistema municipal até a migração.

## Contribuindo

Bugs e sugestões: abra uma [issue](https://github.com/fm-s/open-nfse/issues). PRs são bem-vindos — rode `npm run lint && npm run typecheck && npm test` antes de abrir.

## Links úteis

- [Portal oficial NFS-e Nacional](https://www.gov.br/nfse/pt-br)
- [Documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Manual do Contribuinte (v1.2)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
- [Lei Complementar 214/2025](https://www.planalto.gov.br/)

## Aviso legal

Biblioteca **não oficial**, sem vínculo com a Receita Federal do Brasil. Software open source, distribuído sob licença MIT, sem garantias. Homologação e conformidade fiscal são responsabilidade de quem utiliza.
