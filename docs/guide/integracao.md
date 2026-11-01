# Integração em serviços

A lib não persiste nada — oferece as interfaces (`DpsCounter`, `RetryStore`, `ParametrosCache`) e o fluxo. O banco fica com você. Este guia cobre o **schema SQL mínimo** e o fluxo recomendado de produção.

> **Mental model:** a lib roda validações offline, **só depois consulta o counter**, e falhas de rede viram `retry_pending` no store. O replay re-POSTa o XML assinado original (mesmo `infDPS.Id`) e, se o re-POST for rejeitado, consulta `GET /dps/{id}` antes de desistir — uma DPS que o SEFIN já autorizou volta como `success_emission`, não como falha. Rejeições permanentes lançam — aí o `nDPS` foi consumido e não há nota. `UnreadableAuthorizedNfseError` é a exceção: a nota **foi** autorizada (a lib só não leu a resposta) — persista `chaveAcesso`/`xmlNfse` e não reemita.

## Qual banco eu preciso? {#quanto-banco}

Depende do que você faz com a lib. Comece pelo seu caso e ignore o resto:

| Caso de uso | Tabelas |
|---|---|
| Só **consultar** NFS-e / gerar DANFSe | **Nenhuma.** Persistir o resultado é opcional. |
| **Emitir** em produção | **3 tabelas**: [`dps_counters`](#dps-counters) + [`nfse_pending_events`](#nfse-pending-events) + [`nfse_autorizadas`](#nfse-autorizadas) (+ a fila pequena de [autorizadas ilegíveis](#nfse-autorizadas)) |
| **Cancelar / substituir** | As mesmas 3 (pendentes caem em `nfse_pending_events`). Trilha de auditoria: + [`nfse_eventos`](#nfse-eventos) |
| **Receber** notas de fornecedores (distribuição DF-e) | + [`nsu_cursors`](#nsu-cursors) + [`dfe_recebidos`](#dfe-recebidos) |
| Operar **vários CNPJs** | + [`emitentes`](#emitentes) (normaliza as colunas `cnpj` em FK) |
| Auditoria de **rejeições** | + [`nfse_rejeicoes`](#nfse-rejeicoes) |

Todo SQL abaixo é PostgreSQL, traduzível para MySQL (`CHAR`/`VARCHAR` iguais, `BIGSERIAL` → `BIGINT AUTO_INCREMENT`, `TIMESTAMPTZ` → `DATETIME(3)`, `TEXT` → `MEDIUMTEXT`) ou SQL Server (`IDENTITY`, `DATETIME2`, `NVARCHAR(MAX)`).

::: warning CNPJ alfanumérico — em produção desde 10/08/2026
O leiaute da NFS-e aceita **CNPJ alfanumérico** (IN RFB nº 2.229/2024: 12 posições `[A-Z0-9]` + 2 dígitos verificadores numéricos) desde 10/08/2026 — bundle XSD 20260727, adotado pela lib na v0.11.0. Todo o SQL abaixo já usa os patterns novos. **Se o seu banco já existe com as versões numéricas deste guia, migre:**

- Colunas `CHAR`/`VARCHAR` (como as deste guia): basta trocar as constraints —

  ```sql
  ALTER TABLE dps_counters      DROP CONSTRAINT dps_counters_cnpj_check,
    ADD CONSTRAINT dps_counters_cnpj_check CHECK (cnpj ~ '^[A-Z0-9]{12}\d{2}$');
  ALTER TABLE nfse_autorizadas  DROP CONSTRAINT nfse_autorizadas_chave_acesso_check,
    ADD CONSTRAINT nfse_autorizadas_chave_acesso_check
    CHECK (chave_acesso ~ '^([0-9]{6}[0-9A-Z]{14}[0-9]{30}|[0-9]{9}[0-9A-Z]{14}[0-9]{27})$');
  -- idem para emitentes.cnpj, nsu_cursors.cnpj e demais CHECKs numéricos
  ```

  (nomes das constraints: confira com `\d nome_da_tabela` no psql — os default do Postgres seguem esse formato).

  A chave aceita **as duas formas** que os XSDs oficiais trazem: `TSChaveNFSe` põe as letras nas posições 7–20, mas a regra de formação da chave (`TSIdNFSe`: município(7) + ambiente gerador(1) + tipo de inscrição(1) + inscrição(14) + …) as põe nas posições 10–23. Um CHECK só com a primeira forma recusa chaves reais de CNPJ alfanumérico — é o mesmo par de patterns que a lib usa nas leituras.
- Colunas **numéricas** (`BIGINT`/`NUMERIC`/`DECIMAL`) para CNPJ, chave de acesso ou `id_dps`: **precisam virar texto** (`CHAR(14)`/`CHAR(50)`/`CHAR(45)`). Tipo numérico não comporta letras e já corrompia zeros à esquerda (`00574753000100` → `574753000100`). Migre com `ALTER TABLE ... ALTER COLUMN cnpj TYPE CHAR(14) USING lpad(cnpj::text, 14, '0')` — o `lpad` restaura os zeros perdidos — e refaça índices/FKs que apontavam para a coluna.
- O mesmo vale para **código da aplicação**: qualquer `parseInt`/`Number()` sobre CNPJ, chave ou `id_dps` quebra com letras. Esses identificadores sempre foram `string` na API da lib — mantenha-os como texto de ponta a ponta.
:::

## 1. O mínimo para emitir — 3 tabelas {#minimo}

### 1.1. `dps_counters` — backing store para `DpsCounter` {#dps-counters}

`nDPS` é sequencial por `(emitente, série)`. A Receita rejeita reaproveitar série + número de uma DPS que já virou NFS-e (E0014) — **use sempre um increment atômico** (`INSERT ... ON CONFLICT ... RETURNING`), nunca `SELECT` + `UPDATE`.

```sql
CREATE TABLE dps_counters (
  cnpj         CHAR(14)   NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}\d{2}$'),
  serie        VARCHAR(5) NOT NULL CHECK (serie ~ '^([0-9]{1,4}|[0-8][0-9]{4})$'),
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

Desde a 0.12 as entradas gravadas pelo `NfseClient` carregam `layout` (`'nt004'` | `'nt009'`, o layout do cliente que as gerou); entradas gravadas na 0.11 ou antes não têm o campo (nem as da função livre `cancelar` chamada sem `layout`). O replay re-POSTa o XML assinado **como está** — não converte entre layouts — e usa o `layout` só para avisar (`warn` `nfse.replay.layout_divergente`) quando uma **emissão** é reenviada por um cliente de outro layout. Persista a coluna para não perder esse aviso na [virada para o `nt009`](#virada-layout).

```sql
CREATE TABLE nfse_pending_events (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN (
                         'emission', 'cancelamento_simples',
                         'cancelamento_por_substituicao', 'rollback_cancelamento'
                       )),
  layout               VARCHAR(5) CHECK (layout IN ('nt004', 'nt009')),  -- v0.12; NULL nas entradas ≤ 0.11
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

> **Migração de v0.11.x → v0.12:**
>
> ```sql
> ALTER TABLE nfse_pending_events
>   ADD COLUMN layout VARCHAR(5) CHECK (layout IN ('nt004', 'nt009'));
> ```
>
> Linhas existentes ficam com `layout NULL` — são todas `nt004` (o único layout até a 0.11) e o replay as reenvia normalmente, só sem o aviso de layout divergente.

Impl do `RetryStore`:

```typescript
import type { RetryStore, PendingEvent } from 'open-nfse';
import { isPendingEmission } from 'open-nfse';

const pgStore: RetryStore = {
  async save(e: PendingEvent) {
    const common = {
      id: e.id, kind: e.kind, layout: e.layout ?? null, xml_assinado: e.xmlAssinado,
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
    // SELECT * → map por kind como no narrow inverso acima. Colunas NULL viram
    // campo ausente (`layout`, `notBefore`, `chaveSubstituta`, `xMotivo`): `layout: null`
    // não é um Layout.
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
  chave_acesso          CHAR(50) PRIMARY KEY
                          CHECK (chave_acesso ~ '^([0-9]{6}[0-9A-Z]{14}[0-9]{30}|[0-9]{9}[0-9A-Z]{14}[0-9]{27})$'),
  emitente_cnpj         CHAR(14) NOT NULL CHECK (emitente_cnpj ~ '^[A-Z0-9]{12}\d{2}$'),
  id_dps                CHAR(45) NOT NULL UNIQUE,
  nnfse                 VARCHAR(30) NOT NULL,     -- nº da NFS-e (sequencial por emitente, gerado pela Sefin Nacional)
  ndfse                 VARCHAR(30),              -- nº do DFS-e no ambiente gerador do município
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

**Nota autorizada que a lib não conseguiu ler** (`UnreadableAuthorizedNfseError` no `emitir`/`emitirDpsPronta`/`substituir`, item `success_unreadable` no `emitirEmLote`, `success_emission_unreadable` no replay). É raro, mas a nota **existe**: o erro carrega `chaveAcesso` e `idDps`, e `xmlNfse` quando o XML pôde ser decodificado — fica `undefined` quando a resposta não trouxe um XML decodificável ou quando o replay achou a nota pelo `GET /dps/{id}` mas não conseguiu baixá-la. As colunas que vêm do parse (`nnfse`, `valor_liquido`, …) não estão disponíveis, então não force a linha em `nfse_autorizadas`: grave numa fila à parte e complete depois com `fetchByChave(chave)` (depois de atualizar a lib, se o problema era o parser). O que importa é **não reemitir**.

```sql
CREATE TABLE nfse_autorizadas_ilegiveis (
  chave_acesso CHAR(50) PRIMARY KEY,
  id_dps       CHAR(45) NOT NULL,
  xml_nfse     TEXT,                  -- NULL quando a lib não obteve o XML
  erro         TEXT NOT NULL,         -- err.message (inclui a causa)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

É isso — com essas 3 tabelas (e o cron da [seção 3](#fluxo)) você tem emissão de produção completa. As tabelas abaixo entram conforme o caso de uso.

## 2. Tabelas opcionais {#opcionais}

### 2.1. `emitentes` — se você opera vários CNPJs {#emitentes}

Num serviço single-CNPJ, os dados do emitente cabem em config/env e as colunas `cnpj` das tabelas do mínimo bastam. Operando **vários CNPJs**, normalize: crie `emitentes` e troque `dps_counters.cnpj` / `nfse_autorizadas.emitente_cnpj` por `emitente_id BIGINT REFERENCES emitentes(id)`.

Certificado **fora do banco** — KMS/Vault, coluna guarda só referência opaca.

```sql
CREATE TABLE emitentes (
  id                     BIGSERIAL PRIMARY KEY,
  cnpj                   CHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^[A-Z0-9]{12}\d{2}$'),
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
  id_dps     CHAR(45),          -- NULL quando a resposta de erro não trouxe idDPS
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
  cnpj       CHAR(14) PRIMARY KEY CHECK (cnpj ~ '^[A-Z0-9]{12}\d{2}$'),
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

Registre uma linha quando `cliente.cancelar()` retornar `ok` (ou o replay devolver `success`) — `origem = 'emitido'`. O `substituir()` não devolve evento: o 105102 é gerado pelo Sistema Nacional na NFS-e original e chega pela distribuição por NSU (`fetchByNsu`) — `origem = 'recebido_dfe'`.

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
import {
  Ambiente,
  NfseClient,
  ReceitaRejectionError,
  TipoAmbienteDps,
  UnreadableAuthorizedNfseError,
} from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004', // obrigatório, sem default — um cliente por layout (ver "Virada de layout")
  ambiente: Ambiente.Producao,
  certificado: { pfx, password },
  dpsCounter: pgDpsCounter,
  retryStore: pgStore,
});

const cnpjEmitente = '00574753000100';
try {
  const r = await cliente.emitir({
    emitente: { cnpj: cnpjEmitente, ... }, serie: '1', servico: {...}, valores: {...}, tomador: {...},
    tpAmb: TipoAmbienteDps.Producao, // default '2' (Homologação) não segue o ambiente → E0006
  });

  if (r.status === 'ok') {
    await db.insert('nfse_autorizadas', {
      chave_acesso: r.nfse.chaveAcesso,
      emitente_cnpj: cnpjEmitente,
      id_dps: r.nfse.idDps,
      xml_nfse: r.nfse.xmlNfse,
      nnfse: r.nfse.nfse.infNFSe.nNFSe,
      ndfse: r.nfse.nfse.infNFSe.nDFSe,
      dh_proc: r.nfse.dataHoraProcessamento,
      valor_liquido: r.nfse.nfse.infNFSe.valores.vLiq,
      tipo_ambiente: r.nfse.tipoAmbiente,
      // ...
    });
  }
  // r.status === 'retry_pending' já foi persistido pelo retryStore (a lib chamou save).
} catch (err) {
  if (err instanceof UnreadableAuthorizedNfseError) {
    // Nota AUTORIZADA — nunca em nfse_rejeicoes, e não reemitir.
    await db.insert('nfse_autorizadas_ilegiveis', {
      chave_acesso: err.chaveAcesso, id_dps: err.idDps, xml_nfse: err.xmlNfse ?? null, erro: err.message,
    });
  } else {
    if (err instanceof ReceitaRejectionError) {
      // Rejeição permanente: o nDPS foi consumido e não há nota.
      await db.insert('nfse_rejeicoes', {
        id_dps: err.idDps ?? null, codigo: err.codigo, descricao: err.descricao, mensagens: err.mensagens,
      });
    }
    // Validações offline (ValidationError, LayoutMismatchError…) lançam antes de consumir o nDPS.
    throw err;
  }
}
```

Com `layout: 'nt009'`, `emitir` aceita também os inputs `ajusteBC`/`ibsCbs` e devolve `NfseNt009` — veja [Layouts](./layouts). O schema acima serve aos dois layouts: as colunas usadas existem em ambos.

### Cron de retry

```typescript
// A cada 1–5 min:
const results = await cliente.replayPendingEvents();
for (const r of results) {
  switch (r.status) {
    case 'success_emission': // r.emission tem o mesmo shape do r.nfse do emitir
      await db.insert('nfse_autorizadas', { chave_acesso: r.emission.chaveAcesso, /* ... */ });
      break;
    case 'success_emission_unreadable': // autorizada — não reemitir
      await db.insert('nfse_autorizadas_ilegiveis', {
        chave_acesso: r.error.chaveAcesso, id_dps: r.error.idDps,
        xml_nfse: r.error.xmlNfse ?? null, erro: r.error.message,
      });
      break;
    case 'success': // evento (cancelamento) aceito
      await db.insert('nfse_eventos', { xml_evento: r.evento.xmlEvento, /* ... */ });
      break;
    case 'failed_permanent':
      logger.error('permanent fail', r.id, r.error);
      break;
    case 'still_pending': // continua no store; volta na próxima varredura
      break;
  }
  // entradas com notBefore no futuro nem aparecem em results
}
```

O `id` de uma emissão é `emission:<idDps>` (de um evento, `<chave>:<tipoEvento>:<kind>`); `ReplayItem` não traz `serie`/`nDPS`/`emitenteCnpj` — se precisar deles para reemitir um `failed_permanent`, leia o `store.list()` **antes** do replay (a entrada sai do store).

**Como o replay decide uma emissão.** O re-POST usa o XML assinado original, com o mesmo `infDPS.Id`. Se ele for **rejeitado de forma permanente**, a causa clássica é o POST original ter dado timeout **depois** que o SEFIN gerou a nota: o re-POST volta como E0014 (série/número já existe) — ou E1235 (schema), se o XML `nt004` for reenviado depois da [virada de layout](#virada-layout). Antes de apagar a entrada, a lib consulta `GET /dps/{idDps}`:

| Resposta do `GET /dps/{idDps}` | Item | Entrada no store |
|---|---|---|
| NFS-e achada e a DPS embutida nela é a persistida (compara `SignatureValue`; sem assinatura, `dhEmi`) | `success_emission` com `reconciledFrom` = a rejeição do re-POST (`info` `nfse.replay.reconciled`) | removida |
| NFS-e achada, mas de **outra** DPS com o mesmo `infDPS.Id` (série/nDPS reaproveitados) | `failed_permanent` + `warn` `nfse.replay.reconcile_mismatch` | removida — reemitir com novo `nDPS` é seguro |
| NFS-e achada (e é desta DPS), mas o XML baixado é ilegível ou o `GET /nfse/{chave}` falha de forma permanente | `success_emission_unreadable` (com a chave; sem `xmlNfse` quando o download falhou) | removida — não reemitir |
| **404** | `failed_permanent` (nenhuma nota saiu dessa DPS) | removida — reemitir com novo `nDPS` é seguro |
| Falha transiente ou corpo malformado (ou falha transiente no `GET /nfse/{chave}` que vem em seguida) | `still_pending` (`warn` `nfse.replay.reconcile_pending` quando a falha é do `GET /dps`) | mantida |
| 401 / 403 / 400 | `still_pending` + `warn` `nfse.replay.reconcile_failed` | mantida — investigue (permissão do certificado, proxy); volta a cada varredura |

**Só o 404 apaga uma emissão como falha**: a lib nunca descarta uma emissão sem saber se a nota existe — um `failed_permanent` errado levaria a reemitir e duplicar a nota. Uma resposta `201` do re-POST que o parser não consegue ler também vira `success_emission_unreadable`. Eventos pendentes não passam por essa reconciliação: rejeição permanente do re-POST de evento → `failed_permanent`.

**Contratos críticos do cron:**

- **Single-instance.** `replayPendingEvents` não é concorrência-safe — dois processos chamando ao mesmo tempo veriam a mesma lista e duplicariam o tráfego para o SEFIN. Garanta exclusão mútua: cron single-instance (Vercel/Railway cron, `node-cron` num worker dedicado), lock distribuído via Redis se múltiplos serviços compartilham o `RetryStore`, ou `SELECT pg_try_advisory_lock(987654321)` no início do cron (pule a rodada se vier `false`).
- **`notBefore` é honrado.** Entradas com `notBefore > now` são puladas silenciosamente (não aparecem em `results`). 429 com `Retry-After: 120` fica invisível pro cron por 2 min, sem chamadas perdidas pro SEFIN.
- **`attempts` cresce a cada falha transiente no replay.** Útil pra dashboards: pendente com `attempts > 10` provavelmente é problema de configuração, não rede (ou uma reconciliação presa em `reconcile_failed`). Veja [Erros tipados — RetryPolicy](./erros#429-e-retrypolicy) para backoff customizado baseado em `attempts`.
- **Drene antes de trocar o certificado ou o layout.** O XML persistido foi assinado com o certificado vigente na emissão original: se ele expirar antes do replay, o SEFIN rejeita a assinatura como permanente e o item sai como `failed_permanent` (emissões passam antes pela reconciliação) — a operação precisa ser refeita à mão. E o XML é re-POSTado no layout em que foi assinado — veja abaixo.

### Virada de layout (`nt004` → `nt009`) {#virada-layout}

O `layout` é fixo por cliente (`new NfseClient({ layout })`, sem default e sem troca automática por data); o `nt009` entra em produção em **01/12/2026**. O `RetryStore` não muda de layout junto: uma emissão `nt004` pendente reenviada por um cliente `nt009` gera `warn` `nfse.replay.layout_divergente` e, como o XML `nt004` não tem `infDPS/finNFSe` (obrigatório no `nt009`), deve ser rejeitada por schema (E1235) — e cai na reconciliação acima. Eventos pendentes não são afetados (o leiaute de evento não muda no release 1).

Roteiro: antes de 01/12, pare de emitir com o cliente `nt004`, drene o store com ele mesmo até não sobrar emissão (olhe `store.list()`, não os itens — entradas com `notBefore` no futuro não aparecem no resultado), e só então crie o cliente `nt009`. Passo a passo, com o laço de drenagem: [Migração 0.11 → 0.12 §7](./migracao-0.12#virada-retrystore).

### Reconciliação residual

Um caso fica fora: o processo cai **entre** o POST ao SEFIN e o seu `INSERT nfse_autorizadas` commitar (ou entre o `emitir` resolver `ok` e o commit). Nem o `RetryStore` nem o seu banco sabem da nota. Defesa:

- **Marque o número antes do envio.** O `DpsCounter.next()` roda depois das validações offline e antes de assinar/enviar — grave ali, na mesma transação do increment, uma linha `dps_submissions (cnpj, serie, ndps, status='in_flight')`, e marque-a `done` na mesma transação do `INSERT nfse_autorizadas`.
- **No startup, consulte por `idDps`.** A chave de acesso **não** é derivável do `idDps` (ela contém o `nNFSe`, atribuído pelo Sistema Nacional), mas o `GET /dps/{id}` responde por ele. Para cada linha `in_flight` que não está no `RetryStore`:

  ```typescript
  import { buildDpsId, NotFoundError } from 'open-nfse';

  // cLocEmi = emitente.codMunicipio usado na emissão
  const idDps = buildDpsId({ cLocEmi, tipoInsc: 'CNPJ', inscricaoFederal: row.cnpj, serie: row.serie, nDPS: row.ndps });
  try {
    const { chaveAcesso } = await cliente.fetchDpsStatus(idDps); // a nota existe
    const nota = await cliente.fetchByChave(chaveAcesso);        // complete o INSERT com nota.xmlNfse / nota.nfse
  } catch (err) {
    if (err instanceof NotFoundError) { /* nenhuma nota: marque abandonada; reemita com novo nDPS */ }
    else throw err; // indeterminado: tente de novo depois — nunca reemita sem saber
  }
  ```

  Para checagens em massa, `cliente.existsDpsStatus(idDps)` (HEAD) responde `true`/`false` (404 → `false`; outras falhas lançam, como acima).

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
4. Antes de 01/12/2026, repita o ciclo com um cliente `layout: 'nt009'` em Produção Restrita (bundle `esquemas_prod_restrita_20261020`) e ensaie a [drenagem do store](#virada-layout).
5. Só vá para `Ambiente.Producao` depois do ciclo completo em homologação — cada nota em produção é documento fiscal oficial.

Signatures e parâmetros exatos: [API cheat sheet](../api-cheatsheet) · [API completa (TypeDoc)](../api/).
