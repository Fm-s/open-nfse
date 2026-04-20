# Substituir e cancelar

| Operação     | Evento  | Quando usar                                                               |
|--------------|---------|---------------------------------------------------------------------------|
| `cancelar`   | 101101  | Nota emitida por erro ou serviço não prestado — sem reemissão             |
| `substituir` | 105102  | Nota precisa ser trocada (correção de valor, regime, imunidade)           |

## `cancelar` — evento 101101

Resultado **discriminated**: transientes vão pro `RetryStore`, permanentes lançam.

```typescript
import { JustificativaCancelamento } from 'open-nfse';

const r = await cliente.cancelar({
  chaveAcesso: '21113002200574753000100000000000146726037032711025',
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaCancelamento.ErroEmissao,   // '1' erro | '2' não prestado | '9' outros
  xMotivo: 'Valor digitado incorretamente',
  // nPedRegEvento: '1',  // default; determinístico → replay idempotente
});

if (r.status === 'ok') {
  console.log(r.evento.evento.infEvento.pedRegEvento.infPedReg.Id);
  console.log(r.evento.xmlEvento);
} else if (r.status === 'retry_pending') {
  // salvo no retryStore; cron chama replayPendingEvents() depois
  console.warn('Cancel transient:', r.pending.id);
}
// Rejeições permanentes (E8001 prazo, E8xxx regras municipais, E1xxx duplicata) lançam ReceitaRejectionError.
```

## `substituir` — máquina de 4 estados

Substituir é **emitir nova (com `<subst>`) + cancelar a original via 105102**. O XSD força essa ordem: `e105102` requer `<chSubstituta>` da nova, que só existe após o emit.

::: warning Janela de inconsistência
Entre emit e cancel há ~1-3s em que **ambas as notas estão válidas**. Se o cancel falhar, a lib aciona rollback automático ou persiste para retry — um dos 4 estados abaixo.
:::

```
emit novaDps (com subst preenchido)
├─ step 1 falha → throw (nada a reconciliar, retry limpo)
└─ step 1 ok → cancelar original via 105102
   ├─ transient     → 'retry_pending'      (salvo no store)
   ├─ permanente    → rollback nova via 101101
   │  ├─ ok         → 'rolled_back'        (audit trail fragmentado)
   │  └─ transient  → 'rollback_pending'   (salvo no store — pior caso)
   └─ ok            → 'ok'                 (status terminal feliz)
```

### Uso

```typescript
import { JustificativaSubstituicao, buildDps } from 'open-nfse';

const novaDps = buildDps({...});    // subst é auto-preenchido pela lib

const r = await cliente.substituir({
  chaveOriginal: '21113002200574753000100000000000146726037032711025',
  novaDps,
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaSubstituicao.Outros,
  xMotivo: 'Correção de valor',
});

switch (r.status) {
  case 'ok':
    console.log('Nova:', r.novaNfse.chaveAcesso);
    console.log('Cancelamento:', r.cancelamento.evento.infEvento.Id);
    break;
  case 'retry_pending':
    // nova emitida, cancel falhou transitoriamente, persistido no store
    console.warn('Cancel pendente:', r.pending.id);
    break;
  case 'rolled_back':
    // nova cancelada via 101101 porque cancel da original não pôde proceder
    console.error('Substituição abortada:', r.cancelamentoError.message);
    console.log('Rollback:', r.rollback.evento.infEvento.Id);
    break;
  case 'rollback_pending':
    // pior caso — ambos pendentes, precisa investigar
    console.error('cancel:', r.cancelamentoError.message);
    console.error('rollback:', r.rollbackError.message);
    console.error('pendente:', r.pendingRollback.id);
    break;
}
```

`substituir` só **lança** quando o step 1 (emit) falha — nada foi alterado no SEFIN, caller pode retentar. Após step 1, todo o resto é observável via `result.status`.

## RetryStore — persistência dos pendentes

```typescript
interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}
```

`PendingEvent` é discriminated: `kind: 'emission'` (falha de rede em `emitir`) ou `kind: 'cancelamento_simples' | 'cancelamento_por_substituicao' | 'rollback_cancelamento'` (eventos pós-emissão). Use `isPendingEmission` para narrow antes de acessar campos específicos.

`createInMemoryRetryStore()` cobre testes e demos; produção precisa persistir. Schema SQL + impl completa em [Integração em serviços](./integracao#1-9-nfse-pending-events-backing-store-para-retrystore).

## `replayPendingEvents` — job de retry

```typescript
// Cron a cada 1–5 min:
const results = await cliente.replayPendingEvents();

for (const r of results) {
  if (r.status === 'success_emission') logger.info('emit replay ok', r.id);
  if (r.status === 'success')          logger.info('evento replay ok', r.id);
  if (r.status === 'still_pending')    logger.warn('ainda transient', r.id, r.error.message);
  if (r.status === 'failed_permanent') logger.error('permanente', r.id, r.error.message);
}
```

Fluxo interno:
1. `store.list()` — mix de emissões + eventos
2. Re-POSTa cada um por `kind`:
   - `emission` → `POST /nfse` (SEFIN dedupa via `infDPS.Id`)
   - `cancelamento_*` / `rollback_*` → `POST /nfse/{chave}/eventos` (dedupa via `{chave, tipoEvento, nPedRegEvento}`)
3. Sucesso: `store.delete(id)`, item com `success` | `success_emission`
4. Transiente: mantém no store, item com `still_pending`
5. Permanente: **remove do store**, item com `failed_permanent`

Idempotência garantida pelo determinismo de `nPedRegEvento` (default `'001'`) e `infDPS.Id` — re-POST nunca cria duplicata.

## Regras que importam

1. **Prazo municipal** — cada município define sua janela (24h, 30d, 180d). Após o prazo, `E8001`.
2. **Estado da NFS-e** — já cancelada / já substituída / com eventos bloqueantes → rejeição.
3. **Chain check** — se a original já foi cancelada, o emit da nova (em `substituir`) falha upfront via `subst.chSubstda`.
4. **Dedup server-side** — SEFIN rejeita `{chave, tipoEvento, nPedRegEvento}` duplicado com código específico; retry nunca cria evento fantasma.
