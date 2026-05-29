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

Eventos deduplicam server-side por `(chave, tipoEvento)` — **determinístico por design**, para que retries caiam no dedup do SEFIN em vez de criar eventos duplicados.

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
    // E1xxx (evento duplicado).
    logger.error('cancel rejeitado', { codigo: err.codigo, descricao: err.descricao });
    return;
  }
  throw err;
}
```

## `substituir` — emite a nova DPS com `<subst>`

Substituir é **emitir a nova DPS com `infDPS/subst` apontando para a NFS-e original**. Você envia *uma* mensagem (`POST /nfse`); o **Sistema Nacional NFS-e** gera, de forma atômica com a emissão, o evento **105102 (Cancelamento por Substituição, `autor=MEmis`)** que cancela a original, e retorna a NFS-e substituta.

::: tip Por que não há "máquina de 5 estados" / rollback
O contribuinte **não** registra o evento 105102 — ele é gerado pelo servidor (`autor=05 MEmis`, assinado pelo município emissor). Como há um **único write** (a DPS), não existe janela de inconsistência nem rollback. O resultado é discriminado igual ao de `emitir`: `'ok'` (`novaNfse`) ou `'retry_pending'` (falha transiente no `POST /nfse`, persistida no `retryStore` para replay idempotente via `replayPendingEvents` — dedup por `infDPS.Id`). Rejeição **permanente** (regra fiscal) **lança**. Postar um pedRegEvento 105102 como contribuinte é rejeitado: redundante (evento único → E0845) e com autor/assinante inválidos (E0813/E2032). Ref.: Manual dos Contribuintes — API Sistema Nacional NFS-e v1.2 §1.3.2.
:::

### Chamada

```typescript
import { JustificativaSubstituicao, buildDps } from 'open-nfse';

const novaDps = buildDps({
  emitente: { /* mesmo do original */ },
  serie: '1',
  nDPS: '42',                         // obrigatório — use seu DpsCounter
  servico: { /* corrigido */ },
  valores: { /* corrigido */ },
  tomador: { /* ... */ },
  // infDPS.subst é auto-preenchido pela lib com chaveOriginal
});

try {
  const r = await cliente.substituir({
    chaveOriginal: '21113002200574753000100000000000146726037032711025',
    novaDps,
    cMotivo: JustificativaSubstituicao.Outros,
    xMotivo: 'Correção de valor',
  });

  if (r.status === 'ok') {
    // A nova foi autorizada e a original cancelada pelo sistema (105102).
    await db.insert('nfse_autorizadas', { /* a partir de r.novaNfse */ });
  } else {
    // Transiente: a emissão foi persistida no retryStore; o cron de
    // replayPendingEvents reenvia (idempotente por infDPS.Id). Nada no SEFIN ainda.
    logger.warn('substituir pendente', { id: r.pending.id });
  }
} catch (err) {
  // Rejeição PERMANENTE da emissão (ex.: prazo, original já cancelada) — nada
  // foi alterado no SEFIN; retry limpo só faz sentido após corrigir a causa.
  if (err instanceof ReceitaRejectionError) {
    logger.error('substituir falhou', { codigo: err.codigo });
  }
}
```

`substituir` aceita as mesmas opções de validação de `emitir` (`skipValidation`, `skipCepValidation`, `skipCpfCnpjValidation`, `cepValidator`) e a mesma resiliência a transientes (`retryStore`/`isTransient`). Não há `autor`/`tpAmb`/`verAplic`/`dhEvento` — o contribuinte não registra evento.

### Observar o evento 105102

O 105102 é gravado pela Receita na NFS-e **original**. Para auditá-lo, leia os eventos da chave original (distribuição por NSU, ou a consulta de eventos da NFS-e) — a `substituir` não "retorna" um evento porque o contribuinte não o emitiu.

## Cron de replay

A mesma função cobre os transientes de `emitir(params)`, `cancelar` **e** `substituir` — `replayPendingEvents` distingue pelos `kind` das entries no store. A pendência da `substituir` é uma **emissão** (`kind: 'emission'`, a DPS com `<subst>`), então replaya como `success_emission` — igual a `emitir`.

```typescript
// a cada 1-5 min, um worker só
const items = await cliente.replayPendingEvents();

for (const item of items) {
  switch (item.status) {
    case 'success_emission':
      // Veio de emitir(params) OU substituir() transiente (kind 'emission')
      await db.insert('nfse_autorizadas', { /* ... */ });
      break;

    case 'success':
      // Veio de cancelar() transiente (ou de dados legados de substituição)
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
- **Eventos** deduplicam via `(chave, tipoEvento)` — determinístico por NFS-e e tipo de evento.

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
// kind: 'cancelamento_por_substituicao'  ← legado (substituir não gera mais; mantido p/ replay de dados antigos)
// kind: 'rollback_cancelamento'          ← legado (idem)
```

Use `isPendingEmission(e)` para narrow antes de acessar campos específicos de cada variante. `createInMemoryRetryStore()` serve para testes e demos; produção precisa persistir durável — impl Postgres completa em [Integração em serviços](./integracao#1-8-nfse-pending-events-backing-store-para-retrystore).

## Regras de negócio que importam

1. **Prazo é parametrizado pelo município** (rule E0050 para substituição, E0822 para cancelamento). Cada município define sua janela (24 h, 30 d, 180 d…) e a Receita retorna `E8001` ao expirar. Para checagem prévia, consulte via `consultarAliquota` / `consultarBeneficio` (guia [Parâmetros municipais](./parametros)).
2. **Estado da NFS-e** — já cancelada, já substituída, ou com eventos bloqueantes → rejeição upfront.
3. **Chain check em `substituir`** — se a original já foi cancelada, o emit da nova falha upfront no `subst.chSubstda`. Sem dangling state.
4. **Dedup server-side** — SEFIN rejeita `{chave, tipoEvento}` duplicado com código específico; retry nunca cria evento fantasma.
5. **`cMotivo=99` exige `xMotivo`** (rule E0078 do Anexo I). A lib faz o pré-check local e lança `RuleViolationError` antes do wire — evita consumir `nDPS` num emit que seria rejeitado.

### Classificação de erros transientes

Por default (`defaultIsTransient`), `ReceitaRejectionError` é **permanente** — 426 dos 428 códigos do Anexo I são de fato permanentes. As duas exceções são tratadas como transientes automaticamente:

- **E1217** — "Serviço paralisado para manutenção" (janela de maintenance do SEFIN).
- **E1206** — "Certificado de Transmissão — Erro de acesso a LCR" (CRL reachable).

Ambos vão para o `RetryStore` e são retentados pelo cron de `replayPendingEvents`. Para sobrescrever a classificação, passe `isTransient: (err) => boolean` nas opções de cada método.
