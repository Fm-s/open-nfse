# open-nfse

Cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br) — a API unificada da Receita Federal, obrigatória em todo o Brasil a partir de 1º de janeiro de 2026 (LC 214/2025). Fala direto na API oficial, sem gateway intermediário.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![npm next](https://img.shields.io/npm/v/open-nfse/next.svg?label=npm%40next)](https://www.npmjs.com/package/open-nfse?activeTab=versions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**📚 Documentação:** [fm-s.github.io/open-nfse](https://fm-s.github.io/open-nfse/) · [API cheat sheet](https://fm-s.github.io/open-nfse/api-cheatsheet) · [API completa](https://fm-s.github.io/open-nfse/api/)

## Status

| Versão | dist-tag | Leiautes | Situação |
|--------|----------|----------|----------|
| **0.12.0-rc.1** | `next` | `nt004` + `nt009` (NT 009 release 1) | Release candidate — este README e a documentação descrevem esta versão |
| 0.11.x | `latest` | só o leiaute vigente (sem opção `layout`) | Estável |

A **0.12** suporta **dois leiautes ao mesmo tempo**, escolhidos explicitamente pela opção **`layout`, obrigatória** em `new NfseClient`, `new NfseClientFake`, `buildDps` e nos validadores de XSD — sem default e sem seleção automática por data:

- **`'nt004'`** — leiaute vigente em produção (RTC v1.01, bundle XSD **20260727**: NT 004 + `tpRetPisCofins` da NT 007 + **CNPJ alfanumérico**). Vale até 30/11/2026.
- **`'nt009'`** — **NT 009/2026 release 1** (bundle `esquemas_prod_restrita_20261020`), que entra em produção em **01/12/2026**: `vAjusteBC` no lugar de `vDedRed`/`gReeRepRes`, `finNFSe` na raiz da DPS, CST/cClassTrib reposicionados, imóvel reestruturado, bens móveis. Os tipos `*Nt009` e os inputs `ajusteBC`/`ibsCbs` podem mudar entre RCs (uma `0.12.0-rc.N` por novo bundle de Produção Restrita) até a `0.12.0` final.

O parser lê NFS-e dos dois leiautes sem perda (detecta pelo `infDPS/finNFSe`), então notas antigas que chegam por consulta/DF-e depois da virada continuam legíveis. Quem vem da 0.11: [migração 0.11 → 0.12](https://fm-s.github.io/open-nfse/guide/migracao-0.12) (inclui o roteiro para drenar o `RetryStore` antes de trocar para o `nt009`); detalhes em [Leiautes](https://fm-s.github.io/open-nfse/guide/layouts).

Ciclo fiscal completo nos dois leiautes: consulta (chave + NSU), emissão segura com `DpsCounter` + `RetryStore`, cancelamento (101101) e substituição (DPS com `<subst>`; o Sistema Nacional gera o 105102), validações locais (XSD por leiaute / CPF+CNPJ com DV alfanumérico / CEP), guards fail-fast das regras fechadas do Anexo I, parâmetros municipais com cache, DANFSe em PDF (renderer local), `NfseClientFake` em `open-nfse/testing`. Pipeline de retry consciente de 429 (`TooManyRequestsError` → `retry_pending` com `notBefore` honrando `Retry-After`; `RetryPolicy` pluggable), com reconciliação via `GET /dps/{id}` antes de descartar uma emissão.

Histórico por versão (auditorias de conformidade, breaking renames pré-1.0, detalhes de cada release) no [CHANGELOG](./CHANGELOG.md). Foco até 1.0 é estabilização; a API pública ainda pode receber ajustes, sempre anunciados no CHANGELOG.

### Radar do padrão (nov/2026)

- **NT 009/2026 v1.01 entra em produção em 01/12/2026**; o leiaute atual vale até 30/11/2026. O release 1 está em Produção Restrita desde 20/10/2026 e é o layout `nt009` desta RC; os releases 2 e 3 ainda não têm bundle publicado — cada um vira uma nova `0.12.0-rc.N`.
- **CNPJ alfanumérico** em produção desde 10/08/2026 (bundle `20260727`, adotado na v0.11.0): validação XSD, builders de Id e consultas por chave aceitam `[0-9A-Z]` na inscrição, nos dois leiautes.
- **IBS/CBS**: grupos obrigatórios desde 03/08/2026 no leiaute vigente; pelas orientações do CGNFS-e (07/08 e 29/10/2026), a omissão do grupo ainda não rejeita a nota (destaque escalonado: 01/10/2026, 01/12/2026 e 01/01/2027 para optantes do Simples que aderirem). Se o grupo for preenchido, todos os campos obrigatórios dele passam a ser exigidos.
- **Simples Nacional** obrigado ao Emissor Nacional desde **01/11/2026** (Resolução CGSN nº 191; critério: data de competência).
- **NT 008/2026** (v1.02): a API oficial de geração do DANFSe foi **suspensa em 03/08/2026** — desde a v0.10.1 o default de `gerarDanfse` é `'local'` e o caminho online (`'auto'`/`'online'`/`consultarDanfse`) está deprecated; a adequação do renderer local ao leiaute nacional único da NT 008 está no roadmap.

Acompanhamento e roteiro de verificação em [`specs/standards-watch.md`](./specs/standards-watch.md).

## Instalar

```bash
npm install open-nfse@next   # 0.12.0-rc.1 — leiautes nt004 + nt009 (o que este README descreve)
npm install open-nfse        # 0.11.x estável — só o leiaute vigente, sem a opção `layout`
```

Requer Node.js 20+ e certificado digital A1 (ICP-Brasil) em `.pfx` ou `.p12` do CNPJ emitente habilitado no Emissor Nacional.

## Exemplo mínimo

Setup do cliente com counter atômico de `nDPS` e store de retry (in-memory para início rápido; produção usa Postgres). O `layout` fixa o leiaute do cliente — `NfseClient<'nt004'>` aqui — e as emissões só aceitam os tipos dele:

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';
import { readFileSync } from 'node:fs';

const cliente = new NfseClient({
  layout: 'nt004', // obrigatório: 'nt004' (produção até 30/11/2026) ou 'nt009' (a partir de 01/12/2026)
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
  ReceitaRejectionError, UnreadableAuthorizedNfseError,
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
    servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
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
  if (err instanceof UnreadableAuthorizedNfseError) {
    // autorizada, mas a resposta não virou DTO: guarde a chave e NÃO reemita
    await persistirNfse({ chaveAcesso: err.chaveAcesso, xmlNfse: err.xmlNfse });
  } else if (err instanceof ReceitaRejectionError) {
    console.error(`rejeitada [${err.codigo}]: ${err.descricao}`);
  } else {
    throw err;
  }
}
```

O `tpAmb` da DPS e do pedido de cancelamento segue o `ambiente` do cliente quando omitido (`Ambiente.Producao` → `'1'`, `Ambiente.ProducaoRestrita` → `'2'`). Só quem monta a DPS fora do cliente (`buildDps` + `emitirDpsPronta`/`emitirEmLote`/`substituir`) precisa passar `tpAmb: TipoAmbienteDps.Producao` em produção — o default do `buildDps` é `'2'`, e a Receita rejeita a divergência (E0006).

No `nt009` o cliente é criado com `layout: 'nt009'` e a emissão aceita os inputs de alto nível `ibsCbs` (grupo IBS/CBS) e `ajusteBC` (ajuste da base de cálculo do ISSQN). Com `ibsCbs`, `servico.cNBS` é obrigatório (E0322); o Anexo I exige o grupo IBSCBS para competência ≥ 01/10/2026 (E0855), mas, como o CGNFS-e ainda tolera a omissão, a lib não aplica essa regra e emite sem `ibsCbs`:

```typescript
// mesmas opções do exemplo acima (ambiente, certificado, dpsCounter, retryStore), com layout 'nt009'
const cliente009 = new NfseClient({ ...opcoes, layout: 'nt009' });

const r = await cliente009.emitir({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: { opSimpNac: OpcaoSimplesNacional.NaoOptante, regEspTrib: RegimeEspecialTributacao.Nenhum },
  },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
  valores: { vServ: 1500, pTotTrib: { pTotTribFed: 13.45, pTotTribEst: 0, pTotTribMun: 5 } },
  tomador: {
    documento: { CNPJ: '11222333000181' },
    nome: 'Acme Ltda',
    endereco: {
      codMunicipio: '3550308', cep: '01310100',
      logradouro: 'Avenida Paulista', numero: '1578', bairro: 'Bela Vista',
    },
  },
  // 01.01 → cClassTrib 000001 e cIndOp 100301 (domicílio do adquirente = tomador), Anexo VIII.
  ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' }, cIndOp: '100301' },
});
// r.status === 'ok' → r.nfse.nfse é NfseNt009
```

As regras de rejeição **fechadas** do Anexo I (as que dependem só dos inputs) são checadas antes de consumir o `nDPS` e lançam `RuleViolationError` com o código; as que dependem de cadastro, parametrização municipal ou da calculadora do IBS/CBS ficam com a SEFIN. Os inputs (`ajusteBC`, imóvel/locação 99.03, bens móveis) e as regras que mudam o uso estão em [Leiautes](https://fm-s.github.io/open-nfse/guide/layouts).

Cron de retry (mesma função cobre `emitir`, `cancelar`, `substituir`):

```typescript
// schedule: a cada 1-5 minutos, um worker só
const items = await cliente.replayPendingEvents();
for (const item of items) {
  // `reconciledFrom` presente = o re-POST foi rejeitado, mas GET /dps/{id} achou a nota já autorizada
  if (item.status === 'success_emission') await persistirNfse(item.emission);
  // autorizada, mas a resposta não virou DTO: guarde a chave (o replay já removeu a entrada)
  if (item.status === 'success_emission_unreadable')
    await persistirNfse({ chaveAcesso: item.error.chaveAcesso, xmlNfse: item.error.xmlNfse });
  if (item.status === 'success')          await persistirEvento(item.evento);
  if (item.status === 'failed_permanent') alertar(item);
  // still_pending fica no store para próxima rodada
}
```

O store guarda o XML já assinado e o replay o reenvia como está — **drene o `RetryStore` com o cliente `nt004` antes de trocar para o `nt009`** ([roteiro](https://fm-s.github.io/open-nfse/guide/migracao-0.12#virada-retrystore)).

Exemplos runnables em [`examples/emit-nfse/`](./examples/emit-nfse/). Padrão completo de produção (persistência, bulk com counter+retry, reconciliação) em [Emitir NFS-e](https://fm-s.github.io/open-nfse/guide/emitir).

## O que a lib cobre

| Escopo                                  | Guia                                                                 |
|-----------------------------------------|----------------------------------------------------------------------|
| Leiautes `nt004` / `nt009` (NT 009)     | [Leiautes](https://fm-s.github.io/open-nfse/guide/layouts) · [Migração 0.11 → 0.12](https://fm-s.github.io/open-nfse/guide/migracao-0.12) |
| Consulta por chave + distribuição por NSU | [Consultar](https://fm-s.github.io/open-nfse/guide/consultar)      |
| Emissão segura com counter + retry store | [Emitir](https://fm-s.github.io/open-nfse/guide/emitir)             |
| Cancelamento e substituição | [Substituir e cancelar](https://fm-s.github.io/open-nfse/guide/substituir-cancelar) |
| Validações XSD + CPF/CNPJ + CEP         | [Validações](https://fm-s.github.io/open-nfse/guide/validacoes)     |
| Parâmetros municipais com cache         | [Parâmetros](https://fm-s.github.io/open-nfse/guide/parametros)     |
| DANFSe em PDF (renderer local)          | [DANFSe](https://fm-s.github.io/open-nfse/guide/danfse)             |
| Dublê em memória para testes            | [Testing](https://fm-s.github.io/open-nfse/guide/testing)           |
| Erros tipados e classificação de retry  | [Erros](https://fm-s.github.io/open-nfse/guide/erros)               |
| Schema SQL sugerido para integração     | [Integração em serviços](https://fm-s.github.io/open-nfse/guide/integracao) |

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│   API pública (NfseClient + open-nfse/testing)             │
├────────────────────────────────────────────────────────────┤
│  Leitura           │  Emissão        │  Eventos            │
│  fetchByChave      │  emitir         │  cancelar           │
│  fetchByNsu        │  emitirEmLote   │  substituir         │
│  fetchDpsStatus    │  emitirDpsPronta│  replayPendingEvents│
│                                                            │
│  Retry pipeline (429-aware): PendingEvent + RetryStore +   │
│   RetryPolicy (notBefore + attempts + safe-wrap)           │
│                                                            │
│  Layouts nt004 / nt009 (NfseClient<L>, DpsFor/NfseFor<L>)  │
│  parse-xml (detecta o layout) ↔ build-xml + sign-xml       │
│  build-dps (guards do Anexo I) + dps-id                    │
│  validate-xml (XSD WASM, um bundle por layout)             │
├────────────────────────────────────────────────────────────┤
│  Validações: CPF/CNPJ DV · CEP (ViaCEP)                    │
│  Parâmetros municipais (6× consultar + cache)              │
│  DANFSe: gerar (pdfkit local) · consultar ADN (deprecated) │
├────────────────────────────────────────────────────────────┤
│  HTTP client (undici + mTLS + HTTP/1.1, GZip/Base64, PDF)  │
│  · TooManyRequestsError (429) + getRetryAfterMs()          │
├────────────────────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil, pluggable)        │
└────────────────────────────────────────────────────────────┘
```

A API oficial está dividida em **quatro hosts distintos** (SEFIN Nacional, ADN Contribuintes, ADN DANFSe, ADN Parâmetros Municipais) com contratos wire diferentes — camelCase vs PascalCase, `tipoAmbiente` int vs string. O `NfseClient` resolve o host por chamada; DTOs públicos normalizam.

## Princípios

DTO in, DTO out. Erros tipados, uma classe por modo de falha (hierarquia sob `OpenNfseError`). Sem estado interno, com primitives de orquestração (`emitirEmLote`) e retry (`RetryStore` + `RetryPolicy` + `replayPendingEvents`). Types derivados dos XSDs RTC v1.01 oficiais de cada leiaute (sufixo `Nt004`/`Nt009` só no que difere ou existe em um leiaute só); `xs:choice` vira discriminated union. `layout` sempre explícito. Identificadores fiscais como `string` para preservar zeros. Builder de DPS separável do transporte (dry-run). Detalhes em [Princípios de design](https://fm-s.github.io/open-nfse/guide/principios).

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

**Suportado:** leiautes `nt004` e `nt009`; consulta (chave + NSU), emissão segura (`emitir(params)`), cancelamento (evento 101101) e substituição (DPS com `<subst>`; o 105102 é gerado pelo Sistema Nacional); parse de todos os 16 tipos de eventos via NSU distribuição (inclusive confirmação/rejeição P/T/I, cancelamento por ofício); validações locais; parâmetros municipais; DANFSe PDF; `fetchDpsStatus` para reconciliação.

**Fora de escopo** (intencional):
- **`POST /decisao-judicial/nfse`** — backs the **Emissor Público Web UI** per Guia v1.2 §4.3, não é uma API de contribuinte. Emissão por decisão judicial acontece via UI Web da Receita, não via lib.
- **CNC** (Cadastro Nacional de Contribuintes) — schemas `CNC_v1.00.xsd` / `tiposCnc_v1.00.xsd` não são referenciados pelo fluxo NFS-e; fora do escopo.
- **Emissão dos outros 14 tipos de evento** (manifestação 202201 etc., análise fiscal, eventos de ofício) — parseamos quando chegam via NSU, mas não há builders públicos; abra uma issue se precisar.
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
