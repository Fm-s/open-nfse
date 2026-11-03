# Introdução

`open-nfse` é um cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br), a API unificada de emissão de nota fiscal de serviço operada pela Receita Federal brasileira.

## Contexto regulatório

Até 2025, cada um dos **~5.570 municípios** brasileiros operava seu próprio sistema de NFS-e, cada um com layout e protocolo próprios. A partir de **1º de janeiro de 2026**, conforme a [LC 214/2025](https://www.planalto.gov.br/), toda NFS-e passa obrigatoriamente pelo Padrão Nacional — uma única API REST operada pela Receita Federal.

O leiaute do Padrão Nacional muda com a Reforma Tributária, por Notas Técnicas. A próxima troca é a **NT 009/2026**: o leiaute atual vale até **30/11/2026** e o novo entra em produção em **01/12/2026** (já disponível em Produção Restrita). Como DPS e NFS-e dos dois formatos convivem — notas antigas continuam chegando por consulta e DF-e depois da virada —, a lib suporta os dois ao mesmo tempo:

| `layout`  | Leiaute | Bundle XSD |
|-----------|---------|------------|
| `'nt004'` | Vigente em produção (NT 004 + `tpRetPisCofins` da NT 007 + CNPJ alfanumérico) | `20260727` |
| `'nt009'` | NT 009/2026 release 1 | `esquemas_prod_restrita_20261020` |

`layout` é **obrigatório** e explícito em `new NfseClient`, `new NfseClientFake`, `buildDps` e nos validadores de XSD — sem default e sem seleção automática por data. Detalhes em [Leiautes](./layouts.md).

## O que esta lib cobre

- **Dois leiautes** — `nt004` e `nt009`, escolhidos por `layout`. `NfseClient<L>` é genérico: as emissões só aceitam os tipos do leiaute do cliente. O parser lê NFS-e dos dois leiautes sem perda (detecta pelo `infDPS/finNFSe`) e devolve a união `NFSe`, discriminada pelo campo sintético `layout`.
- **Consulta** — NFS-e por chave de acesso, distribuição de DF-e por NSU.
- **Emissão segura** — `emitir(params)` roda validações offline, consulta o `DpsCounter` só depois que tudo passa, e persiste falhas transientes (rede, timeout, 5xx, **429**) no `RetryStore` para replay via `replayPendingEvents` — o re-POST reusa o mesmo `infDPS.Id` e uma rejeição (E0014/E1235) é reconciliada via `GET /dps/{id}` antes de a entrada sair do store. Uma nota autorizada nunca vira falha: se a resposta não puder ser lida, a lib lança `UnreadableAuthorizedNfseError` com a chave (não reemita). Escape hatch `emitirDpsPronta(dps)` para pipelines manuais.
- **Emissão em lote** — `emitirEmLote` paraleliza no cliente, com concorrência configurável.
- **Cancelamento e substituição** — cancelar (101101) registra o pedRegEvento; substituir emite a DPS com `<subst>` e o sistema gera o 105102. Motivo, chave e `subst` são checados antes de qualquer I/O; falhas transitórias do POST viram `retry_pending` no `RetryStore`.
- **Rate-limit (429) pluggable** — `RetryPolicy` decide `notBefore` para cada erro transiente. Default respeita `Retry-After` (RFC 7231); customize para backoff exponencial / linear / com jitter usando `RetryContext.attempt`.
- **Validações pré-envio** — XSD local do leiaute escolhido (via libxml2 WASM), CPF/CNPJ check-digit (inclusive CNPJ alfanumérico), lookup de CEP (ViaCEP por default, pluggable) e as regras de rejeição **fechadas** do Anexo I — as que dependem só dos inputs — como `RuleViolationError` com o código da regra.
- **Parâmetros municipais** — seis métodos `consultar*` (alíquotas, benefícios, convênio, regimes especiais, retenções) com cache pluggable e TTLs sensatos.
- **DANFSe PDF** — `gerarDanfse(nfse)` gera o PDF localmente (`pdfkit` + QR code). A API oficial de geração foi suspensa pela NT 008/2026 (03/08/2026); as estratégias `'auto'`/`'online'` e `consultarDanfse` estão deprecated.
- **Helper `buildDps`** — constrói uma DPS completa a partir de ~10 campos em vez de 50+ manuais; no `nt009`, aceita os inputs declarativos `ajusteBC` (ajuste da base de cálculo do ISSQN) e `ibsCbs` (grupo IBS/CBS).
- **Erros tipados**, uma classe por modo de falha, incluindo rejeições específicas da Receita (`ReceitaRejectionError`) e erros de leiaute (`InvalidLayoutError`, `LayoutMismatchError`).
- **`NfseClientFake`** em `open-nfse/testing` — dublê em memória estruturalmente compatível (`NfseClientLike`).

## O que NÃO faz (e por quê)

Escopo deliberadamente limitado para manter a biblioteca focada e auditável:

- ❌ **Não tem persistência durável** — a lib provê `RetryStore`, `DpsCounter` e `ParametrosCache` (interfaces pluggable) + `replayPendingEvents` (cron-friendly), mas **os backing stores são seus**. Também não trazemos ORM ou esquema próprio. [Esquema SQL sugerido aqui](./integracao.md).
- ❌ **Não cobre NF-e** (nota de produto) — padrão totalmente diferente, outro projeto.
- ❌ **Não integra com ERPs específicos** (Bling, Omie, Tiny) — construa um wrapper sobre `open-nfse` no seu próprio projeto.
- ❌ **Não orquestra cron/scheduler** — você chama `replayPendingEvents` em whatever job runner preferir (node-cron, BullMQ, Temporal, Lambda scheduled, etc).

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│  API pública — NfseClient + open-nfse/testing              │
├────────────────────────────────────────────────────────────┤
│  Leitura        │  Emissão seg.     │  Eventos             │
│  fetchByChave   │  emitir           │  cancelar            │
│  fetchByNsu     │  emitirEmLote     │  substituir          │
│                 │  emitirDpsPronta  │  replayPendingEvents │
│                                                            │
│  Retry pipeline: PendingEvent + RetryStore + RetryPolicy   │
│   · notBefore (Retry-After) + attempts + safe-wrap         │
│                                                            │
│  parse-xml ↔ build-xml + sign-xml (nt004 | nt009 ↔ DTO)    │
│  buildDps · validate-xml (XSD WASM por layout) · Anexo I   │
│  CPF/CNPJ DV · ViaCEP                                      │
│  Parâmetros municipais (6× consultar + cache pluggable)    │
│  DANFSe (renderer local pdfkit; fetch ADN deprecated)      │
├────────────────────────────────────────────────────────────┤
│  HTTP client (undici + mTLS + HTTP/1.1, GZip/Base64, PDF)  │
│  · TooManyRequestsError (429) + getRetryAfterMs()          │
├────────────────────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil, pluggable)        │
└────────────────────────────────────────────────────────────┘
```

## Próximos passos

- [Começando](./getting-started.md) — instalar, escolher o layout, configurar certificado, primeira chamada.
- [Princípios de design](./principios.md) — o que a API promete e como ela se mantém compacta.
- [Leiautes](./layouts.md) — `nt004` × `nt009`, virada de 01/12/2026, inputs `ajusteBC`/`ibsCbs`.
- [Migração 0.11 → 0.12](./migracao-0.12.md) — checklist de breaking changes e roteiro para drenar o `RetryStore` antes da virada.
- [Emissão](./emitir.md) — `emitir(params)` com `DpsCounter` + `RetryStore` end-to-end.
- [Substituir e cancelar](./substituir-cancelar.md) — 101101 e a substituição dirigida pela DPS (105102 gerado pelo sistema).
- [Parâmetros municipais](./parametros.md) — alíquotas, benefícios, convênio, regimes, retenções.
- [DANFSe (PDF)](./danfse.md) — renderer local (NT 008/2026).
- [Testando com o fake](./testing.md) — `NfseClientFake` + `NfseClientLike`.
- [Integração em serviços](./integracao.md) — schema SQL sugerido e fluxo recomendado para persistência.
