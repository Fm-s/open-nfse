---
layout: home

hero:
  name: open-nfse
  text: NFS-e Padrão Nacional em TypeScript
  tagline: Cliente direto à API oficial da Receita Federal — consulta, emissão, eventos. Sem gateway no meio.
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
    title: Emissão síncrona
    details: buildDps monta a DPS boilerplate-free, assina com XMLDSig, valida contra o XSD local e envia ao SEFIN.
  - icon: 🔁
    title: Cancelamento e substituição
    details: substituir() com máquina de 4 estados (ok, retry_pending, rolled_back, rollback_pending) e RetryStore pluggable.
  - icon: ✔️
    title: Validações pré-envio
    details: XSD local, dígito verificador de CPF/CNPJ e lookup de CEP contra ViaCEP — tudo opt-out via flags.
  - icon: 🛡️
    title: Erros tipados
    details: Hierarquia Error → OpenNfseError → grupo → concreto. Callers sabem exatamente o que capturar.
  - icon: 📦
    title: Zero mágica
    details: DTO in, DTO out. Sem framework, sem ORM, sem estado global. 100% tipado no TypeScript.
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
  buildDps,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
});

const dps = buildDps({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: {
      opSimpNac: OpcaoSimplesNacional.MeEpp,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  nDPS: '1',
  servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5 },
});

const { chaveAcesso, xmlNfse, nfse } = await cliente.emitir(dps);
```

[Ver guia completo →](/guide/getting-started)
