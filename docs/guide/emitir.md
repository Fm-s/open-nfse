# Emitir NFS-e

`emitir(params)` é o fluxo primário. Recebe params de alto nível (sem `nDPS`), roda as validações offline, consulta o `DpsCounter` **só depois** que tudo passa, e retorna um resultado discriminado. Falha de rede nunca duplica (replay idempotente via `RetryStore` + SEFIN dedup no `infDPS.Id`); DPS quebrada nunca queima número da série.

```
params → valida CPF/CNPJ → XSD → CEP
   ↓ (se tudo passou)
counter.next() → nDPS real → sign → POST /nfse
   ↓
{ status: 'ok', nfse }                 ← autorizada
{ status: 'retry_pending', pending }   ← transiente, salvo no RetryStore
throw ReceitaRejectionError            ← regra fiscal violada (nDPS consumido)
```

## Setup

`dpsCounter` é obrigatório (ou passe `nDPS` explícito em cada chamada); `retryStore` é obrigatório se você quiser que falhas transientes sejam persistidas em vez de lançar:

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),   // produção: UPDATE ... RETURNING
  retryStore: createInMemoryRetryStore(),   // produção: tabela nfse_pending_events
});
```

Impls Postgres completas dos dois: [Integração em serviços](./integracao).

## 1. Emissão mínima

```typescript
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from 'open-nfse';

