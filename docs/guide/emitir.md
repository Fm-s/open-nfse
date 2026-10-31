# Emitir NFS-e

`emitir(params)` é o fluxo primário. Recebe params de alto nível (sem `nDPS`), roda as validações offline, consulta o `DpsCounter` **só depois** que tudo passa, e retorna um resultado discriminado. Falha de rede não duplica: o pendente vai para o `RetryStore` com o XML assinado (mesmo `infDPS.Id`) e o replay reconcilia via `GET /dps/{id}` quando o re-POST é rejeitado — uma DPS que o SEFIN já autorizou volta como `success_emission`, não como falha (ver seção 4). DPS quebrada nunca queima número da série.

```
params → valida CPF/CNPJ → XSD → CEP
   ↓ (se tudo passou)
counter.next() → nDPS real → sign → POST /nfse
   ↓
{ status: 'ok', nfse }                 ← autorizada
{ status: 'retry_pending', pending }   ← transiente, salvo no RetryStore
throw ReceitaRejectionError            ← regra fiscal violada (nDPS consumido)
throw UnreadableAuthorizedNfseError    ← AUTORIZADA, resposta ilegível (não reemita)
```

Erros transientes cobrem `NetworkError`, `TimeoutError`, `ServerError` (5xx) e `TooManyRequestsError` (429). O 429 respeita o cabeçalho `Retry-After` do servidor — a entrada fica no `RetryStore` com `notBefore` calculado pela `RetryPolicy` configurada e o cron de replay só toca nela quando elegível. Detalhes em [Erros tipados](./erros#429-e-retrypolicy).

**Não envolva esta chamada em retry loop próprio para 429/5xx.** Cada `emitir()` consome um `nDPS` antes do POST; um wrapper externo que recapta e retenta queima números da série e cria buracos permanentes no sequencial. A lib já persiste o pendente — use `replayPendingEvents` (ver seção 4).

## Setup

`dpsCounter` é obrigatório (ou passe `nDPS` explícito em cada chamada); `retryStore` é obrigatório se você quiser que falhas transientes sejam persistidas em vez de lançar:

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004',                          // define também o tipo de `emitir`/`emitirDpsPronta`
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),   // produção: UPDATE ... RETURNING
  retryStore: createInMemoryRetryStore(),   // produção: tabela nfse_pending_events
});
```

Impls Postgres completas dos dois: [Integração em serviços](./integracao).

## 1. Emissão mínima

```typescript
import {
  OpcaoSimplesNacional, RegimeApuracaoSimplesNacional, RegimeEspecialTributacao,
} from 'open-nfse';

const resultado = await cliente.emitir({
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
  // O membro do choice totTrib depende do regime: ME/EPP usa pTotTribSN (% aprox.
  // do Simples), MEI usa indTotTrib='0' (default), Não Optante usa vTotTrib/pTotTrib.
  valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
});

