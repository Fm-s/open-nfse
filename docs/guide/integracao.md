# Guia de integração

`open-nfse` é **sem estado** por design — não tem banco, fila, retry ou orquestração. Esses são trabalho do seu serviço. Este documento descreve as estruturas de persistência mínimas para integrar a lib em produção.

> **Prerequisito mental:** a cada `cliente.emitir()` você gera um documento fiscal oficial. Se o processo cai entre o POST e a resposta, você precisa saber se a NFS-e foi autorizada ou não — sem duplicá-la. A única forma de descobrir é consultar a Receita depois pelo `chaveAcesso` derivado do seu `idDps`. Tudo no schema abaixo existe para tornar isso confiável.

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

Crie a linha **antes** de chamar a lib, com `id_dps` e o payload. Isso vira sua chave de idempotência: se o processo morre no meio de um POST, no retry você consulta por `id_dps` e decide se reenvia ou consulta o resultado via `fetchByChave`.

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
  xml_dps_assinado TEXT,                           -- preenchido após buildDpsXml + signDpsXml
  status           TEXT NOT NULL CHECK (status IN (
                     'pending',                   -- linha criada, POST ainda não tentado
                     'in_flight',                 -- POST em andamento
                     'authorized',                -- 201 + NFS-e autorizada
                     'rejected',                  -- 400 com erros de regra
                     'error'                      -- falha de rede / 5xx / timeout
                   )),
  chave_acesso     CHAR(50),                       -- preenchido em 'authorized'
  http_status      SMALLINT,
  started_at       TIMESTAMPTZ,
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

Quando `cliente.substituir()` cai em `retry_pending` ou `rollback_pending`, a lib persiste o evento pendente via `RetryStore`. Esta tabela é o backing store típico — o consumidor implementa `save`/`list`/`delete` mapeando para ela.

```sql
CREATE TABLE nfse_pending_events (
  id                TEXT PRIMARY KEY,            -- {chaveNfse}:{tipoEvento}:{nPedRegEvento}
  kind              TEXT NOT NULL CHECK (kind IN (
                      'cancelamento_por_substituicao',
                      'rollback_cancelamento'
                    )),
  chave_nfse        CHAR(50) NOT NULL,
  chave_substituta  CHAR(50),                    -- preenchido apenas em 105102
  tipo_evento       VARCHAR(10) NOT NULL,
  n_ped_reg_evento  VARCHAR(3) NOT NULL,
  c_motivo          VARCHAR(2) NOT NULL,
  x_motivo          TEXT,
  xml_pedido        TEXT NOT NULL,                -- XML do pedRegEvento já assinado; re-POST idempotente
  first_attempt_at  TIMESTAMPTZ NOT NULL,
  last_attempt_at   TIMESTAMPTZ NOT NULL,
  last_error_msg    TEXT NOT NULL,
  last_error_name   TEXT NOT NULL,
  last_error_transient BOOLEAN NOT NULL
);

CREATE INDEX ix_pending_chave ON nfse_pending_events (chave_nfse);
CREATE INDEX ix_pending_last_attempt ON nfse_pending_events (last_attempt_at);
```

Implementação `RetryStore`:

