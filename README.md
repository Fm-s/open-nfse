# open-nfse

Cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br) — a API unificada da Receita Federal, obrigatória em todo o Brasil a partir de 1º de janeiro de 2026 (LC 214/2025). Fala direto na API oficial, sem gateway intermediário.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**📚 Documentação:** [fm-s.github.io/open-nfse](https://fm-s.github.io/open-nfse/) · [API cheat sheet](https://fm-s.github.io/open-nfse/api-cheatsheet) · [API completa](https://fm-s.github.io/open-nfse/api/)

## Status

**v0.11.0 — ciclo fiscal completo, alinhado ao leiaute vigente em produção** (RTC v1.01, bundle XSD **20260727** — inclui **CNPJ alfanumérico**, em produção desde 10/08/2026). Consulta (chave + NSU), emissão segura com `DpsCounter` + `RetryStore`, cancelamento (101101) e substituição (DPS com `<subst>`; o sistema gera o 105102), validações locais (XSD / CPF+CNPJ com DV alfanumérico / CEP), guards fail-fast de emissão (choice `totTrib` por regime, E0595/E0600/E0580 etc.), parâmetros municipais com cache, DANFSe em PDF (renderer local), `NfseClientFake` em `open-nfse/testing`. Pipeline de retry consciente de 429 (`TooManyRequestsError` → `retry_pending` com `notBefore` honrando `Retry-After`; `RetryPolicy` pluggable).

Histórico por versão (auditorias de conformidade, breaking renames pré-1.0, detalhes de cada release) no [CHANGELOG](./CHANGELOG.md).

**⚠️ Radar do padrão (ago/2026):** o **CNPJ alfanumérico** está **em produção desde 10/08/2026** (bundle XSD `esquemas-nfse-rtc-v1-01-20260727`, adotado pela lib na v0.11.0 — validação XSD, builders de Id e consultas por chave já aceitam `[0-9A-Z]` na inscrição). Os grupos **IBS/CBS** são obrigatórios desde **03/08/2026** no **leiaute já vigente** (NT 004 + `tpRetPisCofins` da NT 007), que a lib cobre por completo — mas a orientação CGNFS-e de 07/08/2026 dá tolerância: a ausência do grupo **não rejeita o documento até 31/12/2026** (destaque escalonado: 01/10/2026, 01/12/2026, 01/01/2027 para optantes do Simples que aderirem). O **Simples Nacional** teve a obrigatoriedade de emissão pelo Emissor Nacional **prorrogada de 01/09 para 01/11/2026** (Resolução CGSN nº 191). A **NT 009/2026** (leiaute V1.04.00: notas de crédito/débito IBS/CBS, `vAjusteBC`, `gPgtoVinc`, locação) segue **adiada** — cronograma ainda sem data. **NT 008/2026** (v1.02): a API oficial de geração do DANFSe foi **suspensa em 03/08/2026** — desde a v0.10.1 o default de `gerarDanfse` é `'local'` e o caminho online (`'auto'`/`'online'`/`consultarDanfse`) está deprecated; a adequação do renderer local ao novo leiaute nacional multi-tributo da NT 008 está no roadmap. Acompanhamento e roteiro de verificação em [`specs/standards-watch.md`](./specs/standards-watch.md).

Foco até 1.0 é estabilização; a API pública pode receber ajustes, sem breaking changes sem aviso em CHANGELOG.

## Instalar

```bash
npm install open-nfse
```

Requer Node.js 20+ e certificado digital A1 (ICP-Brasil) em `.pfx` ou `.p12` do CNPJ emitente habilitado no Emissor Nacional.

## Exemplo mínimo

Setup do cliente com counter atômico de `nDPS` e store de retry (in-memory para início rápido; produção usa Postgres):

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';
import { readFileSync } from 'node:fs';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
  dpsCounter: createInMemoryDpsCounter(),
  retryStore: createInMemoryRetryStore(),
});
```

Emissão com resultado discriminado (`ok` autorizada, `retry_pending` salvo no store, throw em rejeição permanente):

```typescript
import {
  OpcaoSimplesNacional, RegimeApuracaoSimplesNacional, RegimeEspecialTributacao,
  ReceitaRejectionError,
} from 'open-nfse';

