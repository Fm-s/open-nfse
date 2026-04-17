# open-nfse

> Biblioteca TypeScript/Node.js para emissão, consulta e gestão de NFS-e no Padrão Nacional (nfse.gov.br), direto na API oficial da Receita Federal.

[![npm version](https://img.shields.io/npm/v/open-nfse.svg)](https://www.npmjs.com/package/open-nfse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/SEU_USUARIO/open-nfse/ci.yml)](https://github.com/SEU_USUARIO/open-nfse/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> ⚠️ **Status:** v0.1.0 entrega consulta por chave, consulta por NSU e parsing completo de NFS-e para objetos tipados. Emissão (v0.2), eventos (v0.3) e DANFSe local (v0.4) ainda não estão implementados — veja [ROADMAP.md](./ROADMAP.md). API pública pode mudar até 1.0.

## Por que existe

A partir de **1º de janeiro de 2026**, toda NFS-e no Brasil passa a ser emitida pelo Padrão Nacional, com uma única API mantida pela Receita Federal (Lei Complementar 214/2025). Isso elimina a fragmentação histórica de 5.570 prefeituras e **abre espaço para integração direta**, sem intermediários.

O `open-nfse` é a camada fina que faltava no ecossistema Node/TypeScript: comunicação direta com a API oficial, tipada, sem lock-in, sem taxa por nota, sem suporte terceirizado ruim.

## Para quem é

- ✅ Empresas que emitem volume relevante de notas e querem cortar custos de gateway
- ✅ SaaS que têm emissão fiscal como feature e não querem depender de terceiro
- ✅ ERPs e sistemas internos que precisam de controle total do fluxo fiscal
- ✅ Devs cansados da UX e dos preços das APIs comerciais

## Para quem NÃO é

- ❌ Quem quer uma solução "turn-key" com dashboard, suporte 24/7 e SLA contratual — use um gateway comercial
- ❌ Quem emite 5 notas por mês — o custo de implementar não compensa

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

## Uso básico

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

### Consultar uma NFS-e por chave de acesso

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

console.log(resultado.chaveAcesso);
console.log(resultado.xmlNfse); // XML assinado pela Sefin (raw string)

// O XML vem totalmente parseado em objetos tipados
const nfse = resultado.nfse;
console.log(nfse.infNFSe.emit.xNome);                 // "VOGA LTDA"
console.log(nfse.infNFSe.valores.vLiq);               // 51.60
console.log(nfse.infNFSe.DPS.infDPS.serv.cServ.cTribNac); // "250101"

// Discriminated unions para variantes (CNPJ vs CPF vs NIF, nacional vs exterior, etc.)
const toma = nfse.infNFSe.DPS.infDPS.toma;
if (toma && 'CPF' in toma.identificador) {
  console.log('Tomador CPF:', toma.identificador.CPF);
}
```

### Consultar documentos recebidos (distribuição por NSU)

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

> **Comportamento importante do ADN.** O endpoint `/DFe/{NSU}` devolve **HTTP 404 com body** quando não há documentos pendentes (e **HTTP 400 com body** em caso de rejeição). Nenhum dos dois é um erro HTTP — ambos carregam a mesma resposta `NsuQueryResult`. A `fetchByNsu` trata isso automaticamente: **não lança** `NotFoundError` nesse caso, retorna o resultado normal com `status === 'NENHUM_DOCUMENTO_LOCALIZADO'` ou `'REJEICAO'`.
>
> Detalhe: mesmo no caminho feliz "caught up", a Receita inclui uma mensagem informativa no array `erros` (ex. `E2220 — Nenhum documento localizado`). O sinal de verdade é o campo `status`; `erros[]` pode carregar avisos mesmo quando tudo está bem.

### Ainda não implementado (em desenvolvimento)

Os blocos abaixo fazem parte do roadmap mas **ainda não existem** na v0.1. Veja [ROADMAP.md](./ROADMAP.md):

- `cliente.emitir({...})` — emissão síncrona de NFS-e (v0.2)
- `cliente.cancelar({...})` / eventos em geral (v0.3)
- `cliente.gerarDanfse(chave)` — geração local do PDF (v0.4)
- Parâmetros municipais com cache (v0.5)
- `NfseClientFake` em `open-nfse/testing` (v0.6)

## Princípios de design

1. **DTO em, DTO out.** Você nunca vê XML, GZip, Base64, mTLS ou XMLDSig. Só dados.
2. **Erros tipados.** `ExpiredCertificateError`, `InvalidXmlError`, `ReceitaRejectionError` — cada caso tratável separadamente.
3. **Sem estado, sem banco, sem framework.** É uma lib, não um sistema. Você pluga na sua infra.
4. **Schema-driven.** Types gerados a partir dos XSDs oficiais da Receita. Quando o layout muda, uma bump de versão propaga tudo.
5. **Builder de DPS isolado do transporte.** Dá pra validar e gerar XML local sem enviar (útil pra preview e testes).
6. **Pluggable certificate provider.** Arquivo, KMS, Vault, env var — você decide.

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

## Ambientes

Cada ambiente expõe múltiplos serviços em hosts diferentes. O `NfseClient` resolve automaticamente qual host usar por chamada.

| Ambiente | SEFIN Nacional (emissão, consulta por chave) | ADN Contribuintes (DF-e por NSU) |
|---|---|---|
| **Produção Restrita** (homologação) | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `adn.producaorestrita.nfse.gov.br/contribuintes` |
| **Produção** (notas válidas) | `sefin.nfse.gov.br/SefinNacional` | `adn.nfse.gov.br/contribuintes` |

## Roadmap

Ver [ROADMAP.md](./ROADMAP.md) para o plano completo por versão.

Em resumo:

- **v0.1** – Consulta por NSU + download de XML (MVP do relatório fiscal)
- **v0.2** – Emissão síncrona de NFS-e
- **v0.3** – Eventos (cancelamento, substituição)
- **v0.4** – Geração local de DANFSe (PDF)
- **v0.5** – Parâmetros municipais com cache
- **v1.0** – API pública estável, cobertura completa do manual v1.2

## Status dos municípios

Todo município é obrigado a aderir ao Padrão Nacional, mas a migração é gradual ao longo de 2026. A lib funciona com **qualquer município aderente** — a API é a mesma. Para municípios ainda não aderentes, continue usando seu gateway atual até a migração.

## Comparação com alternativas

| | open-nfse | Gateways comerciais | ACBr | nfelib (Python) |
|---|---|---|---|---|
| **Linguagem** | TypeScript/Node | HTTP (qualquer) | Delphi/Pascal | Python |
| **Custo por nota** | Zero | R$ 0,10–2,00 | Zero | Zero |
| **Lock-in** | Nenhum | Alto | Baixo | Nenhum |
| **Abstração** | API oficial direta | API deles | API oficial | API oficial |
| **Types nativos** | ✅ | Parcial | N/A | ✅ |
| **Foco** | NFS-e Nacional | Multi-produto fiscal | Multi-produto fiscal | Multi-produto fiscal |

## Contribuindo

Ver [CONTRIBUTING.md](./CONTRIBUTING.md).

Bugs e sugestões: abra uma [issue](https://github.com/SEU_USUARIO/open-nfse/issues).
Discussões sobre arquitetura e features: use as [Discussions](https://github.com/SEU_USUARIO/open-nfse/discussions).

## Por que confiar

Esta biblioteca é mantida ativamente porque é usada em produção pelos próprios autores, emitindo centenas de notas por mês. Atualizações em resposta a Notas Técnicas da Receita Federal são prioridade.

## Licença

MIT © [Seu Nome]

## Links úteis

- [Portal oficial NFS-e Nacional](https://www.gov.br/nfse/pt-br)
- [Documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Swagger Contribuintes](https://www.nfse.gov.br/swagger/contribuintesissqn/)
- [Manual do Contribuinte (v1.2)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
- [Lei Complementar 214/2025 (Reforma Tributária)](https://www.planalto.gov.br/)

## Aviso legal

Esta biblioteca é **não oficial** e não tem vínculo com a Receita Federal do Brasil. É software open source mantido pela comunidade. Use por sua conta e risco. Homologação e conformidade fiscal são responsabilidade de quem utiliza.