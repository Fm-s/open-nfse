# Substituir e cancelar

| Operação     | Evento  | Quando usar                                                               |
|--------------|---------|---------------------------------------------------------------------------|
| `cancelar`   | 101101  | Nota emitida por erro ou serviço não prestado — sem reemissão             |
| `substituir` | 105102  | Nota precisa ser trocada (correção de valor, regime, imunidade)           |

Ambos usam o mesmo `RetryStore` do `emitir` — falhas transientes entram no mesmo pipeline de replay (cron de `replayPendingEvents`).

## `cancelar` — evento 101101

### 1. Chamada básica

```typescript
import { JustificativaCancelamento } from 'open-nfse';

const r = await cliente.cancelar({
  chaveAcesso: '21113002200574753000100000000000146726037032711025',
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaCancelamento.ErroEmissao,   // '1' erro | '2' não prestado | '9' outros
  xMotivo: 'Valor digitado incorretamente',
});
```

`nPedRegEvento` default é `'1'` — **determinístico por design**, para que retries caiam no dedup do SEFIN em vez de criar eventos duplicados.

### 2. Lidando com cada resultado

Mesma estrutura do `emitir`: três cenários distintos.

```typescript
import { ReceitaRejectionError } from 'open-nfse';

try {
  const r = await cliente.cancelar({ chaveAcesso, autor, cMotivo, xMotivo });

  if (r.status === 'ok') {
    // Cancelamento aceito pela Sefin. Persista o evento.
    await db.insert('nfse_eventos', {
      chave_acesso: r.evento.chaveNfse,
      tipo_evento: '101101',
      num_seq_evento: 1,
      xml_evento: r.evento.xmlEvento,
      dh_registro: r.evento.evento.infEvento.dhRegEvento,
      origem: 'emitido',
    });
    return;
  }

  if (r.status === 'retry_pending') {
    // Transiente. Já persistido no retryStore; cron cuida.
    logger.warn('cancel transient', { pendingId: r.pending.id, err: r.error.message });
    return;
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // Permanente. Típico: E8001 (prazo expirado), E8xxx (regra municipal),
    // E1xxx (nPedRegEvento duplicado).
    logger.error('cancel rejeitado', { codigo: err.codigo, descricao: err.descricao });
    return;
  }
  throw err;
}
```

## `substituir` — máquina de 4 estados

Substituir é **emitir nova (com `<subst>` apontando para a original) + cancelar a original via 105102**. O XSD força essa ordem: `e105102` exige a `<chSubstituta>` da nova, que só existe após o emit.

::: warning Janela de inconsistência
Entre emit e cancel há ~1-3 s em que **ambas as notas estão válidas**. A lib cobre a janela com rollback automático ou persistência para retry — um dos 4 estados abaixo.
:::

### 1. Fluxo

```
emit novaDps (com subst preenchido)
├─ step 1 falha → throw (nada a reconciliar, retry limpo)
└─ step 1 ok → cancelar original via 105102
   ├─ ok            → 'ok'                 ← caminho feliz
   ├─ transient     → 'retry_pending'      ← cron retoma depois
   └─ permanente    → rollback nova via 101101
      ├─ ok         → 'rolled_back'        ← audit trail fragmentado, mas consistente
      └─ transient  → 'rollback_pending'   ← pior caso, requer atenção
```

### 2. Chamada básica

```typescript
import { JustificativaSubstituicao, buildDps } from 'open-nfse';

const novaDps = buildDps({
  emitente: { /* mesmo do original */ },
  serie: '1',
  nDPS: '42',                         // obrigatório — use seu DpsCounter
  servico: { /* corrigido */ },
  valores: { /* corrigido */ },
  tomador: { /* ... */ },
  // subst é auto-preenchido pela lib com chaveOriginal
});

const r = await cliente.substituir({
  chaveOriginal: '21113002200574753000100000000000146726037032711025',
  novaDps,
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaSubstituicao.Outros,
  xMotivo: 'Correção de valor',
});
```

### 3. Lidando com cada estado