if (resultado.status === 'ok') {
  console.log(resultado.nfse.chaveAcesso);
}
```

`tomador` é opcional — se você não informar, a nota é emitida sem tomador identificado (legal em casos específicos, tipicamente varejo presencial).

## 2. Com tomador identificado

```typescript
await cliente.emitir({
  emitente: { /* ... ME/EPP, como acima ... */ },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
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
import { ReceitaRejectionError, UnreadableAuthorizedNfseError } from 'open-nfse';

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
  if (err instanceof UnreadableAuthorizedNfseError) {
    // AUTORIZADA — a lib só não conseguiu montar o DTO (parser/layout). A nota
    // existe: persista chave + XML e NÃO reemita (geraria uma 2ª NFS-e).
    await db.insert('nfse_autorizadas', {
      chave_acesso: err.chaveAcesso,
      id_dps: err.idDps,
      xml_nfse: err.xmlNfse,
    });
    logger.error('NFS-e autorizada sem DTO', { chave: err.chaveAcesso, causa: err.cause });
    return;
  }
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

- **`ok`** e **`UnreadableAuthorizedNfseError`** são os caminhos que criam linha em `nfse_autorizadas` — o segundo é raro (resposta que o parser não lê), mas a nota existe do mesmo jeito.
- **`retry_pending`** não precisa de ação imediata — a lib já salvou o pendente. Você pode opcionalmente registrar um log para dashboard, mas o replay cron é quem fecha o ciclo.
- **Permanente** (`ReceitaRejectionError`, validação) consumiu o `nDPS` mas não vai virar NFS-e autorizada. Registre para auditoria e siga.

## 4. Cron de replay

Tudo que cai em `retry_pending` (de `emitir`, `cancelar` ou `substituir`) é persistido no `RetryStore`. Um cron que chama `replayPendingEvents` re-posta cada um com o XML assinado original (mesmo `infDPS.Id`; eventos deduplicados em `(chave, tipoEvento)`), então chamar N vezes não gera nota nova.

**Emissão já autorizada não vira falha.** O caso clássico de transiente é o timeout **depois** que o SEFIN gravou a NFS-e. O re-POST dessa DPS não devolve sucesso: volta como rejeição permanente — `E0014` (série/número já existe numa NFS-e) ou, se o pendente atravessou uma virada de layout, `E1235` (falha de schema). Antes de remover uma emissão rejeitada, a lib consulta `GET /dps/{idDps}`:

| `GET /dps/{id}`             | Item                                                                          | Store       |
|-----------------------------|-------------------------------------------------------------------------------|-------------|
| NFS-e encontrada            | `success_emission` (baixada via `GET /nfse/{chave}`), `reconciledFrom` = a rejeição | removida |
| NFS-e de **outra** DPS      | `failed_permanent` + `warn` `nfse.replay.reconcile_mismatch` (ver abaixo)       | removida    |
| 404                         | `failed_permanent` (`error` = a rejeição) — nenhuma NFS-e saiu dessa DPS       | removida    |
| falha transiente            | `still_pending` + `warn` `nfse.replay.reconcile_pending`                       | mantida     |
| outra falha (401/403/400, corpo malformado) | `still_pending` + `warn` `nfse.replay.reconcile_failed` — investigue: volta a cada varredura | mantida |

O `infDPS.Id` só codifica município, CNPJ/CPF, série e `nDPS`. Se a numeração colidiu (contador em memória reiniciado, `nDPS` explícito reaproveitado), o E0014 é legítimo e o `GET /dps/{id}` devolve a nota **antiga**. Por isso a lib confere a DPS embutida na NFS-e baixada contra a persistida — `SignatureValue` da DPS, ou `dhEmi` quando a persistida não tem assinatura — e, se divergem, devolve `failed_permanent`: o serviço pendente **não** foi faturado; reemita com um `nDPS` novo.

Resposta 201 que o parser não consegue ler vira `success_emission_unreadable` (`error` = `UnreadableAuthorizedNfseError` com `chaveAcesso`/`xmlNfse`): a nota existe e a entrada sai do store.

Entradas com `notBefore` no futuro (caso clássico: 429 com `Retry-After: 120`) são puladas silenciosamente — não aparecem no resultado e ficam no store até `notBefore <= now`. A cada falha transiente no replay, `notBefore` é recalculado pela `RetryPolicy` e `attempts` incrementado. **`replayPendingEvents` é single-threaded** — dois processos chamando concorrentemente duplicariam o tráfego para o SEFIN. Garanta exclusão mútua no caller (cron single-instance ou lock distribuído).

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
      // item.reconciledFrom presente: o re-POST foi rejeitado (E0014/E1235…),
      // mas GET /dps/{id} mostrou que a nota já existia.
      logger.info('replay emissão ok', { id: item.id, reconciliada: !!item.reconciledFrom });
      break;

    case 'success_emission_unreadable':
      // Autorizada, mas a lib não montou o DTO — persista chave + XML, não reemita.
      await db.insert('nfse_autorizadas', {
        chave_acesso: item.error.chaveAcesso,
        id_dps: item.error.idDps,
        xml_nfse: item.error.xmlNfse,
      });
      logger.error('replay: NFS-e autorizada sem DTO', { id: item.id, causa: item.error.cause });
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
      // Permanente — lib removeu do store. Para emissões, o GET /dps/{id}
      // confirmou que não há NFS-e dessa DPS (404, ou a nota achada é de outra
      // DPS — warn nfse.replay.reconcile_mismatch). Consulta que não decide
      // (403, corpo malformado…) nunca cai aqui: vira still_pending. Caller
      // decide (alerta, ticket, reemissão consciente com novo nDPS).
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
| `InvalidCnpjError`             | DV do CNPJ incorreto ou formato fora de `^[A-Z0-9]{12}\d{2}$` |
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
  layout: 'nt004',                               // obrigatório
  emitente: { /* ... */ },
  serie: '1', nDPS: '42',                        // obrigatório
  servico: { /* ... */ },
  valores: { /* ... */ },
});

const nfseAutorizada = await cliente.emitirDpsPronta(dps);
console.log(nfseAutorizada.chaveAcesso);
```

`buildDps` monta DPS completa a partir de ~10 campos semânticos (vs 50+ manuais). Defaults aplicados: `versao='1.01'`, `tpAmb='2'`, `tpEmit='1'`, `dhEmi=now`, `dCompet=now`, `tribISSQN='1'`, `tpRetISSQN='1'`, `locPrest=emitente.codMunicipio`.

**Total de tributos (`totTrib`) depende do regime** (`opSimpNac`) — o builder seleciona o membro válido e rejeita o inválido (E0710/E0712/E0713):

| Regime (`opSimpNac`) | Membro do `totTrib` |
|---|---|
| MEI (`2`) | `indTotTrib='0'` (default automático) |
| ME/EPP (`3`) | informe `pTotTribSN` (% aprox. do Simples) |
| Não Optante (`1`) | informe `vTotTrib` **ou** `pTotTrib` (Lei da Transparência / IBPT) |

Cobre ~85% dos casos; para **tomador exterior, obra, atividade-evento, dedução/redução, IBS/CBS**, construa `InfDPSNt004` manualmente (todos os tipos RTC estão exportados).

`emitirEmLote(dpsList, options)` segue o mesmo contrato — worker pool client-side sobre `DPS[]` pré-montado; cada item vem como `success`, `success_unreadable` (NFS-e autorizada cuja resposta não pôde ser interpretada: `item.error.chaveAcesso`/`xmlNfse`, conta em `successCount`, não reemita), `failure` ou `skipped`. A seção **5. Bulk com o mesmo fluxo seguro** acima é o equivalente idiomático para quem quer manter o `DpsCounter` + `RetryStore` no caminho.

## Exemplo runnable

[`examples/emit-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/emit-nfse) — `npm start` (emissão única) e `npm run bulk` (lote), ambos com dry-run por default.
