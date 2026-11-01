# open-nfse

Cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br) — a API unificada da Receita Federal, obrigatória em todo o Brasil a partir de 1º de janeiro de 2026 (LC 214/2025). Fala direto na API oficial, sem gateway intermediário.

Suporta os **dois leiautes** que convivem na virada da NT 009/2026: `nt004` (vigente em produção até 30/11/2026) e `nt009` (produção a partir de 01/12/2026). A escolha é explícita — `layout` é obrigatório. Veja [Leiautes](/guide/layouts).

[npm](https://www.npmjs.com/package/open-nfse) · [GitHub](https://github.com/fm-s/open-nfse) · [Changelog](https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md)

## Instalar

```bash
npm install open-nfse@next   # 0.12.0-rc.1 — leiautes nt004 + nt009 (o que esta documentação descreve)
npm install open-nfse        # 0.11.x estável — só o leiaute vigente, sem a opção `layout`
```

Requer Node.js 20+ e certificado digital A1 (ICP-Brasil) do CNPJ emitente. Vindo da 0.11? Veja [Migração 0.11 → 0.12](/guide/migracao-0.12).

## Exemplo mínimo

Setup do cliente com `DpsCounter` (gera `nDPS` atomicamente) e `RetryStore` (persiste transientes). As versões in-memory cobrem testes; produção usa Postgres — [schema SQL sugerido](/guide/integracao). O `layout` fixa o leiaute do cliente (`NfseClient<'nt004'>` aqui) e as emissões só aceitam os tipos dele:

```typescript
import { readFileSync } from 'node:fs';
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004', // obrigatório: 'nt004' (produção até 30/11/2026) ou 'nt009' (a partir de 01/12/2026)
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
  dpsCounter: createInMemoryDpsCounter(),
  retryStore: createInMemoryRetryStore(),
});
```

Emissão com resultado discriminado:

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
    valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
    tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
  });

  if (r.status === 'ok') {
    console.log('chave autorizada:', r.nfse.chaveAcesso);
  } else {
    // r.status === 'retry_pending' — já persistido no retryStore pela lib
    console.warn('pendente:', r.pending.id);
  }
} catch (err) {
  if (err instanceof UnreadableAuthorizedNfseError) {
    // autorizada, mas a resposta não virou DTO: guarde a chave e NÃO reemita
    console.error('autorizada, resposta ilegível:', err.chaveAcesso);
  } else if (err instanceof ReceitaRejectionError) {
    console.error(`rejeitada [${err.codigo}]: ${err.descricao}`);
  } else {
    throw err;
  }
}
```

No `nt009` o cliente é criado com `layout: 'nt009'` e a emissão aceita também `ibsCbs` (grupo IBS/CBS, que exige `servico.cNBS` — E0322) e `ajusteBC`; exemplo em [Começando](/guide/getting-started#a-mesma-nota-no-nt009) e detalhes em [Leiautes](/guide/layouts). Para o ciclo completo (persistência, cron de replay, bulk com counter+retry), veja [Emitir NFS-e](/guide/emitir).

## O que a lib cobre

| Escopo                                   | Página                                                |
|------------------------------------------|-------------------------------------------------------|
| Dois leiautes (`nt004` / `nt009`)        | [Leiautes](/guide/layouts)                            |
| Consulta por chave e distribuição por NSU| [Consultar NFS-e](/guide/consultar)                   |
| Emissão segura com counter + retry store | [Emitir NFS-e](/guide/emitir)                         |
| Cancelamento (101101) e substituição     | [Substituir e cancelar](/guide/substituir-cancelar)   |
| Validações XSD + Anexo I + CPF/CNPJ + CEP| [Validações](/guide/validacoes)                       |
| Parâmetros municipais com cache          | [Parâmetros municipais](/guide/parametros)            |
| DANFSe em PDF (renderer local)           | [DANFSe](/guide/danfse)                               |
| Dublê em memória para testes             | [Testing](/guide/testing)                             |

**Operação:** [Integração em serviços](/guide/integracao) (schema SQL), [Erros tipados](/guide/erros), [Ambientes e endpoints](/guide/ambientes).

**Referência:** [API cheat sheet](/api-cheatsheet) · [API completa (TypeDoc)](/api/).

## Status

**v0.12.0-rc.1** (dist-tag `next`) — dois leiautes simultâneos, `nt004` e `nt009` (NT 009/2026 release 1, bundle de Produção Restrita `20261020`); a 0.11.x segue como `latest`. Os tipos `*Nt009` e os inputs `ajusteBC`/`ibsCbs` podem mudar entre RCs (uma `0.12.0-rc.N` por novo bundle) até a `0.12.0` final. Ciclo fiscal inteiro coberto nos dois leiautes. Foco até 1.0 é estabilização; a API pública ainda pode receber ajustes, sempre anunciados no CHANGELOG. Não afiliado à Receita Federal.
