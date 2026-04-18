# Guia de integração

`open-nfse` **não tem estado interno** — zero banco, cache global ou singleton escondido — mas oferece primitives prontos:

- **Orquestração**: `emitirEmLote` (worker pool client-side, sem batch no SEFIN), `substituir` (máquina de 4 estados com rollback automático).
- **Retry**: `RetryStore` pluggable + `replayPendingEvents` — a lib define a interface e o fluxo; você pluga seu banco.
- **`DpsCounter`**: interface pluggable que fornece `nDPS` atômico para `emitir(params)`. A lib só chama depois das validações offline passarem.
- **`ParametrosCache`**: interface pluggable para respostas da API `/parametrizacao` (TTLs sensatos embutidos).

O que **fica com o seu serviço** é a **persistência durável** — as impls concretas dessas interfaces contra seu DB, mais as tabelas para guardar NFS-e autorizadas, cursor de NSU e eventos. Este documento descreve as estruturas SQL sugeridas para isso.

> **Prerequisito mental:** a cada `cliente.emitir(params)` você gera um documento fiscal oficial. A lib roda validações offline primeiro e **só consome o counter** depois que tudo passa — então uma DPS quebrada não queima `nDPS`. Falhas de rede após o POST viram `retry_pending` no `RetryStore`, com replay idempotente (SEFIN deduplica via `infDPS.Id`). Rejeições permanentes lançam `ReceitaRejectionError` — aí o `nDPS` foi consumido de fato.

## Sumário

