# open-nfse

Cliente TypeScript/Node.js para o **Padrão Nacional de NFS-e** (nfse.gov.br) — a API unificada da Receita Federal, obrigatória em todo o Brasil a partir de 1º de janeiro de 2026 (LC 214/2025). Fala direto na API oficial, sem gateway intermediário.

[npm](https://www.npmjs.com/package/open-nfse) · [GitHub](https://github.com/fm-s/open-nfse) · [Changelog](https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md)

## Instalar

```bash
npm install open-nfse
```

Requer Node.js 20+ e certificado digital A1 (ICP-Brasil) do CNPJ emitente.

## Exemplo mínimo

Setup do cliente com `DpsCounter` (gera `nDPS` atomicamente) e `RetryStore` (persiste transientes). As versões in-memory cobrem testes; produção usa Postgres — [schema SQL sugerido](/guide/integracao).

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: readFileSync('./cert.pfx'), password: process.env.CERT_PASSWORD! },
  dpsCounter: createInMemoryDpsCounter(),
  retryStore: createInMemoryRetryStore(),
});
```

Emissão com resultado discriminado:

```typescript
import {
  OpcaoSimplesNacional, RegimeEspecialTributacao,
  ReceitaRejectionError,
} from 'open-nfse';

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
    console.log('chave autorizada:', r.nfse.chaveAcesso);
  } else {
    // r.status === 'retry_pending' — já persistido no retryStore pela lib
    console.warn('pendente:', r.pending.id);
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    console.error(`rejeitada [${err.codigo}]: ${err.descricao}`);
  } else {
    throw err;
  }
}
```

Para o ciclo completo (persistência, cron de replay, bulk com counter+retry), veja [Emitir NFS-e](/guide/emitir).

## O que a lib cobre

| Escopo                                   | Página                                                |
|------------------------------------------|-------------------------------------------------------|
| Consulta por chave e distribuição por NSU| [Consultar NFS-e](/guide/consultar)                   |
| Emissão segura com counter + retry store | [Emitir NFS-e](/guide/emitir)                         |
| Cancelamento e substituição (4 estados)  | [Substituir e cancelar](/guide/substituir-cancelar)   |
| Validações XSD + CPF/CNPJ + CEP          | [Validações](/guide/validacoes)                       |
| Parâmetros municipais com cache          | [Parâmetros municipais](/guide/parametros)            |
| DANFSe em PDF (online + local)           | [DANFSe](/guide/danfse)                               |
| Dublê em memória para testes             | [Testing](/guide/testing)                             |

**Operação:** [Integração em serviços](/guide/integracao) (schema SQL), [Erros tipados](/guide/erros), [Ambientes e endpoints](/guide/ambientes).

**Referência:** [API cheat sheet](/api-cheatsheet) · [API completa (TypeDoc)](/api/).

## Status

**v0.7.1 — feature-complete.** Ciclo fiscal inteiro coberto. Foco atual é estabilização até 1.0; a API pública pode receber ajustes pontuais, sem breaking changes sem aviso em CHANGELOG. Não afiliado à Receita Federal.
