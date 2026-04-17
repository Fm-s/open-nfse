# Introdução

`open-nfse` é um cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br), a API unificada de emissão de nota fiscal de serviço operada pela Receita Federal brasileira.

## Contexto regulatório

Até 2025, cada um dos **~5.570 municípios** brasileiros operava seu próprio sistema de NFS-e, cada um com layout e protocolo próprios. A partir de **1º de janeiro de 2026**, conforme a [LC 214/2025](https://www.planalto.gov.br/), toda NFS-e passa obrigatoriamente pelo Padrão Nacional — uma única API REST operada pela Receita Federal.

## O que esta lib cobre

- **Consulta** — NFS-e por chave de acesso, distribuição de DF-e por NSU.
- **Emissão síncrona** — DPS → XML → XMLDSig → gzip+base64 → `POST /nfse` → NFS-e autorizada.
- **Cancelamento e substituição** — eventos 101101 e 105102, com máquina de 4 estados para compensação em falhas transitórias/permanentes.
- **Validações pré-envio** — XSD local (RTC v1.01), CPF/CNPJ check-digit, lookup de CEP (ViaCEP por default).
- **Helper `buildDps`** — constrói uma DPS completa a partir de ~10 campos em vez de 50+ manuais.
- **Erros tipados** em 3 níveis, incluindo rejeições específicas da Receita.

## O que NÃO faz (e por quê)

Escopo deliberadamente limitado para manter a biblioteca focada e auditável:

- ❌ **Não persiste nada** — banco, fila, retry: são responsabilidade do serviço consumidor. Veja o guia de [integração](./integracao).
- ❌ **Não gera DANFSe (PDF)** — planejado para v0.4.
- ❌ **Não cobre NF-e** (nota de produto) — padrão totalmente diferente, outro projeto.
- ❌ **Não integra com ERPs específicos** (Bling, Omie, Tiny) — construa um wrapper sobre `open-nfse` no seu próprio projeto.

## Arquitetura

```
┌──────────────────────────────────────────────┐
│            API pública (NfseClient)          │
├──────────────────────────────────────────────┤
│  Leitura                │  Emissão           │
│  fetchByChave           │  emitir            │
│  fetchByNsu             │  emitirEmLote      │
│                         │  cancelar          │
│                         │  substituir        │
│                         │                    │
│  parse-xml ↔ build-xml (RTC v1.01 ↔ DTO)     │
│          sign-xml (XMLDSig)                  │
├──────────────────────────────────────────────┤
│  HTTP client (undici + mTLS, GZip/Base64)    │
├──────────────────────────────────────────────┤
│  Certificado A1 (node-forge, ICP-Brasil)     │
└──────────────────────────────────────────────┘
```

## Próximos passos

- [Começando](./getting-started) — instalar, configurar certificado, primeira chamada.
- [Princípios de design](./principios) — o que a API promete e como ela se mantém compacta.
- [Emissão](./emitir) — `buildDps` + `emitir` end-to-end.
- [Integração em serviços](./integracao) — schema SQL sugerido e fluxo recomendado para persistência.