try {
  const r = await cliente.emitir({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
    // totTrib por regime: ME/EPP → pTotTribSN; MEI → indTotTrib (auto); Não Optante → vTotTrib/pTotTrib.
    valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
    tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
  });

  if (r.status === 'ok') {
    console.log('autorizada:', r.nfse.chaveAcesso);
  } else {
    console.warn('pendente no store:', r.pending.id);
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    console.error(`rejeitada [${err.codigo}]: ${err.descricao}`);
  } else {
    throw err;
  }
}
```

Cron de retry (mesma função cobre `emitir`, `cancelar`, `substituir`):

```typescript
// schedule: a cada 1-5 minutos, um worker só
const items = await cliente.replayPendingEvents();
for (const item of items) {
  if (item.status === 'success_emission') await persistirNfse(item.emission);
  if (item.status === 'success')          await persistirEvento(item.evento);
  if (item.status === 'failed_permanent') alertar(item);
  // still_pending fica no store para próxima rodada
}
```

Exemplos runnables em [`examples/emit-nfse/`](./examples/emit-nfse/). Padrão completo de produção (persistência, bulk com counter+retry, reconciliação) em [Emitir NFS-e](https://fm-s.github.io/open-nfse/guide/emitir).

## O que a lib cobre

| Escopo                                  | Guia                                                                 |
|-----------------------------------------|----------------------------------------------------------------------|
| Consulta por chave + distribuição por NSU | [Consultar](https://fm-s.github.io/open-nfse/guide/consultar)      |
| Emissão segura com counter + retry store | [Emitir](https://fm-s.github.io/open-nfse/guide/emitir)             |
| Cancelamento e substituição | [Substituir e cancelar](https://fm-s.github.io/open-nfse/guide/substituir-cancelar) |
| Validações XSD + CPF/CNPJ + CEP         | [Validações](https://fm-s.github.io/open-nfse/guide/validacoes)     |
| Parâmetros municipais com cache         | [Parâmetros](https://fm-s.github.io/open-nfse/guide/parametros)     |
| DANFSe em PDF (renderer local)          | [DANFSe](https://fm-s.github.io/open-nfse/guide/danfse)             |
| Dublê em memória para testes            | [Testing](https://fm-s.github.io/open-nfse/guide/testing)           |
| Schema SQL sugerido para integração     | [Integração em serviços](https://fm-s.github.io/open-nfse/guide/integracao) |

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│   API pública (NfseClient + open-nfse/testing)             │
├────────────────────────────────────────────────────────────┤
│  Leitura            │  Emissão        │  Eventos            │
│  fetch-by-chave     │  emitir         │  cancelar           │
│  fetch-by-nsu       │  emitir-em-lote │  substituir         │
│                     │  emitirDpsPronta│  replayPendingEvents│
│                                                            │
│  Retry pipeline (429-aware): PendingEvent + RetryStore +   │
│   RetryPolicy (notBefore + attempts + safe-wrap)           │
│                                                            │
│  parse-xml ↔ build-xml + sign-xml (RTC v1.01 ↔ DTO)         │
│  build-dps (helper) + dps-id + validate-xml (XSD WASM)      │
├────────────────────────────────────────────────────────────┤
│  Validações: CPF/CNPJ DV · CEP (ViaCEP)                    │
│  Parâmetros municipais (6× consultar + cache)              │
│  DANFSe: fetch (ADN) + gerar (pdfkit local)                │
├────────────────────────────────────────────────────────────┤
│  HTTP client (undici + mTLS + HTTP/1.1, GZip/Base64, PDF)  │
│  · TooManyRequestsError (429) + getRetryAfterMs()          │
├────────────────────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil, pluggable)        │
└────────────────────────────────────────────────────────────┘
```

A API oficial está dividida em **quatro hosts distintos** (SEFIN Nacional, ADN Contribuintes, ADN DANFSe, ADN Parâmetros Municipais) com contratos wire diferentes — camelCase vs PascalCase, `tipoAmbiente` int vs string. O `NfseClient` resolve o host por chamada; DTOs públicos normalizam.