```typescript
import type { RetryStore, PendingEvent } from 'open-nfse';

const pgStore: RetryStore = {
  async save(e: PendingEvent) {
    await db.query(
      `INSERT INTO nfse_pending_events (id, kind, chave_nfse, chave_substituta,
         tipo_evento, n_ped_reg_evento, c_motivo, x_motivo, xml_pedido,
         first_attempt_at, last_attempt_at,
         last_error_msg, last_error_name, last_error_transient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         last_attempt_at = EXCLUDED.last_attempt_at,
         last_error_msg = EXCLUDED.last_error_msg,
         last_error_name = EXCLUDED.last_error_name,
         last_error_transient = EXCLUDED.last_error_transient`,
      [
        e.id, e.kind, e.chaveNfse, e.chaveSubstituta ?? null,
        e.tipoEvento, e.nPedRegEvento, e.cMotivo, e.xMotivo ?? null,
        e.xmlPedidoAssinado,
        e.firstAttemptAt, e.lastAttemptAt,
        e.lastError.message, e.lastError.errorName, e.lastError.transient,
      ],
    );
  },

  async list() {
    const { rows } = await db.query(`SELECT * FROM nfse_pending_events`);
    return rows.map((r): PendingEvent => ({
      id: r.id,
      kind: r.kind,
      chaveNfse: r.chave_nfse,
      ...(r.chave_substituta ? { chaveSubstituta: r.chave_substituta } : {}),
      tipoEvento: r.tipo_evento,
      nPedRegEvento: r.n_ped_reg_evento,
      cMotivo: r.c_motivo,
      ...(r.x_motivo ? { xMotivo: r.x_motivo } : {}),
      xmlPedidoAssinado: r.xml_pedido,
      firstAttemptAt: r.first_attempt_at,
      lastAttemptAt: r.last_attempt_at,
      lastError: {
        message: r.last_error_msg,
        errorName: r.last_error_name,
        transient: r.last_error_transient,
      },
    }));
  },

  async delete(id: string) {
    await db.query(`DELETE FROM nfse_pending_events WHERE id = $1`, [id]);
  },
};

const cliente = new NfseClient({..., retryStore: pgStore});
```

---

## 2. Fluxo recomendado de emissão

Para garantir idempotência contra crashes e retries:

```
1. BEGIN
2. UPDATE dps_counters SET proximo_ndps = proximo_ndps + 1
     WHERE emitente_id = $1 AND serie = $2
     RETURNING proximo_ndps - 1 AS ndps;
3. INSERT dps_submissions (emitente_id, id_dps, serie, ndps, dh_emi, dcompet,
                           valor_servico, status)
     VALUES (..., 'pending');
4. COMMIT

5. const dry = await cliente.emitir(dps, { dryRun: true });
6. UPDATE dps_submissions
     SET xml_dps_assinado = $1, status = 'in_flight', started_at = now()
     WHERE id = $2;

7. try {
     const result = await cliente.emitir(dps);
     // 8a — sucesso
     BEGIN
     UPDATE dps_submissions
       SET status = 'authorized', chave_acesso = $1, http_status = 201,
           finished_at = now()
       WHERE id = $2;
     INSERT INTO nfse_autorizadas (chave_acesso, submission_id, emitente_id,
                                   id_dps, nnfse, xml_nfse, ...) VALUES (...);
     INSERT INTO nfse_alertas (...) VALUES (...);  -- loop em result.alertas
     COMMIT

   } catch (err) {
     if (err instanceof ReceitaRejectionError) {
       // 8b — rejeição
       BEGIN
       UPDATE dps_submissions
         SET status = 'rejected', http_status = 400, finished_at = now()
         WHERE id = $1;
       INSERT INTO nfse_rejeicoes (...) VALUES (...);  -- loop em err.mensagens
       COMMIT

     } else {
       // 8c — falha de rede / 5xx / timeout: ESTADO INCERTO
       UPDATE dps_submissions
         SET status = 'error', finished_at = now()
         WHERE id = $1;
       // um job de reconciliação resolve isso depois (ver seção 3)
     }
   }
```

### Job de reconciliação

**Crítico**: em `status = 'error'` ou `'in_flight'` com `started_at > 60s`, **você não sabe** se a NFS-e foi autorizada ou não. A lib já fez o POST, talvez a Receita tenha processado. Rodar `emitir()` de novo duplica a nota.

A forma correta é consultar pelo `chaveAcesso` derivável do `id_dps`:

```
// Uma vez por minuto:
SELECT id, id_dps FROM dps_submissions
 WHERE status IN ('error', 'in_flight')
   AND finished_at IS NULL
   AND started_at < now() - interval '60 seconds';

// Para cada:
try {
  const r = await cliente.fetchByChave(chave_derivada_do_idDps);
  // achou → move para 'authorized' e popula nfse_autorizadas
} catch (err) {
  if (err instanceof NotFoundError) {
    // não foi autorizada — pode reemitir com um novo id_dps
    UPDATE dps_submissions SET status = 'pending' WHERE id = ...;
  }
}
```

A lib expõe a chave via `NfseEmitResult.chaveAcesso` apenas em caso de sucesso. Em erro de rede, você precisa derivar a chave do `idDps` + metadados do emitente (a regra de formação é a mesma do `buildDpsId`, mas para a chave: `TSChaveNFSe` — planejado para v0.3). Até lá, **prefira timeouts generosos** (60s+) e trate `error` como "consultar mais tarde e se não achar, reemitir".

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