# Introdução

`open-nfse` é um cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br), a API unificada de emissão de nota fiscal de serviço operada pela Receita Federal brasileira.

## Contexto regulatório

Até 2025, cada um dos **~5.570 municípios** brasileiros operava seu próprio sistema de NFS-e, cada um com layout e protocolo próprios. A partir de **1º de janeiro de 2026**, conforme a [LC 214/2025](https://www.planalto.gov.br/), toda NFS-e passa obrigatoriamente pelo Padrão Nacional — uma única API REST operada pela Receita Federal.

## O que esta lib cobre

- **Consulta** — NFS-e por chave de acesso, distribuição de DF-e por NSU.
- **Emissão segura** — `emitir(params)` roda validações offline, consulta o `DpsCounter` só depois que tudo passa, e persiste falhas transientes no `RetryStore` para replay idempotente via `replayPendingEvents`. Escape hatch `emitirDpsPronta(dps)` para pipelines manuais.
- **Emissão em lote** — `emitirEmLote` paraleliza no cliente, com concorrência configurável.
- **Cancelamento e substituição** — eventos 101101 e 105102, com máquina de 4 estados para compensação em falhas transitórias/permanentes.
- **Validações pré-envio** — XSD local (RTC v1.01 via libxml2 WASM), CPF/CNPJ check-digit, lookup de CEP (ViaCEP por default, pluggable).
- **Parâmetros municipais** — seis métodos `consultar*` (alíquotas, benefícios, convênio, regimes especiais, retenções) com cache pluggable e TTLs sensatos.
- **DANFSe PDF** — `gerarDanfse(nfse)` tenta o PDF oficial do ADN e cai num renderer local (`pdfkit` + QR code) quando o ADN falha. Estratégia `'auto' | 'online' | 'local'`.
- **Helper `buildDps`** — constrói uma DPS completa a partir de ~10 campos em vez de 50+ manuais.
- **Erros tipados** em 3 níveis, incluindo rejeições específicas da Receita.
- **`NfseClientFake`** em `open-nfse/testing` — dublê em memória estruturalmente compatível (`NfseClientLike`).

## O que NÃO faz (e por quê)

Escopo deliberadamente limitado para manter a biblioteca focada e auditável:

- ❌ **Não tem persistência durável** — a lib provê `RetryStore`, `DpsCounter` e `ParametrosCache` (interfaces pluggable) + `replayPendingEvents` (cron-friendly), mas **os backing stores são seus**. Também não trazemos ORM ou esquema próprio. [Esquema SQL sugerido aqui](./integracao).
- ❌ **Não cobre NF-e** (nota de produto) — padrão totalmente diferente, outro projeto.
- ❌ **Não integra com ERPs específicos** (Bling, Omie, Tiny) — construa um wrapper sobre `open-nfse` no seu próprio projeto.
- ❌ **Não orquestra cron/scheduler** — você chama `replayPendingEvents` em whatever job runner preferir (node-cron, BullMQ, Temporal, Lambda scheduled, etc).

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│  API pública — NfseClient + open-nfse/testing              │
├────────────────────────────────────────────────────────────┤
│  Leitura        │  Emissão seg.     │  Eventos              │
│  fetchByChave   │  emitir           │  cancelar             │
│  fetchByNsu     │  emitirEmLote     │  substituir (4 estados)│
│                 │  emitirDpsPronta  │  replayPendingEvents  │
│                                                            │
│  parse-xml ↔ build-xml + sign-xml (RTC v1.01 ↔ DTO)         │
│  buildDps · validate-xml (XSD WASM) · CPF/CNPJ DV · ViaCEP  │
│  Parâmetros municipais (6× consultar + cache pluggable)    │
│  DANFSe (fetch ADN + renderer local pdfkit)                │
├────────────────────────────────────────────────────────────┤
│  HTTP client (undici + mTLS + HTTP/1.1, GZip/Base64, PDF)  │
├────────────────────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil, pluggable)        │
└────────────────────────────────────────────────────────────┘
```

## Próximos passos

- [Começando](./getting-started) — instalar, configurar certificado, primeira chamada.
- [Princípios de design](./principios) — o que a API promete e como ela se mantém compacta.
- [Emissão](./emitir) — `emitir(params)` com `DpsCounter` + `RetryStore` end-to-end.
- [Substituir e cancelar](./substituir-cancelar) — máquina de 4 estados + rollback automático.
- [Parâmetros municipais](./parametros) — alíquotas, benefícios, convênio, regimes, retenções.
- [DANFSe (PDF)](./danfse) — fetch oficial com fallback para renderer local.
- [Testando com o fake](./testing) — `NfseClientFake` + `NfseClientLike`.
- [Integração em serviços](./integracao) — schema SQL sugerido e fluxo recomendado para persistência.
