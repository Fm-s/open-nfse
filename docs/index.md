---
layout: home

hero:
  name: open-nfse
  text: NFS-e Padrão Nacional em TypeScript
  tagline: Cliente direto à API oficial da Receita Federal — consulta, emissão segura, eventos, parâmetros municipais e DANFSe. Sem gateway no meio.
  image:
    src: /logo.svg
    alt: open-nfse
  actions:
    - theme: brand
      text: Começar
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/fm-s/open-nfse

features:
  - icon: 🔍
    title: Consulta e distribuição
    details: fetchByChave e fetchByNsu com parsing completo do XML (RTC v1.01) para objetos tipados.
  - icon: 📝
    title: Emissão segura
    details: emitir(params) com DpsCounter — counter só consome depois das validações offline, falha de rede vira retry_pending salvo no RetryStore.
  - icon: 🔁
    title: Cancelamento e substituição
    details: substituir() com máquina de 4 estados (ok, retry_pending, rolled_back, rollback_pending) + rollback automático e replayPendingEvents cron-friendly.
  - icon: ✔️
    title: Validações pré-envio
    details: XSD RTC v1.01 (libxml2 via WASM), dígito verificador de CPF/CNPJ e lookup de CEP contra ViaCEP — todas opt-out via flag.
  - icon: 🏛️
    title: Parâmetros municipais
    details: Seis métodos consultar* (alíquotas, benefícios, convênio, regimes especiais, retenções) com cache pluggable e TTLs sensatos.
  - icon: 📄
    title: DANFSe em PDF
    details: gerarDanfse(nfse) tenta o PDF oficial do ADN e cai num renderer local (pdfkit + QR code) — sem travar na indisponibilidade da Receita.
  - icon: 🧪
    title: NfseClientFake
    details: open-nfse/testing expõe um dublê em memória estruturalmente compatível (NfseClientLike) — testes sem mTLS, sem rede, sem mocks.
  - icon: 🛡️
    title: Erros tipados
    details: Hierarquia Error → OpenNfseError → grupo → concreto. Callers sabem exatamente o que capturar, incluindo ReceitaRejectionError com mensagens[].
  - icon: 📦
    title: Zero mágica
    details: DTO in, DTO out. Sem framework, sem ORM, sem estado interno escondido. RetryStore, DpsCounter, ParametrosCache e CepValidator são interfaces que você pluga.
---

## Por que

A partir de **1º de janeiro de 2026**, toda NFS-e no Brasil passa a ser emitida pelo Padrão Nacional (LC 214/2025), com uma única API mantida pela Receita Federal em substituição aos ~5.570 sistemas municipais. Este pacote é uma camada fina sobre essa API: mTLS com certificado A1, parsing/geração de XML conforme os XSDs oficiais, DTOs tipados.

## Instalação

```bash
npm install open-nfse
```

## Uso rápido

```typescript
import {
  NfseClient,
  Ambiente,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
  dpsCounter: createInMemoryDpsCounter(),   // em prod: wrap seu DB (UPDATE ... RETURNING)
  retryStore: createInMemoryRetryStore(),   // em prod: wrap seu DB (upsert/list/delete)
});

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
});

if (r.status === 'ok') {
  console.log(r.nfse.chaveAcesso);
  console.log(r.nfse.xmlNfse);
}
```

[Ver guia completo →](/guide/getting-started)