- [1. Tabelas](#1-tabelas)
- [2. Fluxo recomendado de emissão](#2-fluxo-recomendado-de-emissão)
- [3. Considerações de produção](#3-considerações-de-produção)

---

## 1. Tabelas

DDL em dialeto PostgreSQL. Traduza tipos para MySQL (`CHAR` / `VARCHAR` iguais, `BIGSERIAL` → `BIGINT AUTO_INCREMENT`, `TIMESTAMPTZ` → `DATETIME(3)`, `TEXT` → `MEDIUMTEXT`) ou SQL Server (`IDENTITY`, `DATETIME2`, `NVARCHAR(MAX)`) conforme necessário.

### 1.1. `emitentes` — config por CNPJ

Uma linha por emitente que você opera. O certificado **fica fora do banco** (KMS, Vault, arquivo encriptado) — a coluna guarda só uma referência opaca.

```sql
CREATE TABLE emitentes (
  id                     BIGSERIAL PRIMARY KEY,
  cnpj                   CHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^\d{14}$'),
  inscricao_municipal    VARCHAR(30) NOT NULL,
  cod_municipio          CHAR(7)  NOT NULL CHECK (cod_municipio ~ '^\d{7}$'),
  razao_social           TEXT NOT NULL,
  ambiente               SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),  -- 1 Produção, 2 Homologação
  certificate_ref        TEXT NOT NULL,          -- opaque pointer: KMS key ARN, Vault path, etc.
  certificate_subject    TEXT,
  certificate_expires_on DATE,                   -- copiado de A1Certificate.expiresOn para alertas
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2. `dps_counters` — gerador atômico de `nDPS`

`nDPS` deve ser sequencial por `(emitente, série)`. A Receita rejeita números duplicados ou fora de ordem. Use `UPDATE ... RETURNING` para pegar o próximo atomicamente — nada de `SELECT` + `INSERT`.

```sql
CREATE TABLE dps_counters (
  emitente_id  BIGINT NOT NULL REFERENCES emitentes(id) ON DELETE RESTRICT,
  serie        VARCHAR(5) NOT NULL CHECK (serie ~ '^\d{1,5}$'),
  proximo_ndps BIGINT NOT NULL DEFAULT 1 CHECK (proximo_ndps BETWEEN 1 AND 999999999999999),
  PRIMARY KEY (emitente_id, serie)
);
```

Uso:

```sql
UPDATE dps_counters
   SET proximo_ndps = proximo_ndps + 1
 WHERE emitente_id = $1 AND serie = $2
RETURNING proximo_ndps - 1 AS ndps;
```

### 1.3. `dps_submissions` — cada chamada de `emitir()`

Opcional mas recomendado: uma linha por `emitir()` chamado, como log fiscal auditável. A lib **não exige isso** para funcionar (o `DpsCounter` + `RetryStore` já dão idempotência), mas você tipicamente quer histórico por nota.

```sql
CREATE TABLE dps_submissions (
  id               BIGSERIAL PRIMARY KEY,
  emitente_id      BIGINT NOT NULL REFERENCES emitentes(id),
  id_dps           CHAR(45) NOT NULL UNIQUE CHECK (id_dps ~ '^DPS\d{42}$'),
  serie            VARCHAR(5) NOT NULL,
  ndps             BIGINT NOT NULL,
  dh_emi           TIMESTAMPTZ NOT NULL,
  dcompet          DATE NOT NULL,
  valor_servico    NUMERIC(15, 2) NOT NULL,
  xml_dps_assinado TEXT,                           -- preenchido após o emit (success OR retry_pending)
  status           TEXT NOT NULL CHECK (status IN (
                     'authorized',                -- r.status === 'ok'
                     'retry_pending',             -- r.status === 'retry_pending' — no retryStore
                     'rejected'                   -- throw ReceitaRejectionError (nDPS foi consumido)
                   )),
  chave_acesso     CHAR(50),                       -- preenchido em 'authorized'
  pending_id       TEXT,                           -- FK lógico para nfse_pending_events.id
  http_status      SMALLINT,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_dps_submissions_emitente_status ON dps_submissions (emitente_id, status);
CREATE INDEX ix_dps_submissions_dh_emi          ON dps_submissions (dh_emi DESC);
CREATE UNIQUE INDEX ux_dps_submissions_ndps     ON dps_submissions (emitente_id, serie, ndps);
```

### 1.4. `nfse_autorizadas` — NFS-e aceitas

Quando `dps_submissions.status` passa para `'authorized'`, insira uma linha aqui com o `xmlNfse` retornado. Mantenha separado da submission: a DPS é sua (input), a NFS-e é da Receita (documento fiscal oficial com 5 anos de retenção legal).

```sql
CREATE TABLE nfse_autorizadas (
  chave_acesso          CHAR(50) PRIMARY KEY CHECK (chave_acesso ~ '^\d{50}$'),
  submission_id         BIGINT NOT NULL UNIQUE REFERENCES dps_submissions(id),
  emitente_id           BIGINT NOT NULL REFERENCES emitentes(id),
  id_dps                CHAR(45) NOT NULL,
  nnfse                 VARCHAR(30) NOT NULL,     -- número municipal sequencial
  ndfse                 VARCHAR(30),              -- número nacional (DFe)
  cstat                 VARCHAR(10),
  xml_nfse              TEXT NOT NULL,            -- documento fiscal oficial assinado pela Sefin
  versao_aplicativo     TEXT,
  dh_proc               TIMESTAMPTZ NOT NULL,
  valor_liquido         NUMERIC(15, 2) NOT NULL,
  tomador_identificador TEXT,                     -- CNPJ/CPF do tomador (extraído do XML, útil pra queries)
  tipo_ambiente         SMALLINT NOT NULL CHECK (tipo_ambiente IN (1, 2)),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_nfse_emitente_dhproc ON nfse_autorizadas (emitente_id, dh_proc DESC);
CREATE INDEX ix_nfse_tomador         ON nfse_autorizadas (tomador_identificador);
```

### 1.5. `nfse_rejeicoes` + `nfse_alertas` — mensagens da Receita

Rejeições vêm em array (`ReceitaRejectionError.mensagens`). Alertas também (`NfseEmitResult.alertas`). Ambos têm o mesmo shape, mas semanticamente são diferentes — rejeição impede autorização, alerta não.

```sql
CREATE TABLE nfse_rejeicoes (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES dps_submissions(id) ON DELETE CASCADE,
  ordem         SMALLINT NOT NULL,                -- índice dentro de mensagens[]
  codigo        VARCHAR(20) NOT NULL,
  descricao     TEXT NOT NULL,
  complemento   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_rejeicoes_codigo ON nfse_rejeicoes (codigo);

CREATE TABLE nfse_alertas (
  id           BIGSERIAL PRIMARY KEY,
  chave_acesso CHAR(50) NOT NULL REFERENCES nfse_autorizadas(chave_acesso) ON DELETE CASCADE,
  ordem        SMALLINT NOT NULL,
  codigo       VARCHAR(20) NOT NULL,
  descricao    TEXT NOT NULL,
  complemento  TEXT
);
```

### 1.6. `nsu_cursors` — cursor de distribuição por CNPJ

`fetchByNsu` precisa do último NSU para paginar incrementalmente. Salve **antes** de processar o próximo lote — se o processo cair no meio, você continua de onde parou sem perder documentos.

```sql
CREATE TABLE nsu_cursors (
  cnpj       CHAR(14) PRIMARY KEY CHECK (cnpj ~ '^\d{14}$'),
  ultimo_nsu BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.7. `dfe_recebidos` — documentos recebidos via distribuição

Cobre o lado "recebi NFS-e onde eu sou tomador" — distinto do que **você** emitiu. Unique em `(cnpj_consulta, nsu)` evita duplicatas se você repuxar.

```sql
CREATE TABLE dfe_recebidos (
  id             BIGSERIAL PRIMARY KEY,
  cnpj_consulta  CHAR(14) NOT NULL,              -- o CNPJ que puxou
  nsu            BIGINT NOT NULL,
  tipo_documento TEXT NOT NULL,                  -- 'NFSE' | 'EVENTO_NFSE' | etc.
  chave_acesso   CHAR(50),
  tipo_evento    VARCHAR(10),
  xml_documento  TEXT NOT NULL,                  -- já descomprimido pela lib
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cnpj_consulta, nsu)
);
CREATE INDEX ix_dfe_chave ON dfe_recebidos (chave_acesso);
```

### 1.8. `nfse_eventos` — cancelamento, substituição e eventos recebidos

Eventos (cancelamento 101101, substituição 105102, análise fiscal, confirmação de tomador, etc.) emitidos ou recebidos. Quando você chama `cliente.cancelar()` ou `cliente.substituir()`, grave uma linha aqui com o XML retornado pelo SEFIN.

```sql
CREATE TABLE nfse_eventos (
  id             BIGSERIAL PRIMARY KEY,
  chave_acesso   CHAR(50) NOT NULL REFERENCES nfse_autorizadas(chave_acesso),
  tipo_evento    VARCHAR(10) NOT NULL,           -- ex: '101101' cancelamento
  num_seq_evento INT NOT NULL,
  justificativa  TEXT,
  xml_evento     TEXT NOT NULL,
  dh_registro    TIMESTAMPTZ NOT NULL,
  origem         TEXT NOT NULL CHECK (origem IN ('emitido', 'recebido_dfe')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chave_acesso, tipo_evento, num_seq_evento)
);
```

### 1.9. `nfse_pending_events` — backing store para `RetryStore`

O `RetryStore` cobre **dois tipos** de pendentes (`PendingEvent` é discriminated union com `kind`):

| `kind`                          | Quando                                                                       |
|---------------------------------|------------------------------------------------------------------------------|
| `emission`                      | `cliente.emitir(params)` falhou transitoriamente (rede/5xx/timeout)          |
| `cancelamento_simples`          | `cliente.cancelar()` falhou transitoriamente                                 |
| `cancelamento_por_substituicao` | `cliente.substituir()` emit ok, mas cancel 105102 falhou transitoriamente    |
| `rollback_cancelamento`         | `cliente.substituir()` rollback do emit (via 101101) falhou transitoriamente |

Uma única tabela com colunas nullable cobre tudo:

```sql
CREATE TABLE nfse_pending_events (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN (
                      'emission',
                      'cancelamento_simples',
                      'cancelamento_por_substituicao',
                      'rollback_cancelamento'
                    )),

  -- campos só de emission:
  id_dps            CHAR(45),
  emitente_cnpj     CHAR(14),
  serie             VARCHAR(5),
  ndps              BIGINT,

  -- campos só de evento (cancelamento/rollback):
  chave_nfse        CHAR(50),
  chave_substituta  CHAR(50),
  tipo_evento       VARCHAR(10),
  n_ped_reg_evento  VARCHAR(3),
  c_motivo          VARCHAR(2),
  x_motivo          TEXT,

  -- comum a ambos:
  xml_assinado      TEXT NOT NULL,                 -- re-POST idempotente
  first_attempt_at  TIMESTAMPTZ NOT NULL,
  last_attempt_at   TIMESTAMPTZ NOT NULL,
  last_error_msg    TEXT NOT NULL,
  last_error_name   TEXT NOT NULL,
  last_error_transient BOOLEAN NOT NULL,

  CHECK (
    (kind = 'emission' AND id_dps IS NOT NULL AND emitente_cnpj IS NOT NULL)
    OR (kind <> 'emission' AND chave_nfse IS NOT NULL AND tipo_evento IS NOT NULL)
  )
);

CREATE INDEX ix_pending_kind ON nfse_pending_events (kind);
CREATE INDEX ix_pending_chave ON nfse_pending_events (chave_nfse) WHERE chave_nfse IS NOT NULL;
CREATE INDEX ix_pending_emitente ON nfse_pending_events (emitente_cnpj) WHERE emitente_cnpj IS NOT NULL;
CREATE INDEX ix_pending_last_attempt ON nfse_pending_events (last_attempt_at);
```

Implementação `RetryStore`:

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
      : {
          ...common,
          chave_nfse: e.chaveNfse, chave_substituta: e.chaveSubstituta ?? null,
          tipo_evento: e.tipoEvento, n_ped_reg_evento: e.nPedRegEvento,
          c_motivo: e.cMotivo, x_motivo: e.xMotivo ?? null,
        };
    await db.insertOrUpdate('nfse_pending_events', row, { onConflict: 'id' });
  },

  async list() {
    const { rows } = await db.query(`SELECT * FROM nfse_pending_events`);
    return rows.map((r): PendingEvent => {
      const common = {
        id: r.id,
        xmlAssinado: r.xml_assinado,
        firstAttemptAt: r.first_attempt_at,
        lastAttemptAt: r.last_attempt_at,
        lastError: {
          message: r.last_error_msg,
          errorName: r.last_error_name,
          transient: r.last_error_transient,
        },
      };
      if (r.kind === 'emission') {
        return {
          ...common,
          kind: 'emission',
          idDps: r.id_dps,
          emitenteCnpj: r.emitente_cnpj,
          serie: r.serie,
          nDPS: r.ndps,
        };
      }
      return {
        ...common,
        kind: r.kind,
        chaveNfse: r.chave_nfse,
        ...(r.chave_substituta ? { chaveSubstituta: r.chave_substituta } : {}),
        tipoEvento: r.tipo_evento,
        nPedRegEvento: r.n_ped_reg_evento,
        cMotivo: r.c_motivo,
        ...(r.x_motivo ? { xMotivo: r.x_motivo } : {}),
      };
    });
  },

  async delete(id: string) {
    await db.query(`DELETE FROM nfse_pending_events WHERE id = $1`, [id]);
  },
};

const cliente = new NfseClient({..., retryStore: pgStore});
```

### 1.10. `dps_counters` — provider de `nDPS` (para `emitir(params)`)

Já definido em §1.2. A interface `DpsCounter` da lib pede um método `next({ emitenteCnpj, serie })` que **deve ser atômico** (único caller ganha cada número). Impl mínima sobre a tabela:

```typescript
import type { DpsCounter } from 'open-nfse';

const pgDpsCounter: DpsCounter = {
  async next({ emitenteCnpj, serie }) {
    const { rows: [emit] } = await db.query(
      `SELECT id FROM emitentes WHERE cnpj = $1`, [emitenteCnpj],
    );
    const { rows: [row] } = await db.query(
      `INSERT INTO dps_counters (emitente_id, serie, proximo_ndps)
       VALUES ($1, $2, 2)
       ON CONFLICT (emitente_id, serie) DO UPDATE
         SET proximo_ndps = dps_counters.proximo_ndps + 1
       RETURNING proximo_ndps - 1 AS ndps`,
      [emit.id, serie],
    );
    return String(row.ndps);
  },
};

const cliente = new NfseClient({..., dpsCounter: pgDpsCounter});
```

::: warning Atomicidade é obrigatória
Se dois processos lerem o mesmo `proximo_ndps` e incrementarem, ambos tentarão emitir com o mesmo número — a Receita rejeita o segundo. Use sempre `UPDATE ... RETURNING` (ou `SELECT ... FOR UPDATE`), nunca `SELECT` + `UPDATE`.
:::

---

## 2. Fluxo recomendado de emissão

A partir de v0.4 a lib gerencia a maior parte do ciclo por você: o `DpsCounter` resolve a atomicidade do `nDPS`, o `RetryStore` absorve falhas transientes, e `cliente.emitir(params)` retorna um resultado discriminado. Você fica responsável por persistir o resultado.

```typescript
const r = await cliente.emitir({
  emitente: {...}, serie: '1',
  servico: {...}, valores: {...}, tomador: {...},
});

if (r.status === 'ok') {
  // 1. Sucesso — persista a NFS-e autorizada
  await db.tx(async tx => {
    await tx.insert('nfse_autorizadas', {
      chave_acesso: r.nfse.chaveAcesso,
      id_dps: r.nfse.idDps,
      xml_nfse: r.nfse.xmlNfse,
      nnfse: r.nfse.nfse.infNFSe.nNFSe,
      dh_proc: r.nfse.dataHoraProcessamento,
      tipo_ambiente: r.nfse.tipoAmbiente,
      ...
    });
    for (const a of r.nfse.alertas) await tx.insert('nfse_alertas', { chave: r.nfse.chaveAcesso, ...a });
  });
} else if (r.status === 'retry_pending') {
  // 2. Transiente — já foi salvo em retryStore pela lib. Opcionalmente registre
  //    uma submission pra rastrear o ciclo de vida:
  await db.insert('dps_submissions', {
    id_dps: r.pending.idDps,
    ndps: r.pending.nDPS,
    serie: r.pending.serie,
    status: 'retry_pending',
    pending_id: r.pending.id,
  });
}
```

Rejeições permanentes lançam `ReceitaRejectionError` — o nDPS **foi consumido** (o counter avançou) mas a nota foi definitivamente rejeitada:

```typescript
try {
  await cliente.emitir(params);
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // Persista a rejeição para auditoria
    await db.insert('nfse_rejeicoes', {
      id_dps: err.idDps,
      codigo: err.codigo,
      descricao: err.descricao,
      mensagens: err.mensagens,
    });
  } else {
    throw err;
  }
}
```

### Job de retry (cron-friendly)

`replayPendingEvents` re-POSTa tudo que ficou em `retry_pending` ou `rollback_pending`. SEFIN deduplica via `infDPS.Id` (emissões) e `{chave, tipoEvento, nPedRegEvento}` (eventos), então chamar N vezes é seguro:

```typescript
// Cron a cada 1–5 min:
const results = await cliente.replayPendingEvents();
for (const r of results) {
  if (r.status === 'success_emission') {
    await db.insert('nfse_autorizadas', { ...r.emission });
  } else if (r.status === 'success') {
    await db.insert('nfse_eventos', { ...r.evento });
  } else if (r.status === 'failed_permanent') {
    logger.error('replay permanent fail', r.id, r.error);
  }
  // status === 'still_pending' fica no store para próxima rodada
}
```

### Quando ainda preciso reconciliar manualmente?

Pouco — mas há um cenário residual: se o processo **cair entre o `emitir()` resolver com `status:'ok'` e o seu `INSERT INTO nfse_autorizadas` commitar**, a lib já não tem como saber. Estratégias:

- **Bracket a chamada**: antes de `emitir()`, marque a intenção (`INSERT dps_submissions (id_dps, status='in_flight')` — ou similar). No startup, varra linhas em `in_flight` sem `finished_at` e consulte `cliente.fetchByChave` pela chave derivada — se existe, complete para `authorized`; se 404, reemita com um novo `idDps`.
- **A chave é derivável do `idDps`**: `chaveAcesso = cLocEmi(7) + AA(2) + MM(2) + tpInsc(1) + inscFederal(14 pad) + serie(5 pad) + nDPS(15 pad) + tpEmis(1) + cDV(1)`. A lib não expõe um helper dedicado ainda — por ora use `buildDpsId` para referência do layout e calcule o DV via módulo-11.
- **Ou simplesmente aceite o log fragmentado**: se seu `nfse_autorizadas` cai assíncrono de outra fila, o ciclo se fecha naturalmente quando a fila drena.

---

## 3. Considerações de produção

### 3.1. Retenção fiscal

O `xml_nfse` tem que ser guardado por **no mínimo 5 anos** (prazo decadencial do ISS conforme CTN art. 173). Na prática, muitas empresas guardam **indefinidamente** por obrigação acessória e segurança contra fiscalizações retroativas. Não delete a leve.

### 3.2. Tamanho do XML

Um `xml_nfse` típico tem ~5–15 KB. Em volumes altos (milhões de notas/ano) isso vira problema de espaço:

- Postgres faz TOAST automático em `TEXT` > 2KB (transparent compression + out-of-line storage).
- Para compressão melhor, considere `pg_zstd` ou armazenar em S3 com apenas o ponteiro + metadados indexáveis no banco.
- Particione `nfse_autorizadas` e `dfe_recebidos` por mês (`dh_proc` / `received_at`) quando passar de ~10M linhas. A maioria das queries analíticas naturalmente filtra por período fiscal.

### 3.3. Segredos do certificado

**`cert_ref` nunca em plaintext no banco.** Use:

- AWS Secrets Manager / Parameter Store com KMS
- HashiCorp Vault (secret engine transit ou kv v2)
- GCP Secret Manager / Azure Key Vault
- Envelope encryption com rotação de chave

A **senha do `.pfx`** é tão sensível quanto o próprio arquivo — proteja com o mesmo rigor. Rode `cliente.close()` no shutdown do processo para liberar o key material da memória do undici.

### 3.4. Monitoramento

Métricas mínimas:

- `dps_submissions.status` por bucket de tempo — se `rejected` dispara, seu payload está errado; se `error` dispara, a Receita está instável.
- Taxa por código de rejeição (`nfse_rejeicoes.codigo`) — alguns códigos significam "tente de novo em 5 min", outros significam "seu código tem bug".
- Latência `finished_at - started_at` — o SEFIN costuma responder em 1–3s; se passar disso sustentadamente, aumente timeout e prepare para reconciliação.
- `emitentes.certificate_expires_on < now() + 30 days` — alerta crítico.

### 3.5. LGPD

`tomador_identificador`, `nfse_autorizadas.xml_nfse` e `dfe_recebidos.xml_documento` contêm dados pessoais (CPF/CNPJ + nome + endereço do tomador).

- **Base legal**: obrigação legal fiscal (LGPD art. 7º, II) cobre a retenção.
- **Direito ao esquecimento** não se aplica durante o prazo decadencial fiscal — documente isso no seu registro de tratamento.
- **Minimização**: só exponha esses campos nas UIs internas para papéis que precisam (fiscal, contabilidade). Evite logs com XML inteiro — use hash truncado para rastreabilidade.

### 3.6. Concorrência e múltiplos processos

- `dps_counters` com `UPDATE ... RETURNING` é **atômico** e serve para múltiplos workers.
- Evite `SELECT proximo_ndps` + `UPDATE SET proximo_ndps = ?` — janela de corrida garantida em carga.
- Se quiser emissão em paralelo para o mesmo emitente, `emitirEmLote` da lib já cuida da concorrência HTTP (worker pool client-side), mas você ainda precisa gerar os `nDPS` antes de montar as DPS — faça N `UPDATE ... RETURNING` em sequência ou um `UPDATE ... RETURNING` com `proximo_ndps + N`.

### 3.7. Backfill e recuperação de desastres

O que fazer se o banco for perdido:

1. Distribuição por NSU **reconstrói** o universo de NFS-e emitidas e recebidas pelo CNPJ — a Receita é a fonte de verdade.
2. Rode `fetchByNsu({ ultimoNsu: 0 })` em loop, hidrata `dfe_recebidos` e `nfse_autorizadas`.
3. `dps_submissions` de antes do incidente **não é recuperável** (é estado local seu), mas você pode reconciliar via chave.

Isso só funciona dentro da janela de retenção do ADN (a Receita não documenta limite explícito mas, na prática, todo histórico está lá).

### 3.8. Teste de integração

Antes de ligar em produção real:

1. Cert de Produção Restrita habilitado para o CNPJ.
2. `examples/emit-nfse/` como smoke test do pipeline inteiro.
3. Cenários-chave para testar: emissão normal, rejeição por CNPJ inválido, timeout simulado, NSU com paginação real.
4. Só passe para `Ambiente.Producao` depois de fechar o ciclo completo em Produção Restrita — cada nota em Produção é documento fiscal com valor legal.

### 3.9. Caps defensivos no transporte

A lib aplica dois limites defensivos embutidos (não configuráveis) na camada de transporte:

- **Response body: 10 MB.** O reader lê em chunks e aborta se o total passar do limite, lançando `NetworkError`. NFS-e e respostas do ADN têm ~5-15 KB no pior caso; o teto serve contra proxy/WAF mal configurado retornando HTML gigante ou responses corrompidas.
- **Gunzip output: 50 MB.** `gunzipSync` usa `maxOutputLength` para blindar contra gzip-bomb (1 KB compacto → 1 GB expandido). Payloads reais ficam abaixo disso ordens de grandeza.

Ambos são "nunca acontecem em operação normal" — se dispararem, investigue a infra entre seu serviço e a Receita (proxy transparente, WAF com interceptação, MITM inesperado). Nenhum knob para aumentar: a intenção é justamente falhar alto.