```typescript
try {
  const r = await cliente.substituir({ chaveOriginal, novaDps, autor, cMotivo, xMotivo });

  switch (r.status) {
    case 'ok':
      // Caminho feliz: nova emitida e original cancelada.
      await db.tx(async (tx) => {
        await tx.insert('nfse_autorizadas', { /* a partir de r.novaNfse */ });
        await tx.insert('nfse_eventos', {
          chave_acesso: r.cancelamento.chaveNfse,
          tipo_evento: '105102',
          xml_evento: r.cancelamento.xmlEvento,
          /* ... */
        });
      });
      break;

    case 'retry_pending':
      // Nova autorizada; cancel falhou transitoriamente, persistido no store.
      // A original ainda está válida até o cron do replay fechar o ciclo.
      await db.insert('nfse_autorizadas', { /* a partir de r.novaNfse */ });
      logger.warn('substituir cancel pendente', { id: r.pending.id });
      break;

    case 'rolled_back':
      // Cancel permanente falhou (p.ex. prazo expirado). Lib cancelou a nova
      // via 101101 para não deixar duas notas válidas. A original permanece.
      // Audit trail: salva ambas para ter o histórico completo.
      await db.tx(async (tx) => {
        await tx.insert('nfse_autorizadas', { /* r.novaNfse */ });
        await tx.insert('nfse_eventos', { /* r.rollback, tipo 101101 */ });
      });
      logger.error('substituir abortada', { err: r.cancelamentoError.message });
      alerts.send('Substituição não foi possível — revisar manualmente', { chaveOriginal });
      break;

    case 'rollback_pending':
      // Pior caso: nova válida, original válida, rollback transiente falhou.
      // Requer atenção humana eventualmente; cron retoma o rollback.
      logger.error('substituir inconsistente', {
        cancel: r.cancelamentoError.message,
        rollback: r.rollbackError.message,
        pendente: r.pendingRollback.id,
      });
      alerts.send('Substituição pendente de rollback — duas notas válidas temporariamente', {
        chaveOriginal,
        chaveNova: r.novaNfse.chaveAcesso,
      });
      break;
  }
} catch (err) {
  // Só cai aqui se o step 1 (emit da nova) falhou. Nada foi alterado no SEFIN.
  // Retry limpo (com novo idDps) é seguro.
  if (err instanceof ReceitaRejectionError) {
    logger.error('substituir emit falhou', { codigo: err.codigo });
  }
}
```

### Regras de decisão

| Estado              | Duas notas válidas? | Ação imediata                                         |
|---------------------|---------------------|-------------------------------------------------------|
| `ok`                | Não                 | Persistir; done                                       |
| `retry_pending`     | Sim (~minutos)      | Log; cron fecha                                       |
| `rolled_back`       | Não (nova cancelada)| Persistir pair; revisar motivo — original intocada    |
| `rollback_pending`  | Sim (indeterminado) | Alerta humano; cron tenta; pode virar `rolled_back` ou `failed_permanent` depois |

## Cron de replay

Mesma função que cobre `emitir(params)` transientes cobre `cancelar` e `substituir` — `replayPendingEvents` distingue pelos `kind` das entries no store:

```typescript
// a cada 1-5 min, um worker só
const items = await cliente.replayPendingEvents();

for (const item of items) {
  switch (item.status) {
    case 'success_emission':
      // Veio de emitir(params) transiente
      await db.insert('nfse_autorizadas', { /* ... */ });
      break;

    case 'success':
      // Veio de cancelar/substituir/rollback transiente
      await db.insert('nfse_eventos', { /* ... */ });
      break;

    case 'still_pending':
      logger.warn('ainda transient', { id: item.id });
      break;

    case 'failed_permanent':
      // Lib removeu do store. Você decide (alerta, ticket, etc.)
      logger.error('permanente no replay', { id: item.id, err: item.error.message });
      alerts.send('Pending event falhou permanentemente', { id: item.id });
      break;
  }
}
```

Idempotência é garantida pelo dedup server-side da Sefin:
- **Emissões** deduplicam via `infDPS.Id` (45 chars, único por CNPJ+série+nDPS).
- **Eventos** deduplicam via `(chave, tipoEvento, nPedRegEvento)` — `nPedRegEvento` default `'001'` é determinístico.

Re-POSTar o mesmo payload nunca cria duplicata: a Receita retorna o mesmo evento autorizado ou uma rejeição de duplicata reconhecível.

## Interface `RetryStore`

```typescript
interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}
```

`PendingEvent` é discriminated union:

```typescript
type PendingEvent = PendingEmission | PendingEventoCancelamento;

// kind: 'emission'                       ← emitir(params) transiente
// kind: 'cancelamento_simples'           ← cancelar() transiente
// kind: 'cancelamento_por_substituicao'  ← substituir() cancel transiente
// kind: 'rollback_cancelamento'          ← substituir() rollback transiente
```

Use `isPendingEmission(e)` para narrow antes de acessar campos específicos de cada variante. `createInMemoryRetryStore()` serve para testes e demos; produção precisa persistir durável — impl Postgres completa em [Integração em serviços](./integracao#1-8-nfse-pending-events-backing-store-para-retrystore).

## Regras de negócio que importam

1. **Prazo municipal** — cada município define sua janela de cancelamento (24h, 30d, 180d). Após o prazo, `E8001`.
2. **Estado da NFS-e** — já cancelada, já substituída, ou com eventos bloqueantes → rejeição upfront.
3. **Chain check em `substituir`** — se a original já foi cancelada, o emit da nova falha upfront no `subst.chSubstda`. Sem dangling state.
4. **Dedup server-side** — SEFIN rejeita `{chave, tipoEvento, nPedRegEvento}` duplicado com código específico; retry nunca cria evento fantasma.
