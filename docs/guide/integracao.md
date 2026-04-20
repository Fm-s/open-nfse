# Integração em serviços

A lib não persiste nada — oferece as interfaces (`DpsCounter`, `RetryStore`, `ParametrosCache`) e o fluxo. O banco fica com você. Este guia cobre o **schema SQL mínimo** e o fluxo recomendado de produção.

> **Mental model:** a lib roda validações offline, **só depois consulta o counter**, e falhas de rede viram `retry_pending` no store com replay idempotente (SEFIN dedupa via `infDPS.Id`). Rejeições permanentes lançam — aí o `nDPS` foi consumido.

## 1. Tabelas (PostgreSQL)

Traduzível para MySQL (`CHAR`/`VARCHAR` iguais, `BIGSERIAL` → `BIGINT AUTO_INCREMENT`, `TIMESTAMPTZ` → `DATETIME(3)`, `TEXT` → `MEDIUMTEXT`) ou SQL Server (`IDENTITY`, `DATETIME2`, `NVARCHAR(MAX)`).

### 1.1. `emitentes`

Uma linha por CNPJ que você opera. Certificado **fora do banco** — KMS/Vault, coluna guarda só referência opaca.

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

### 1.2. `dps_counters` — backing store para `DpsCounter`

`nDPS` é sequencial por `(emitente, série)`. A Receita rejeita duplicados ou fora de ordem — **use sempre `UPDATE ... RETURNING`**, nunca `SELECT` + `UPDATE`.

```sql
CREATE TABLE dps_counters (
  emitente_id  BIGINT NOT NULL REFERENCES emitentes(id) ON DELETE RESTRICT,
  serie        VARCHAR(5) NOT NULL CHECK (serie ~ '^\d{1,5}$'),
  proximo_ndps BIGINT NOT NULL DEFAULT 1 CHECK (proximo_ndps BETWEEN 1 AND 999999999999999),
  PRIMARY KEY (emitente_id, serie)
);
```

Impl mínima:

```typescript
import type { DpsCounter } from 'open-nfse';

const pgDpsCounter: DpsCounter = {
  async next({ emitenteCnpj, serie }) {
    const { rows: [row] } = await db.query(
      `INSERT INTO dps_counters (emitente_id, serie, proximo_ndps)
       VALUES ((SELECT id FROM emitentes WHERE cnpj = $1), $2, 2)
       ON CONFLICT (emitente_id, serie) DO UPDATE
         SET proximo_ndps = dps_counters.proximo_ndps + 1
       RETURNING proximo_ndps - 1 AS ndps`,
      [emitenteCnpj, serie],
    );
    return String(row.ndps);
  },
};
```

### 1.3. `nfse_autorizadas` — NFS-e aceitas

Documento fiscal oficial assinado pela Sefin. **Retenção mínima 5 anos** (CTN art. 173); a maioria das empresas guarda indefinidamente.

```sql
CREATE TABLE nfse_autorizadas (
  chave_acesso          CHAR(50) PRIMARY KEY CHECK (chave_acesso ~ '^\d{50}$'),
  emitente_id           BIGINT NOT NULL REFERENCES emitentes(id),
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

CREATE INDEX ix_nfse_emitente_dhproc ON nfse_autorizadas (emitente_id, dh_proc DESC);
CREATE INDEX ix_nfse_tomador         ON nfse_autorizadas (tomador_identificador);
```

### 1.4. `nfse_rejeicoes` — rejeições permanentes

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

### 1.5. `nsu_cursors` — cursor de distribuição por CNPJ

`fetchByNsu` é incremental. Salve o `ultimoNsu` antes de processar o próximo lote.

```sql
CREATE TABLE nsu_cursors (
  cnpj       CHAR(14) PRIMARY KEY CHECK (cnpj ~ '^\d{14}$'),
  ultimo_nsu BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.6. `dfe_recebidos` — DF-e recebidos (lado tomador)

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

### 1.7. `nfse_eventos` — cancelamento, substituição, etc.

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

### 1.8. `nfse_pending_events` — backing store para `RetryStore`

`PendingEvent` é discriminated union. Uma tabela com colunas nullable cobre todos os kinds:

| `kind`                          | Origem                                                            |
|---------------------------------|-------------------------------------------------------------------|
| `emission`                      | `emitir(params)` transiente                                       |
| `cancelamento_simples`          | `cancelar()` transiente                                           |
| `cancelamento_por_substituicao` | `substituir()` — emit ok, cancel 105102 transiente                |
| `rollback_cancelamento`         | `substituir()` — rollback do emit (via 101101) transiente          |

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
  n_ped_reg_evento     VARCHAR(3),
  c_motivo             VARCHAR(2),
  x_motivo             TEXT,
  -- comum:
  xml_assinado         TEXT NOT NULL,
  first_attempt_at     TIMESTAMPTZ NOT NULL,
  last_attempt_at      TIMESTAMPTZ NOT NULL,
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
```

Impl do `RetryStore`:

```typescript
import type { RetryStore, PendingEvent } from 'open-nfse';
import { isPendingEmission } from 'open-nfse';

const pgStore: RetryStore = {
  async save(e: PendingEvent) {
    const common = {
      id: e.id, kind: e.kind, xml_assinado: e.xmlAssinado,
      first_attempt_at: e.firstAttemptAt, last_attempt_at: e.lastAttemptAt,
      last_error_msg: e.lastError.message,
      last_error_name: e.lastError.errorName,
      last_error_transient: e.lastError.transient,
    };
    const row = isPendingEmission(e)
      ? { ...common, id_dps: e.idDps, emitente_cnpj: e.emitenteCnpj, serie: e.serie, ndps: e.nDPS }
      : { ...common, chave_nfse: e.chaveNfse, chave_substituta: e.chaveSubstituta ?? null,
          tipo_evento: e.tipoEvento, n_ped_reg_evento: e.nPedRegEvento,
          c_motivo: e.cMotivo, x_motivo: e.xMotivo ?? null };
    await db.insertOrUpdate('nfse_pending_events', row, { onConflict: 'id' });
  },
  async list() { /* SELECT * → map por kind como no narrow inverso acima */ },
  async delete(id) { await db.query(`DELETE FROM nfse_pending_events WHERE id = $1`, [id]); },
};
```

## 2. Fluxo de emissão

```typescript
const r = await cliente.emitir({ emitente: {...}, serie: '1', servico: {...}, valores: {...}, tomador: {...} });

if (r.status === 'ok') {
  await db.insert('nfse_autorizadas', {
    chave_acesso: r.nfse.chaveAcesso,
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
  // still_pending fica no store
}
```

### Reconciliação residual

Um caso fica fora: processo cai **entre** `emitir` resolver `ok` e seu `INSERT nfse_autorizadas` commitar. Defesas:

- **Bracket antes da chamada**: `INSERT dps_submissions (id_dps, status='in_flight')` em tx separada; no startup, consulte `fetchByChave(chave_derivada)` para linhas em `in_flight` — se existe, complete; se 404, reemita com novo `idDps`.
- **Derive a chave do `idDps`**: layout é `cLocEmi(7) + AA(2) + MM(2) + tpInsc(1) + inscFederal(14) + serie(5) + nDPS(15) + tpEmis(1) + cDV(1)`. Helper dedicado ainda não exposto; por ora consulte/derive manualmente.

## 3. Considerações de produção

### 3.1. Retenção fiscal e LGPD

`xml_nfse` contém CPF/CNPJ + nome + endereço do tomador. Base legal: obrigação fiscal (LGPD art. 7º, II) durante o prazo decadencial (≥5 anos); direito ao esquecimento não se aplica nesse período. Evite XML inteiro em logs — use hash truncado.

### 3.2. Volume e armazenamento

- XML típico ~5–15 KB. Postgres faz TOAST automático acima de 2 KB.
- Milhões de notas/ano → particione `nfse_autorizadas` e `dfe_recebidos` por mês (`dh_proc` / `received_at`).
- Para compressão agressiva considere `pg_zstd` ou S3 com ponteiro no DB.

### 3.3. Segredos

Nunca plaintext no banco. Use AWS Secrets Manager / Vault / GCP SM. A **senha do `.pfx`** é tão sensível quanto o arquivo. `cliente.close()` no shutdown libera o key material do undici.

### 3.4. Monitoramento mínimo

- Taxa de rejeição por `codigo` (`nfse_rejeicoes`) — códigos transientes vs bugs seus têm perfis diferentes.
- Latência SEFIN: normal é 1–3s; acima disso aumente timeout e prepare reconciliação.
- `emitentes.certificate_expires_on < now() + 30 days` — alerta crítico.
- Tamanho de `nfse_pending_events` — cresceu e não drena? Transient virou permanente silenciosamente.

### 3.5. Backfill / DR

Se o banco for perdido, distribuição por NSU (`fetchByNsu({ ultimoNsu: 0 })`) reconstrói todas as NFS-e emitidas e recebidas pelo CNPJ — a Receita é a fonte de verdade. `dps_submissions` anteriores não são recuperáveis (estado local), mas autorizadas sim.

### 3.6. Caps de transporte

A lib aplica dois limites defensivos não configuráveis:

- **Response body: 10 MB.** Leitura em chunks; aborta lançando `NetworkError` se passar.
- **Gunzip output: 50 MB** (`maxOutputLength`). Defende contra gzip-bomb.

Nunca disparam em operação normal. Se dispararem, investigue a infra entre seu serviço e a Receita (proxy, WAF com interceptação).

### 3.7. Teste de integração

1. Cert de Produção Restrita habilitado para o CNPJ.
2. `examples/emit-nfse/` como smoke test.
3. Cenários: emissão normal, rejeição por CNPJ inválido, timeout simulado, NSU com paginação real, `substituir` cobrindo os 4 estados.
4. Só vá para `Ambiente.Producao` depois do ciclo completo em homologação — cada nota em produção é documento fiscal oficial.

Signatures e parâmetros exatos: [API cheat sheet](../api-cheatsheet) · [API completa (TypeDoc)](../api/).