## Princípios

DTO in, DTO out. Erros tipados em 3 níveis. Sem estado interno, com primitives de orquestração (`emitirEmLote`) e retry (`RetryStore` + `RetryPolicy` + `replayPendingEvents`). Types derivados dos XSDs RTC v1.01 oficiais; `xs:choice` vira discriminated union. Identificadores fiscais como `string` para preservar zeros. Builder de DPS separável do transporte (dry-run). Detalhes em [Princípios de design](https://fm-s.github.io/open-nfse/guide/principios).

## Ambientes

| Serviço                        | Produção Restrita (homologação)                    | Produção (notas válidas)                  |
|--------------------------------|----------------------------------------------------|-------------------------------------------|
| SEFIN Nacional                 | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `sefin.nfse.gov.br/SefinNacional`         |
| ADN Contribuintes              | `adn.producaorestrita.nfse.gov.br/contribuintes`   | `adn.nfse.gov.br/contribuintes`           |
| ADN DANFSe                     | `adn.producaorestrita.nfse.gov.br/danfse`          | `adn.nfse.gov.br/danfse`                  |
| ADN Parâmetros Municipais      | `adn.producaorestrita.nfse.gov.br/parametrizacao`  | `adn.nfse.gov.br/parametrizacao`          |

## Status dos municípios

Todo município é obrigado a aderir ao Padrão Nacional, mas a migração é gradual ao longo de 2026. A lib funciona com qualquer município aderente — a API é a mesma. Municípios ainda não aderentes continuam no sistema municipal até a migração.

## Escopo explícito

**Suportado:** consulta (chave + NSU), emissão segura (`emitir(params)`), eventos 101101 e 105102 (cancelamento + substituição) como emissão; parse de todos os 16 tipos de eventos via NSU distribuição (inclusive confirmação/rejeição P/T/I, cancelamento por ofício); validações locais; parâmetros municipais; DANFSe PDF; `fetchDpsStatus` para reconciliação.

**Fora de escopo** (intencional):
- **`POST /decisao-judicial/nfse`** — backs the **Emissor Público Web UI** per Guia v1.2 §4.3, não é uma API de contribuinte. Emissão por decisão judicial acontece via UI Web da Receita, não via lib.
- **CNC** (Cadastro Nacional de Contribuintes) — schemas `CNC_v1.00.xsd` / `tiposCnc_v1.00.xsd` não são referenciados pelo fluxo NFS-e; fora do escopo.
- **Emissão dos 14 tipos de evento "não-cancelamento"** (202201 etc.) — parseamos quando chegam via NSU, mas não há builders públicos. Município-only em sua maioria; abra uma issue se precisar.
- **ADN Parâmetros Municipais — endpoints POST** (`beneficiomunicipal/{idManut}`, `regimes_especiais/{idManut}`, `retencoes/{idManut}`) — admin-only da municipalidade.

**Backlog** (worth wrapping antes de 1.0):
- `GET /nfse/{chave}/eventos/{tipoEvento}/{numSeqEvento}` (SEFIN) — fetch específico de evento
- `GET /NFSe/{chave}/Eventos` (ADN Contribuintes) — event list por chave sem passar por NSU

## Contribuindo

Bugs e sugestões: [issues](https://github.com/fm-s/open-nfse/issues). PRs bem-vindos — rode `npm run lint && npm run typecheck && npm test` antes de abrir. Histórico de versões no [CHANGELOG.md](./CHANGELOG.md).

## Links

- [Portal oficial NFS-e Nacional](https://www.gov.br/nfse/pt-br)
- [Documentação técnica da Receita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Manual do Contribuinte v1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
- [Lei Complementar 214/2025](https://www.planalto.gov.br/)

## Aviso legal

Biblioteca **não oficial**, sem vínculo com a Receita Federal do Brasil. Software open source, distribuído sob licença MIT, sem garantias. Homologação e conformidade fiscal são responsabilidade de quem utiliza.