const resultado = await cliente.emitir({
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

if (resultado.status === 'ok') {
  console.log(resultado.nfse.chaveAcesso);
}
```

`tomador` é opcional — se você não informar, a nota é emitida sem tomador identificado (legal em casos específicos, tipicamente varejo presencial).

## 2. Com tomador identificado

```typescript
await cliente.emitir({
  emitente: { /* ... */ },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5 },
  tomador: {
    documento: { CNPJ: '11222333000181' },     // ou { CPF: '01075595363' }
    nome: 'Acme Ltda',
    email: 'financeiro@acme.test',
    endereco: {
      codMunicipio: '3550308',
      cep: '01310100',
      logradouro: 'Avenida Paulista',
      numero: '1578',
      bairro: 'Bela Vista',
      complemento: 'conj 12',                   // opcional
    },
  },
});
```

O CEP é validado contra ViaCEP por default. Desligue com `skipCepValidation: true` se estiver emitindo em lote e quiser cache próprio (ou passe um `cepValidator` custom).

## 3. Lidando com cada resultado

A chave está em **tratar os três desfechos como cenários distintos**, não como variações do mesmo:

```typescript
import { ReceitaRejectionError } from 'open-nfse';

try {
  const r = await cliente.emitir(params);

  if (r.status === 'ok') {
    // Autorizada. Persista como documento fiscal oficial.
    await db.tx(async (tx) => {
      await tx.insert('nfse_autorizadas', {
        chave_acesso: r.nfse.chaveAcesso,
        id_dps: r.nfse.idDps,
        xml_nfse: r.nfse.xmlNfse,
        nnfse: r.nfse.nfse.infNFSe.nNFSe,
        valor_liquido: r.nfse.nfse.infNFSe.valores.vLiq,
        dh_proc: r.nfse.dataHoraProcessamento,
        tipo_ambiente: r.nfse.tipoAmbiente,
      });
      for (const alerta of r.nfse.alertas) {
        await tx.insert('nfse_alertas', { chave: r.nfse.chaveAcesso, ...alerta });
      }
    });
    return;
  }

  if (r.status === 'retry_pending') {
    // Transiente. Já persistido no retryStore pela lib.
    // Um cron de replayPendingEvents() cuida do resto.
    logger.warn('emit transient', { pendingId: r.pending.id, err: r.error.message });
    return;
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // Permanente. nDPS foi consumido; a nota foi definitivamente rejeitada.
    await db.insert('nfse_rejeicoes', {
      id_dps: err.idDps,
      codigo: err.codigo,
      descricao: err.descricao,
      mensagens: err.mensagens,
    });
    logger.error('emit rejeitada', { codigo: err.codigo, descricao: err.descricao });
    return;
  }
  throw err;
}
```

Três regras que emergem dessa estrutura:

- **`ok`** é o único caminho que cria linha em `nfse_autorizadas`.
- **`retry_pending`** não precisa de ação imediata — a lib já salvou o pendente. Você pode opcionalmente registrar um log para dashboard, mas o replay cron é quem fecha o ciclo.
- **Permanente** (throw) consumiu o `nDPS` mas não vai virar NFS-e autorizada. Registre para auditoria e siga.

## 4. Cron de replay

Tudo que cai em `retry_pending` (e em `rollback_pending` vindo de `substituir`) é persistido no `RetryStore`. Um cron que chama `replayPendingEvents` re-posta cada um; SEFIN deduplica no `infDPS.Id` (emissões) e em `(chave, tipoEvento, nPedRegEvento)` (eventos), então chamar N vezes é idempotente:

```typescript
// schedule: a cada 1-5 minutos, um worker só
const items = await cliente.replayPendingEvents();

for (const item of items) {
  switch (item.status) {
    case 'success_emission':
      await db.insert('nfse_autorizadas', {
        chave_acesso: item.emission.chaveAcesso,
        id_dps: item.emission.idDps,
        xml_nfse: item.emission.xmlNfse,
        /* ... */
      });
      logger.info('replay emissão ok', { id: item.id });
      break;

    case 'success':
      // Evento (cancelamento/substituição/rollback) bem sucedido
      await db.insert('nfse_eventos', {
        chave_acesso: item.evento.chaveNfse,
        tipo_evento: item.evento.tipoEvento,
        xml_evento: item.evento.xmlEvento,
        /* ... */
      });
      logger.info('replay evento ok', { id: item.id });
      break;

    case 'still_pending':
      // Transiente de novo — fica no store, próxima rodada tenta
      logger.warn('replay transient', { id: item.id, err: item.error.message });
      break;

    case 'failed_permanent':
      // Permanente — lib removeu do store. Caller decide (alerta, ticket, etc).
      logger.error('replay permanent', { id: item.id, err: item.error.message });
      break;
  }
}
```

O worker deve ser **único por processo** — concorrência entre crons pode causar re-posts simultâneos (tolerado pelo SEFIN dedup, mas desperdiça quota).

## 5. Bulk com o mesmo fluxo seguro

`emitir(params)` é uma chamada por vez, mas um worker pool simples paraleliza sem perder a segurança do counter + retry store:

```typescript
async function emitirBulk(lote: readonly EmitirParams[], concurrency = 4) {
  const cursor = { i: 0 };
  const resultados = new Array(lote.length);

  async function worker() {
    while (cursor.i < lote.length) {
      const idx = cursor.i++;
      try {
        resultados[idx] = await cliente.emitir(lote[idx]);
      } catch (err) {
        resultados[idx] = { status: 'throw', error: err as Error };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return resultados;
}

const lote = pedidosDoMes.map((p) => paramsParaEmissao(p));   // sua função
const rs = await emitirBulk(lote, 4);

for (const r of rs) {
  if (r.status === 'ok')              await persistirAutorizada(r);
  else if (r.status === 'retry_pending') logger.warn('pendente', r.pending.id);
  else if (r.status === 'throw')      await persistirRejeicao(r.error);
}
```

Cada `emitir(params)` individual ainda:
- Consulta o `DpsCounter` atomicamente (sua impl Postgres garante isso)
- Persiste `retry_pending` no `RetryStore` em falha transiente
- Lança em rejeição permanente

Sem surpresas ao paralelizar.

::: tip Cache de CEP em lote
Se os pedidos têm CEPs repetidos, passe um `cepValidator` com cache compartilhado em `NfseClientConfig` — `createViaCepValidator()` já dedupa lookups internamente, reduzindo hits no ViaCEP em N× na primeira rodada.
:::

## 6. Dry-run — preview sem enviar

Monta e assina o XML sem tocar a rede e **sem consumir o counter**. Ideal para CI, auditoria de payload ou debug offline:

```typescript
const dry = await cliente.emitir({ ...params, dryRun: true });

dry.xmlDpsAssinado;   // XML assinado (RSA-SHA256 + exc-c14n + enveloped)
dry.xmlDpsGZipB64;    // payload gzip+base64, pronto para POST manual se quiser
```

Placeholder `nDPS: '1'` é usado no dry-run (ou passe `params.nDPS` explícito).

## 7. Opções (flags)

`EmitirParams extends EmitOptions` — as flags viajam junto no mesmo objeto:

```typescript
await cliente.emitir({
  ...params,
  dryRun: false,                  // preview sem enviar
  skipValidation: false,          // pula XSD RTC v1.01
  skipCepValidation: false,       // pula lookup ViaCEP
  skipCpfCnpjValidation: false,   // pula DV CPF/CNPJ
  cepValidator: brasilApi,        // override do validador default
  nDPS: '999',                    // override — counter NÃO é chamado
});
```

Validações rodam nesta ordem: CPF/CNPJ (sync) → XSD (WASM) → CEP (HTTP). Desligar é útil em cenários específicos (alta-frequência com cache próprio, debug) — mais detalhes em [Validações](./validacoes).

## Errors de validação local (throw imediato)

Com defaults, essas falhas **nem chegam** à Receita:

| Erro                           | Causa                                                       |
|--------------------------------|-------------------------------------------------------------|
| `InvalidCnpjError`             | DV do CNPJ incorreto ou formato fora de `^\d{14}$`           |
| `InvalidCpfError`              | Mesmo, para CPF                                             |
| `InvalidCepError`              | Formato inválido ou ViaCEP retornou 404                     |
| `XsdValidationError`           | DPS não bate com RTC v1.01 (campo faltando, pattern errado) |
| `InvalidDpsIdParamError`       | cMun/CNPJ/série/nDPS fora do formato do `TSIdDPS`            |
| `RuleViolationError`           | Regra de negócio local (e.g. E0078 para `cMotivo=99` em eventos) |
| `MissingDpsCounterError`       | `emitir(params)` sem `params.nDPS` e sem `dpsCounter` configurado |
| `MissingRetryStoreError`       | Transiente ocorreu mas não há `retryStore` para persistir   |

Todos herdam de `OpenNfseError` — [hierarquia completa](./erros).

::: tip IBS / CBS e data de competência
Rule E0850 do Anexo I: campos IBS/CBS só são aceitos a partir de `dCompet ≥ 2026-01-01`. Se você está emitindo retroativamente para competência anterior, omita o grupo `IBSCBS` — a Receita rejeita `E0850` caso contrário. E0942 é o espelho: `OutrosDocumentos` (dedução/redução) só até 2025-12-31.
:::

## Reconciliação pós-timeout — `fetchDpsStatus`

Se um `emitir()` não retornou (processo morreu, timeout sem `retry_pending` capturado), você pode consultar o status pelo `idDps` usando `GET /dps/{id}`:

```typescript
try {
  const status = await cliente.fetchDpsStatus('DPS211130010057475300010000001000000000000001');
  // NFS-e existe — reconcilia com seu DB usando status.chaveAcesso
  console.log('recuperada:', status.chaveAcesso);
} catch (err) {
  if (err instanceof NotFoundError) {
    // nenhuma NFS-e gerada com esse idDps — pode reemitir com novo idDps
  } else {
    throw err;
  }
}
```

Para reconciliação em lote, use `existsDpsStatus(idDps)` (HEAD, sem body) e busque detalhes só nos que existem:

```typescript
const pendentes = await db.query(`SELECT id_dps FROM dps_submissions WHERE status='in_flight'`);
for (const { id_dps } of pendentes) {
  if (await cliente.existsDpsStatus(id_dps)) {
    const s = await cliente.fetchDpsStatus(id_dps);
    await persistirAutorizada(s);
  } else {
    await db.query(`UPDATE dps_submissions SET status='pending' WHERE id_dps = $1`, [id_dps]);
  }
}
```

---

## Escape hatch: `emitirDpsPronta(dps)`

Quando você precisa controlar a pipeline inteira (replay determinístico, pré-assinatura externa, migração de sistema legado, integração com HSM custom), use `cliente.emitirDpsPronta(dps)`. Ele **bypassa counter e retry store** — throw em tudo, nenhum `retry_pending`.

```typescript
import { buildDps } from 'open-nfse';

const dps = buildDps({
  emitente: { /* ... */ },
  serie: '1', nDPS: '42',                        // obrigatório
  servico: { /* ... */ },
  valores: { /* ... */ },
});

const nfseAutorizada = await cliente.emitirDpsPronta(dps);
console.log(nfseAutorizada.chaveAcesso);
```

`buildDps` monta DPS completa a partir de ~10 campos semânticos (vs 50+ manuais). Defaults aplicados: `versao='1.01'`, `tpAmb='2'`, `tpEmit='1'`, `dhEmi=now`, `dCompet=now`, `tribISSQN='1'`, `tpRetISSQN='1'`, `indTotTrib='0'`, `locPrest=emitente.codMunicipio`. Cobre ~85% dos casos; para **tomador exterior, obra, atividade-evento, dedução/redução, IBS/CBS**, construa `InfDPS` manualmente (todos os tipos RTC estão exportados).

`emitirEmLote(dpsList, options)` segue o mesmo contrato — worker pool client-side sobre `DPS[]` pré-montado. A seção **5. Bulk com o mesmo fluxo seguro** acima é o equivalente idiomático para quem quer manter o `DpsCounter` + `RetryStore` no caminho.

## Exemplo runnable

[`examples/emit-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/emit-nfse) — `npm start` (emissão única) e `npm run bulk` (lote), ambos com dry-run por default.
