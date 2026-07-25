# Integração em serviços

A lib não persiste nada — oferece as interfaces (`DpsCounter`, `RetryStore`, `ParametrosCache`) e o fluxo. O banco fica com você. Este guia cobre o **schema SQL mínimo** e o fluxo recomendado de produção.

> **Mental model:** a lib roda validações offline, **só depois consulta o counter**, e falhas de rede viram `retry_pending` no store com replay idempotente (SEFIN dedupa via `infDPS.Id`). Rejeições permanentes lançam — aí o `nDPS` foi consumido.

## Qual banco eu preciso? {#quanto-banco}

Depende do que você faz com a lib. Comece pelo seu caso e ignore o resto:

| Caso de uso | Tabelas |
|---|---|
| Só **consultar** NFS-e / gerar DANFSe | **Nenhuma.** Persistir o resultado é opcional. |
| **Emitir** em produção | **3 tabelas**: [`dps_counters`](#dps-counters) + [`nfse_pending_events`](#nfse-pending-events) + [`nfse_autorizadas`](#nfse-autorizadas) |
| **Cancelar / substituir** | As mesmas 3 (pendentes caem em `nfse_pending_events`). Trilha de auditoria: + [`nfse_eventos`](#nfse-eventos) |
| **Receber** notas de fornecedores (distribuição DF-e) | + [`nsu_cursors`](#nsu-cursors) + [`dfe_recebidos`](#dfe-recebidos) |
| Operar **vários CNPJs** | + [`emitentes`](#emitentes) (normaliza as colunas `cnpj` em FK) |
| Auditoria de **rejeições** | + [`nfse_rejeicoes`](#nfse-rejeicoes) |

Todo SQL abaixo é PostgreSQL, traduzível para MySQL (`CHAR`/`VARCHAR` iguais, `BIGSERIAL` → `BIGINT AUTO_INCREMENT`, `TIMESTAMPTZ` → `DATETIME(3)`, `TEXT` → `MEDIUMTEXT`) ou SQL Server (`IDENTITY`, `DATETIME2`, `NVARCHAR(MAX)`).

::: tip CNPJ alfanumérico
Os `CHECK (cnpj ~ '^\d{14}$')` abaixo assumem CNPJ numérico — o que o leiaute da DPS aceita hoje. Quando a NT 009/2026 entrar em vigor (campos N → C), troque para `'^[A-Z0-9]{12}\d{2}$'`.
:::

## 1. O mínimo para emitir — 3 tabelas {#minimo}

### 1.1. `dps_counters` — backing store para `DpsCounter` {#dps-counters}

`nDPS` é sequencial por `(emitente, série)`. A Receita rejeita duplicados ou fora de ordem — **use sempre um increment atômico** (`INSERT ... ON CONFLICT ... RETURNING`), nunca `SELECT` + `UPDATE`.

```sql
CREATE TABLE dps_counters (
  cnpj         CHAR(14)   NOT NULL CHECK (cnpj ~ '^\d{14}$'),
  serie        VARCHAR(5) NOT NULL CHECK (serie ~ '^\d{1,5}$'),
  proximo_ndps BIGINT     NOT NULL DEFAULT 1 CHECK (proximo_ndps BETWEEN 1 AND 999999999999999),
  PRIMARY KEY (cnpj, serie)
);
```

Impl mínima:

```typescript
import type { DpsCounter } from 'open-nfse';

const pgDpsCounter: DpsCounter = {
  async next({ emitenteCnpj, serie }) {
    const { rows: [row] } = await db.query(
      `INSERT INTO dps_counters (cnpj, serie, proximo_ndps)
       VALUES ($1, $2, 2)
       ON CONFLICT (cnpj, serie) DO UPDATE
         SET proximo_ndps = dps_counters.proximo_ndps + 1
       RETURNING proximo_ndps - 1 AS ndps`,
      [emitenteCnpj, serie],
    );
    return String(row.ndps);
  },
};
```

### 1.2. `nfse_pending_events` — backing store para `RetryStore` {#nfse-pending-events}

`PendingEvent` é discriminated union. Uma tabela com colunas nullable cobre todos os kinds:

| `kind`                          | Origem                                                                                  |
|---------------------------------|------------------------------------------------------------------------------------------|
| `emission`                      | `emitir(params)` **ou** `substituir()` transiente (a substituição é uma emissão de DPS com `<subst>`) |
| `cancelamento_simples`          | `cancelar()` transiente                                                                  |
| `cancelamento_por_substituicao` | **legado** (≤ v0.8.x) — o `substituir()` atual não gera mais; mantido para replay de dados antigos |
| `rollback_cancelamento`         | **legado** (≤ v0.8.x) — idem                                                             |

```sql
CREATE TABLE nfse_pending_events (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN (
                         'emission', 'cancelamento_simples',
                         'cancelamento_por_substituicao', 'rollback_cancelamento'
                       )),
  -- emission:
  id_dps               CHAR(45),
  emitente_cnpj        CHAR(14),
  serie                VARCHAR(5),
  ndps                 BIGINT,
  -- eventos:
  chave_nfse           CHAR(50),
  chave_substituta     CHAR(50),
  tipo_evento          VARCHAR(10),
  c_motivo             VARCHAR(2),
  x_motivo             TEXT,
  -- comum:
  xml_assinado         TEXT NOT NULL,
  first_attempt_at     TIMESTAMPTZ NOT NULL,
  last_attempt_at      TIMESTAMPTZ NOT NULL,
  not_before           TIMESTAMPTZ,                       -- v0.8: backoff até esse instante
  attempts             INT NOT NULL DEFAULT 1 CHECK (attempts >= 1),  -- v0.8: tentativas até agora
  last_error_msg       TEXT NOT NULL,
  last_error_name      TEXT NOT NULL,
  last_error_transient BOOLEAN NOT NULL,
  CHECK (
    (kind = 'emission' AND id_dps IS NOT NULL AND emitente_cnpj IS NOT NULL)
    OR (kind <> 'emission' AND chave_nfse IS NOT NULL AND tipo_evento IS NOT NULL)
  )
);

CREATE INDEX ix_pending_kind         ON nfse_pending_events (kind);
CREATE INDEX ix_pending_chave        ON nfse_pending_events (chave_nfse) WHERE chave_nfse IS NOT NULL;
CREATE INDEX ix_pending_emitente     ON nfse_pending_events (emitente_cnpj) WHERE emitente_cnpj IS NOT NULL;
CREATE INDEX ix_pending_last_attempt ON nfse_pending_events (last_attempt_at);
CREATE INDEX ix_pending_not_before   ON nfse_pending_events (not_before) WHERE not_before IS NOT NULL;
```

> **Migração de v0.7.x →** Se você está atualizando uma instalação que já tem a tabela:
>
> ```sql
> ALTER TABLE nfse_pending_events
>   ADD COLUMN not_before TIMESTAMPTZ,
>   ADD COLUMN attempts   INT NOT NULL DEFAULT 1 CHECK (attempts >= 1);
> CREATE INDEX ix_pending_not_before ON nfse_pending_events (not_before) WHERE not_before IS NOT NULL;
> ```
>
> Linhas existentes ficam com `not_before NULL` (elegíveis imediatamente no próximo sweep) e `attempts = 1` — comportamento idêntico ao anterior. **Drene o store via `replayPendingEvents()` antes de upgradar** se você tem pendentes de eventos: v0.7.2/v0.7.3 persistia XML não-assinado no caminho transiente (bug, corrigido em 0.8.0). A v0.8 detecta e re-assina entradas legadas automaticamente, mas planeje desligar o tráfego durante a primeira passada.

Impl do `RetryStore`:

```typescript
import type { RetryStore, PendingEvent } from 'open-nfse';
import { isPendingEmission } from 'open-nfse';

const pgStore: RetryStore = {
  async save(e: PendingEvent) {
    const common = {
      id: e.id, kind: e.kind, xml_assinado: e.xmlAssinado,
      first_attempt_at: e.firstAttemptAt, last_attempt_at: e.lastAttemptAt,
      not_before: e.notBefore ?? null,
      attempts: e.attempts ?? 1,
      last_error_msg: e.lastError.message,
      last_error_name: e.lastError.errorName,
      last_error_transient: e.lastError.transient,
    };
    const row = isPendingEmission(e)
      ? { ...common, id_dps: e.idDps, emitente_cnpj: e.emitenteCnpj, serie: e.serie, ndps: e.nDPS }
      : { ...common, chave_nfse: e.chaveNfse, chave_substituta: e.chaveSubstituta ?? null,
          tipo_evento: e.tipoEvento,
          c_motivo: e.cMotivo, x_motivo: e.xMotivo ?? null };
    await db.insertOrUpdate('nfse_pending_events', row, { onConflict: 'id' });
  },
  async list() {
    // SELECT * → map por kind como no narrow inverso acima.
    // IMPORTANTE: certifique-se de retornar Date objects (não strings ISO)
    // para os três campos de timestamp — a lib compara `notBefore > now`
    // com Date e string-vs-Date faz coerção JS imprevisível. node-postgres
    // já retorna Date para TIMESTAMPTZ; verifique o driver que você usa.
  },
  async delete(id) { await db.query(`DELETE FROM nfse_pending_events WHERE id = $1`, [id]); },
};
```

### 1.3. `nfse_autorizadas` — NFS-e aceitas {#nfse-autorizadas}

Documento fiscal oficial assinado pela Sefin. **Retenção mínima 5 anos** (CTN art. 173); a maioria das empresas guarda indefinidamente.

```sql
CREATE TABLE nfse_autorizadas (
  chave_acesso          CHAR(50) PRIMARY KEY CHECK (chave_acesso ~ '^\d{50}$'),
  emitente_cnpj         CHAR(14) NOT NULL CHECK (emitente_cnpj ~ '^\d{14}$'),
  id_dps                CHAR(45) NOT NULL UNIQUE,
  nnfse                 VARCHAR(30) NOT NULL,     -- número municipal
  ndfse                 VARCHAR(30),              -- número nacional (DFe)
  xml_nfse              TEXT NOT NULL,            -- documento fiscal assinado
  dh_proc               TIMESTAMPTZ NOT NULL,
  valor_liquido         NUMERIC(15, 2) NOT NULL,
  tomador_identificador TEXT,                     -- CNPJ/CPF (útil para queries)
  tipo_ambiente         SMALLINT NOT NULL CHECK (tipo_ambiente IN (1, 2)),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_nfse_emitente_dhproc ON nfse_autorizadas (emitente_cnpj, dh_proc DESC);
CREATE INDEX ix_nfse_tomador         ON nfse_autorizadas (tomador_identificador);
```

É isso — com essas 3 tabelas (e o cron da [seção 3](#fluxo)) você tem emissão de produção completa. As tabelas abaixo entram conforme o caso de uso.

## 2. Tabelas opcionais {#opcionais}

### 2.1. `emitentes` — se você opera vários CNPJs {#emitentes}

Num serviço single-CNPJ, os dados do emitente cabem em config/env e as colunas `cnpj` das tabelas do mínimo bastam. Operando **vários CNPJs**, normalize: crie `emitentes` e troque `dps_counters.cnpj` / `nfse_autorizadas.emitente_cnpj` por `emitente_id BIGINT REFERENCES emitentes(id)`.

Certificado **fora do banco** — KMS/Vault, coluna guarda só referência opaca.

```sql
CREATE TABLE emitentes (
  id                     BIGSERIAL PRIMARY KEY,
  cnpj                   CHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^\d{14}$'),
  inscricao_municipal    VARCHAR(30) NOT NULL,
  cod_municipio          CHAR(7)  NOT NULL CHECK (cod_municipio ~ '^\d{7}$'),
  razao_social           TEXT NOT NULL,
  ambiente               SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),  -- 1=Prod, 2=Homolog
  certificate_ref        TEXT NOT NULL,          -- KMS ARN, Vault path, etc.
  certificate_expires_on DATE,                   -- para alerta proativo
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2. `nfse_rejeicoes` — auditoria de rejeições permanentes {#nfse-rejeicoes}

```sql
CREATE TABLE nfse_rejeicoes (
  id         BIGSERIAL PRIMARY KEY,
  id_dps     CHAR(45) NOT NULL,
  codigo     VARCHAR(20) NOT NULL,
  descricao  TEXT NOT NULL,
  mensagens  JSONB NOT NULL,    -- array completo de MensagemProcessamento
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_rejeicoes_codigo ON nfse_rejeicoes (codigo);
```

### 2.3. `nsu_cursors` — cursor de distribuição por CNPJ {#nsu-cursors}

Só se você consome DF-e (lado tomador / sync incremental). `fetchByNsu` é incremental — salve o `ultimoNsu` antes de processar o próximo lote.

```sql
CREATE TABLE nsu_cursors (
  cnpj       CHAR(14) PRIMARY KEY CHECK (cnpj ~ '^\d{14}$'),
  ultimo_nsu BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4. `dfe_recebidos` — DF-e recebidos (lado tomador) {#dfe-recebidos}

```sql
CREATE TABLE dfe_recebidos (
  id             BIGSERIAL PRIMARY KEY,
  cnpj_consulta  CHAR(14) NOT NULL,
  nsu            BIGINT NOT NULL,
  tipo_documento TEXT NOT NULL,              -- NFSE | EVENTO_NFSE | ...
  chave_acesso   CHAR(50),
  tipo_evento    VARCHAR(10),
  xml_documento  TEXT NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cnpj_consulta, nsu)
);
CREATE INDEX ix_dfe_chave ON dfe_recebidos (chave_acesso);
```

### 2.5. `nfse_eventos` — trilha de cancelamento, substituição, etc. {#nfse-eventos}

Registre uma linha quando `cliente.cancelar()` ou `cliente.substituir()` retornar sucesso.

```sql
CREATE TABLE nfse_eventos (
  id             BIGSERIAL PRIMARY KEY,
  chave_acesso   CHAR(50) NOT NULL REFERENCES nfse_autorizadas(chave_acesso),
  tipo_evento    VARCHAR(10) NOT NULL,          -- 101101, 105102, ...
  num_seq_evento INT NOT NULL,
  xml_evento     TEXT NOT NULL,
  dh_registro    TIMESTAMPTZ NOT NULL,
  origem         TEXT NOT NULL CHECK (origem IN ('emitido', 'recebido_dfe')),
  UNIQUE (chave_acesso, tipo_evento, num_seq_evento)
);
```

## 3. Fluxo de emissão {#fluxo}

```typescript
const cnpjEmitente = '00574753000100';
const r = await cliente.emitir({ emitente: { cnpj: cnpjEmitente, ... }, serie: '1', servico: {...}, valores: {...}, tomador: {...} });

if (r.status === 'ok') {
  await db.insert('nfse_autorizadas', {
    chave_acesso: r.nfse.chaveAcesso,
    emitente_cnpj: cnpjEmitente,
    id_dps: r.nfse.idDps,
    xml_nfse: r.nfse.xmlNfse,
    nnfse: r.nfse.nfse.infNFSe.nNFSe,
    dh_proc: r.nfse.dataHoraProcessamento,
    tipo_ambiente: r.nfse.tipoAmbiente,
    // ...
  });
}
// r.status === 'retry_pending' já foi persistido pelo retryStore (a lib chamou save).
// Rejeições permanentes lançam ReceitaRejectionError — persistir em nfse_rejeicoes pra auditoria.
```

### Cron de retry

```typescript
// A cada 1–5 min:
const results = await cliente.replayPendingEvents();
for (const r of results) {
  if (r.status === 'success_emission') await db.insert('nfse_autorizadas', { ...r.emission });
  if (r.status === 'success')          await db.insert('nfse_eventos', { ...r.evento });
  if (r.status === 'failed_permanent') logger.error('permanent fail', r.id, r.error);
  // still_pending fica no store; entradas com notBefore no futuro nem aparecem
}
```

**Contratos críticos do cron:**

- **Single-instance.** `replayPendingEvents` não é concorrência-safe — dois processos chamando ao mesmo tempo veriam a mesma lista e duplicariam o tráfego para o SEFIN. Garanta exclusão mútua: cron single-instance (Vercel/Railway cron, `node-cron` num worker dedicado), lock distribuído via Redis se múltiplos serviços compartilham o `RetryStore`, ou a coluna `pg_try_advisory_lock(987654321)` no início do cron.
- **`notBefore` é honrado.** Entradas com `notBefore > now` são puladas silenciosamente (não aparecem em `results`). 429 com `Retry-After: 120` fica invisível pro cron por 2 min, sem chamadas perdidas pro SEFIN.
- **`attempts` cresce a cada falha transiente no replay.** Útil pra dashboards: pendente com `attempts > 10` provavelmente é problema de configuração, não rede. Veja [Erros tipados — RetryPolicy](./erros#429-e-retrypolicy) para backoff customizado baseado em `attempts`.

### Reconciliação residual

Um caso fica fora: processo cai **entre** `emitir` resolver `ok` e seu `INSERT nfse_autorizadas` commitar. Defesas:

- **Bracket antes da chamada**: `INSERT dps_submissions (id_dps, status='in_flight')` em tx separada; no startup, consulte `fetchByChave(chave_derivada)` para linhas em `in_flight` — se existe, complete; se 404, reemita com novo `idDps`.
- **Derive a chave do `idDps`**: layout é `cLocEmi(7) + AA(2) + MM(2) + tpInsc(1) + inscFederal(14) + serie(5) + nDPS(15) + tpEmis(1) + cDV(1)`. Helper dedicado ainda não exposto; por ora consulte/derive manualmente.

## 4. Considerações de produção {#producao}

### 4.1. Retenção fiscal e LGPD

`xml_nfse` contém CPF/CNPJ + nome + endereço do tomador. Base legal: obrigação fiscal (LGPD art. 7º, II) durante o prazo decadencial (≥5 anos); direito ao esquecimento não se aplica nesse período. Evite XML inteiro em logs — use hash truncado.

### 4.2. Volume e armazenamento

- XML típico ~5–15 KB. Postgres faz TOAST automático acima de 2 KB.
- Milhões de notas/ano → particione `nfse_autorizadas` e `dfe_recebidos` por mês (`dh_proc` / `received_at`).
- Para compressão agressiva considere `pg_zstd` ou S3 com ponteiro no DB.

### 4.3. Segredos

Nunca plaintext no banco. Use AWS Secrets Manager / Vault / GCP SM. A **senha do `.pfx`** é tão sensível quanto o arquivo. `cliente.close()` no shutdown libera o key material do undici.

### 4.4. Monitoramento mínimo

- Taxa de rejeição por `codigo` (`nfse_rejeicoes`) — códigos transientes vs bugs seus têm perfis diferentes.
- Latência SEFIN: normal é 1–3s; acima disso aumente timeout e prepare reconciliação.
- `emitentes.certificate_expires_on < now() + 30 days` — alerta crítico.
- Tamanho de `nfse_pending_events` — cresceu e não drena? Transient virou permanente silenciosamente.

### 4.5. Backfill / DR

Se o banco for perdido, distribuição por NSU (`fetchByNsu({ ultimoNsu: 0 })`) reconstrói todas as NFS-e emitidas e recebidas pelo CNPJ — a Receita é a fonte de verdade. `dps_submissions` anteriores não são recuperáveis (estado local), mas autorizadas sim.

### 4.6. Caps de transporte

A lib aplica dois limites defensivos não configuráveis:

- **Response body: 10 MB.** Leitura em chunks; aborta lançando `NetworkError` se passar.
- **Gunzip output: 50 MB** (`maxOutputLength`). Defende contra gzip-bomb.

Nunca disparam em operação normal. Se dispararem, investigue a infra entre seu serviço e a Receita (proxy, WAF com interceptação).

### 4.7. Teste de integração

1. Cert de Produção Restrita habilitado para o CNPJ.
2. `examples/emit-nfse/` como smoke test.
3. Cenários: emissão normal, rejeição por CNPJ inválido, timeout simulado, NSU com paginação real, `substituir` (`ok` e `retry_pending` transiente).
4. Só vá para `Ambiente.Producao` depois do ciclo completo em homologação — cada nota em produção é documento fiscal oficial.

Signatures e parâmetros exatos: [API cheat sheet](../api-cheatsheet) · [API completa (TypeDoc)](../api/).
