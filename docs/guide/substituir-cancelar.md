# Substituir e cancelar

Dois caminhos pós-emissão:

| Operação     | Evento  | Quando usar                                                                   |
|--------------|---------|-------------------------------------------------------------------------------|
| `cancelar`   | 101101  | Nota foi emitida por erro ou serviço não foi prestado — sem reemissão         |
| `substituir` | 105102  | Nota precisa ser trocada por outra (correção de valor, regime, imunidade)     |

## `cancelar` — evento 101101

```typescript
import { JustificativaCancelamento } from 'open-nfse';

const r = await cliente.cancelar({
  chaveAcesso: '21113002200574753000100000000000146726037032711025',
  autor: { CNPJ: '00574753000100' },                    // quem autoriza o evento
  cMotivo: JustificativaCancelamento.ErroEmissao,        // 1 = erro, 2 = não prestado, 9 = outros
  xMotivo: 'Valor digitado incorretamente',
  // nPedRegEvento: '1',  // default — para cancelamentos, deixe '1'
});

r.evento.infEvento.pedRegEvento.infPedReg.Id;   // "PRE..."
r.xmlEvento;                                     // XML do <evento> assinado pela Sefin
r.dataHoraProcessamento;
```

### Códigos de justificativa

| Valor | Descrição             |
|-------|-----------------------|
| `'1'` | Erro na Emissão       |
| `'2'` | Serviço não Prestado  |
| `'9'` | Outros                |

### Erros possíveis

```typescript
try {
  await cliente.cancelar({...});
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // err.codigo identifica a regra violada:
    // E8001 — prazo de cancelamento expirado
    // E8xxx — outras regras municipais
    // E1xxx — duplicata detectada (mesmo nPedRegEvento já processado)
  }
}
```

## `substituir` — máquina de 4 estados

Substituir é **emitir nova (com `<subst>`) + cancelar a original via 105102**. O XSD força essa ordem: `e105102` requer `<chSubstituta>` (chave da nova), que só existe após o emit.

::: warning Janela de inconsistência
Há uma janela de ~1-3 segundos entre emit e cancel durante a qual **ambas as notas estão válidas**. Se o cancel falhar, a lib aciona compensação (rollback automático) ou persiste para retry. Veja os 4 estados abaixo.
:::

### Fluxo

```
emit novaDps (com subst preenchido) ──┐
                                      │
                              (step 1 falha)
                                      ↓
                                   throw (nada a reconciliar)
                                      │
                              (step 1 ok)
                                      ↓
cancelar original via 105102 ─────────┤
                                      │
                              ┌───────┼──────────────┐
                          transient  permanente    ok
                              │       │              │
                              ↓       ↓              ↓
                     retry_pending  rollback novo  status: 'ok'
                     (salva store)   via 101101     (cancelamento: r)
                                      │
                                      ↓
                             ┌────────┴─────┐
                             ok       transient
                             │          │
                             ↓          ↓
                     rolled_back  rollback_pending
                                  (salva store)
```

### Uso

```typescript
import {
  JustificativaSubstituicao,
  buildDps,
  createInMemoryRetryStore,
} from 'open-nfse';

const retryStore = createInMemoryRetryStore();  // ou sua impl de DB

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado,
  retryStore,                                    // default para substituir()
});

const novaDps = buildDps({...});                 // subst é auto-preenchido

const r = await cliente.substituir({
  chaveOriginal: '21113002200574753000100000000000146726037032711025',
  novaDps,
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaSubstituicao.Outros,
  xMotivo: 'Correção de valor',
});

switch (r.status) {
  case 'ok':
    console.log('Nova chave:', r.novaNfse.chaveAcesso);
    console.log('Cancelamento:', r.cancelamento.evento.infEvento.Id);
    break;

  case 'retry_pending':
    // emit ok, cancel falhou transitoriamente — já persistido
    console.warn('Cancel transient, pending:', r.pending.id);
    // r.novaNfse.chaveAcesso existe mas a original ainda não foi cancelada
    // → seu job de cron chama replayPendingEvents() e o SEFIN dedupe via nPedReg
    break;

  case 'rolled_back':
    // emit ok, cancel permanentemente falhou (ex: prazo expirado), rollback ok
    // → a nova foi cancelada via 101101 para compensar
    // → audit trail fica fragmentado, o par não está linkado
    console.error('Substituição abortada:', r.cancelamentoError.message);
    console.log('Nova NFS-e (cancelada automaticamente):', r.rollback.evento.infEvento.Id);
    break;

  case 'rollback_pending':
    // pior caso — emit ok, cancel permanente falhou, rollback transitório falhou
    // → nova está válida, original ainda existe, rollback persistido para retry
    console.error('Inconsistência! Ambos pendentes:');
    console.error('  cancel err:', r.cancelamentoError.message);
    console.error('  rollback err:', r.rollbackError.message);
    console.error('  pendente (retry rollback):', r.pendingRollback.id);
    break;
}
```

### Quando `substituir` **throw**-a

Apenas quando a emissão (step 1) falha. Nesse caso nada foi alterado no SEFIN e o caller pode retentar limpo:

```typescript
try {
  await cliente.substituir({...});
} catch (err) {
  // step 1 (emit da nova DPS) falhou — nada foi alterado no SEFIN
  // pode ser: ReceitaRejectionError, InvalidCepError, XsdValidationError, NetworkError...
}
```

Após step 1, todo o restante é observável via `result.status` — sem throws.

## RetryStore — persistência dos pendentes

### Interface

```typescript
interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}
```

Três operações **idempotentes**. A lib ships `createInMemoryRetryStore()` como default para testes e demos. Produção precisa de persistência durável:

### Exemplo PostgreSQL

```typescript
import type { RetryStore, PendingEvent } from 'open-nfse';

const pgStore: RetryStore = {
  async save(entry) {
    await db.query(
      `INSERT INTO nfse_pending_events (id, kind, chave_nfse, chave_substituta,
           tipo_evento, n_ped_reg, c_motivo, x_motivo, xml_pedido,
           first_attempt_at, last_attempt_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
           last_attempt_at = EXCLUDED.last_attempt_at,
           last_error = EXCLUDED.last_error`,
      [
        entry.id, entry.kind, entry.chaveNfse, entry.chaveSubstituta ?? null,
        entry.tipoEvento, entry.nPedRegEvento, entry.cMotivo, entry.xMotivo ?? null,
        entry.xmlPedidoAssinado,
        entry.firstAttemptAt, entry.lastAttemptAt,
        JSON.stringify(entry.lastError),
      ],
    );
  },

  async list() {
    const { rows } = await db.query(`SELECT * FROM nfse_pending_events`);
    return rows.map(rowToPendingEvent);
  },

  async delete(id) {
    await db.query(`DELETE FROM nfse_pending_events WHERE id = $1`, [id]);
  },
};

const cliente = new NfseClient({...config, retryStore: pgStore});
```

O schema completo está em [Integração em serviços](./integracao).

## `replayPendingEvents` — job de retry

```typescript
// Em cron (a cada 1-5 min):
const results = await cliente.replayPendingEvents();

for (const r of results) {
  if (r.status === 'success')          logger.info('replay ok', r.id);
  if (r.status === 'still_pending')    logger.warn('replay transient', r.id, r.error.message);
  if (r.status === 'failed_permanent') logger.error('replay permanent', r.id, r.error.message);
}
```

A lib:
1. `store.list()` para buscar pendentes
2. Re-POSTa cada um com `xmlPedidoAssinado` cru (SEFIN deduplica via `{chave, tipoEvento, nPedRegEvento}`)
3. Em sucesso: `store.delete(id)`
4. Em falha transiente: mantém no store (tenta de novo na próxima rodada)
5. Em falha permanente: **remove do store** e reporta no `results[]` — caller decide o que fazer

::: tip Idempotência garantida
Porque `nPedRegEvento` é determinístico (default `'001'` para o primeiro cancelamento), re-POSTar o mesmo pedido **nunca cria evento duplicado**. O SEFIN retorna o mesmo evento ou uma rejeição de duplicata reconhecível.
:::

## Regras de cancelamento que importam

1. **Prazo municipal** — cada município define sua janela (24h, 30d, 180d). Após o prazo, a Receita responde `E8001`.
2. **Estado da NFS-e** — já cancelada / já substituída / com eventos bloqueantes → rejeição.
3. **Chain check** — `subst.chSubstda` na nova DPS é validado antes da emissão; se a original já foi cancelada, o emit da nova **falha upfront** (não cria dangling state).
4. **Idempotência de retries** — SEFIN rejeita `{chave, tipoEvento, nPedRegEvento}` duplicado com código específico. Seu retry nunca cria evento fantasma.
