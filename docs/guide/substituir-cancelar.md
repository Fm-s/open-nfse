# Substituir e cancelar

| Operação     | Evento  | Quando usar                                                               |
|--------------|---------|---------------------------------------------------------------------------|
| `cancelar`   | 101101  | Nota emitida por erro ou serviço não prestado — sem reemissão             |
| `substituir` | 105102  | Nota precisa ser trocada (correção de valor, regime, imunidade)           |

Ambos usam o mesmo `RetryStore` do `emitir` — falhas transientes entram no mesmo pipeline de replay (cron de `replayPendingEvents`).

::: info Layout
`cancelar` não depende do layout: o pedido de evento (`tiposEventos_v1.01.xsd`) é idêntico no `nt004` e no `nt009`, e a lib não faz checagem de layout nele — o `layout` do cliente só é gravado no `PendingEvent` de uma falha transiente. `substituir` **emite uma DPS**, então segue as regras de [layout](./layouts) da emissão: a `novaDps` precisa ser do layout do cliente (`buildDps({ layout })` com o mesmo valor do `new NfseClient({ layout })`); outra → `LayoutMismatchError` antes de qualquer I/O.
:::

## `cancelar` — evento 101101

### 1. Chamada básica

```typescript
import { JustificativaCancelamento, TipoAmbienteDps } from 'open-nfse';

const r = await cliente.cancelar({
  chaveAcesso: '21113002200574753000100000000000146726037032711025',
  autor: { CNPJ: '00574753000100' },
  cMotivo: JustificativaCancelamento.ErroEmissao,   // '1' erro | '2' não prestado | '9' outros
  xMotivo: 'Valor digitado incorretamente',          // obrigatório: 15 a 255 caracteres (TSMotivo)
  tpAmb: TipoAmbienteDps.Producao,                   // default '2' (Homologação) — veja abaixo
});
```

Defaults do pedido: `tpAmb = '2'` (Homologação), `verAplic = 'open-nfse/<versão>'` (ex.: `open-nfse/0.12.0rc1`; override de 1 a 20 caracteres, senão `RuleViolationError` rule `TSVerAplic`) e `dhEvento = agora`. O `tpAmb` **não** vem do `ambiente` do cliente: em produção passe `tpAmb: TipoAmbienteDps.Producao`, senão a Sefin rejeita com E1845 (tipo de ambiente difere do ambiente utilizado).

O `Id` do pedido é **determinístico** — `PRE` + chave + tipoEvento — para que um reenvio não crie um segundo evento: com a NFS-e já cancelada, a Sefin rejeita o novo pedido (E0840).

### 2. Lidando com cada resultado

Mesma estrutura do `emitir`: três cenários distintos.

```typescript
import { ReceitaRejectionError, RuleViolationError } from 'open-nfse';

try {
  const r = await cliente.cancelar({ chaveAcesso, autor, cMotivo, xMotivo, tpAmb });

  if (r.status === 'ok') {
    // Cancelamento aceito pela Sefin. Persista o evento.
    const { infEvento } = r.evento.evento;
    await db.insert('nfse_eventos', {
      chave_acesso: infEvento.pedRegEvento.infPedReg.chNFSe,
      tipo_evento: infEvento.pedRegEvento.infPedReg.tipoEvento,   // '101101'
      num_seq_evento: Number(infEvento.nSeqEvento),
      xml_evento: r.evento.xmlEvento,
      dh_registro: infEvento.dhProc,
      origem: 'emitido',
    });
    return;
  }

  if (r.status === 'retry_pending') {
    // Transiente. Já persistido (XML assinado) no retryStore; o cron cuida.
    logger.warn('cancel transient', { pendingId: r.pending.id, err: r.error.message });
    return;
  }
} catch (err) {
  if (err instanceof RuleViolationError) {
    // Pré-check local, nada foi enviado: rule 'TSMotivo', 'e101101/xMotivo' ou 'TSVerAplic'.
    logger.error('cancel inválido', { rule: err.rule, msg: err.message });
    return;
  }
  if (err instanceof ReceitaRejectionError) {
    // Permanente. Típico: E0822 (prazo do município expirou), E0823 (valor
    // acima do limite do município), E0840 (NFS-e já cancelada/substituída).
    logger.error('cancel rejeitado', { codigo: err.codigo, descricao: err.descricao });
    return;
  }
  throw err;
}
```

## `substituir` — emite a nova DPS com `<subst>`

Substituir é **emitir a nova DPS com `infDPS/subst` apontando para a NFS-e original**. Você envia *uma* mensagem (`POST /nfse`); o **Sistema Nacional NFS-e** gera, de forma atômica com a emissão, o evento **105102 (Cancelamento por Substituição, `autor=MEmis`)** que cancela a original, e retorna a NFS-e substituta.

::: tip Resultado e falhas
É um **único write** (a DPS). O resultado é discriminado igual ao de `emitir`: `'ok'` (`novaNfse`, tipada pelo layout do cliente) ou `'retry_pending'` (falha transiente no `POST /nfse`, persistida no `retryStore` para replay via `replayPendingEvents` — o re-POST reusa o mesmo `infDPS.Id` e uma rejeição E0014/E1235 é reconciliada via `GET /dps/{id}`). Rejeição **permanente** (regra fiscal ou pré-check local) **lança**; `UnreadableAuthorizedNfseError` também lança, mas significa que a substituta **foi autorizada**. O contribuinte **não** registra o 105102 (autor `05 MEmis` na planilha Tipo Eventos do Anexo II); a Sefin rejeita o pedido com autor inválido (E0813) e, com o 105102 já vinculado à NFS-e pelo sistema, como redundante (E0845). As regras de assinatura pelo município (E2032 no nt004 / E1638 no nt009) só rodam no ADN, não na recepção da Sefin. Ref.: Manual dos Contribuintes — API Sistema Nacional NFS-e v1.2 §1.3.2.
:::

### Chamada

```typescript
import {
  JustificativaSubstituicao,
  ReceitaRejectionError,
  RuleViolationError,
  UnreadableAuthorizedNfseError,
  buildDps,
} from 'open-nfse';

const novaDps = buildDps({
  layout: 'nt004',                    // o mesmo layout do client — outro lança LayoutMismatchError
  emitente: { /* mesmo do original */ },
  serie: '1',
  nDPS: '42',                         // obrigatório — use seu DpsCounter
  servico: { /* corrigido */ },
  valores: { /* corrigido */ },
  tomador: { /* ... */ },
  // infDPS.subst é auto-preenchido pela lib com chaveOriginal/cMotivo/xMotivo.
  // Se você preencher subst manualmente, ele deve ser idêntico aos parâmetros
  // de substituir — divergência lança RuleViolationError (rule 'infDPS/subst').
});

try {
  const r = await cliente.substituir({
    chaveOriginal: '21113002200574753000100000000000146726037032711025',
    novaDps,
    cMotivo: JustificativaSubstituicao.Outros,   // '99' exige xMotivo (E0078)
    xMotivo: 'Correção de valor',
  });

  if (r.status === 'ok') {
    // A nova foi autorizada e a original cancelada pelo sistema (105102).
    await db.insert('nfse_autorizadas', {
      chave_acesso: r.novaNfse.chaveAcesso,
      xml_nfse: r.novaNfse.xmlNfse,
    });
  } else {
    // Transiente: resultado DESCONHECIDO no SEFIN — num timeout depois do commit
    // a substituta já pode estar autorizada (e a original cancelada). Não reemita
    // nem cancele à mão: o cron de replayPendingEvents reenvia o mesmo XML (mesmo
    // infDPS.Id) e, se o re-POST for rejeitado (E0014/E1235), reconcilia via
    // GET /dps/{id}.
    logger.warn('substituir pendente', { id: r.pending.id });
  }
} catch (err) {
  if (err instanceof UnreadableAuthorizedNfseError) {
    // Substituta AUTORIZADA (e original cancelada), mas a resposta não virou DTO.
    // Persista a chave e não reemita.
    await db.insert('nfse_autorizadas', { chave_acesso: err.chaveAcesso, xml_nfse: err.xmlNfse });
  } else if (err instanceof RuleViolationError) {
    // Pré-check local (ver "Pré-checks locais" abaixo) — nada foi enviado.
    logger.error('substituir inválido', { rule: err.rule, msg: err.message });
  } else if (err instanceof ReceitaRejectionError) {
    // Rejeição PERMANENTE da emissão (ex.: E0050 prazo, E0046 original já
    // cancelada) — nada foi alterado no SEFIN; retry limpo só faz sentido após
    // corrigir a causa.
    logger.error('substituir falhou', { codigo: err.codigo });
  } else {
    throw err;
  }
}
```

`substituir` aceita as mesmas opções de validação de `emitir` (`skipValidation`, `skipCepValidation`, `skipCpfCnpjValidation`, `cepValidator`), mais `retryStore` e `isTransient` (classificador custom, que `emitir` não tem) para os transientes. Não há `autor`/`tpAmb`/`verAplic`/`dhEvento` — o contribuinte não registra evento (o `tpAmb`/`verAplic` que valem são os da própria DPS).

### Observar o evento 105102

O 105102 é gravado pela Receita na NFS-e **original**. Para auditá-lo, leia os eventos da chave original pela distribuição por NSU (`fetchByNsu`; a consulta de eventos por chave do ADN, `GET /NFSe/{chave}/Eventos`, ainda não é encapsulada pela lib) — a `substituir` não "retorna" um evento porque o contribuinte não o emitiu.

## Cron de replay

A mesma função cobre os transientes de `emitir(params)`, `cancelar` **e** `substituir` — `replayPendingEvents` distingue pelos `kind` das entries no store. A pendência da `substituir` é uma **emissão** (`kind: 'emission'`, a DPS com `<subst>`), então replaya como `success_emission` — igual a `emitir`.

```typescript
// a cada 1-5 min, um worker só
const items = await cliente.replayPendingEvents();

for (const item of items) {
  switch (item.status) {
    case 'success_emission':
      // Veio de emitir(params) OU substituir() transiente (kind 'emission').
      // item.reconciledFrom preenchido = o re-POST foi rejeitado (E0014/E1235),
      // mas GET /dps/{id} confirmou que a nota já existia.
      await db.insert('nfse_autorizadas', { /* a partir de item.emission */ });
      break;

    case 'success_emission_unreadable':
      // Autorizada, mas a resposta não virou DTO. A lib já removeu a entrada do
      // store: guarde a chave (e o XML, se veio) e não reemita.
      await db.insert('nfse_autorizadas', {
        chave_acesso: item.error.chaveAcesso,
        xml_nfse: item.error.xmlNfse,
      });
      break;

    case 'success':
      // Veio de cancelar() transiente (ou de dados legados de substituição)
      await db.insert('nfse_eventos', { /* a partir de item.evento */ });
      break;

    case 'still_pending':
      // Transiente de novo, ou reconciliação que não pôde decidir (falha no
      // GET /dps/{id} que não seja 404). A entrada continua no store.
      logger.warn('ainda pendente', { id: item.id, err: item.error.message });
      break;

    case 'failed_permanent':
      // Lib removeu do store. Você decide (alerta, ticket, etc.)
      logger.error('permanente no replay', { id: item.id, err: item.error.message });
      alerts.send('Pending event falhou permanentemente', { id: item.id });
      break;
  }
}
```

Rodar o replay N vezes não cria nota nem evento novos:
- **Emissões** — o re-POST reusa o mesmo `infDPS.Id` (45 chars, único por município+CPF/CNPJ+série+nDPS), então o SEFIN não gera uma segunda NFS-e. Uma DPS que ele já autorizou volta como **rejeição** (`E0014`, ou `E1235` depois de uma virada de layout), não como sucesso: antes de remover a entrada, a lib consulta `GET /dps/{id}`. NFS-e encontrada que embute a DPS persistida → `success_emission` com `reconciledFrom`; NFS-e de **outra** DPS com o mesmo `Id` → `failed_permanent` (`warn` `nfse.replay.reconcile_mismatch`); **só um 404** → `failed_permanent`; qualquer outra falha da consulta → `still_pending`. Detalhes em [Emitir NFS-e §4](./emitir#_4-cron-de-replay).
- **Cancelamentos** — o reenvio usa o mesmo `Id` (`PRE` + chave + tipoEvento) e não cria segundo evento. Mas a lib **não reconcilia eventos**: se o POST original foi registrado antes do timeout, o re-POST volta rejeitado (id do evento já existe — E0802 — ou NFS-e já cancelada — E0840) e o item sai como `failed_permanent`. Antes de tratar como falha, confira se a NFS-e já está cancelada (eventos via distribuição por NSU).

::: warning Virada para o `nt009`
O replay reenvia o XML assinado como está — não converte entre layouts. Drene as **emissões** pendentes com o cliente `nt004` antes de criar o cliente `nt009` (roteiro em [Migração 0.12 §7](./migracao-0.12#virada-retrystore)). Cancelamentos pendentes não são afetados: o pedido de evento é o mesmo nos dois layouts.
:::

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

// kind: 'emission'                       ← emitir(params) / substituir() transiente
// kind: 'cancelamento_simples'           ← cancelar() transiente
// kind: 'cancelamento_por_substituicao'  ← legado (substituir não gera mais; mantido p/ replay de dados antigos)
// kind: 'rollback_cancelamento'          ← legado (idem)
```

Todas as variantes carregam `layout?` (o layout do cliente que gerou o pendente; ausente em entradas gravadas até a 0.11). Use `isPendingEmission(e)` para narrow antes de acessar campos específicos de cada variante. `createInMemoryRetryStore()` serve para testes e demos; produção precisa persistir durável — impl Postgres completa em [Integração em serviços](./integracao#nfse-pending-events).

## Pré-checks locais

Rodam **antes** de assinar ou enviar qualquer coisa (e, no `NfseClientFake`, antes da falha programada) e lançam erro tipado em vez de gastar um round-trip:

**`cancelar`**
- **`xMotivo` segue `TSMotivo`**: obrigatório, 15 a 255 caracteres, só U+0020–U+00FF (Latin-1) e sem espaço nas pontas — travessão `–`, aspas curvas, tab e quebra de linha colados de editor de texto são rejeitados localmente (`RuleViolationError`, rule `TSMotivo`) em vez de voltarem como erro de schema da Sefin. Com `cMotivo = '9'` (Outros), `xMotivo` ausente ou só de espaços → rule `e101101/xMotivo`.
- **`chaveAcesso`** fora da forma exigida pelo `Id` do pedido (`TSIdPedRegEvt`: 50 caracteres, posição 9 = tipo de inscrição `1`|`2`, inscrição alfanumérica só com CNPJ) → `InvalidEventoPedidoIdParamError` (`field: 'chaveAcesso'`).
- **`verAplic`** informado fora de 1–20 caracteres → rule `TSVerAplic`.

**`substituir`** (nesta ordem)
1. **Layout** — `novaDps` de outro layout que o do cliente → `LayoutMismatchError`.
2. **`subst` coerente com os parâmetros** — se a `novaDps` já traz `infDPS.subst`, `chSubstda`/`cMotivo`/`xMotivo` precisam ser idênticos a `chaveOriginal`/`cMotivo`/`xMotivo` (rule `infDPS/subst`). Sem `subst`, a lib o monta a partir dos parâmetros.
3. **`cMotivo = '99'` exige `xMotivo`** (rule `E0078` do Anexo I).
4. **`xMotivo` segue `TSMotivo`** quando presente (mesma regra do `cancelar`; em `subst` o campo é opcional).
5. **Forma da chave substituída** — `chaveOriginal` no pattern `TSChaveNFSe` do XSD (`[0-9]{6}[0-9A-Z]{14}[0-9]{30}`), rule `TSChaveNFSe`.
6. **`infDPS.Id` válido** (`TSIdDPS`) → senão `InvalidDpsIdError`.
7. **A chave substituída é do mesmo emitente** (rule `E0042` do Anexo I): Cód.Mun., Tipo de Inscrição e Inscrição de `chaveOriginal` devem ser iguais aos do `infDPS.Id` da nova DPS. O DV da chave (a outra metade da E0042) fica com a Sefin.

Depois disso valem as validações da emissão (XSD, DV de CPF/CNPJ, CEP — ver [Validações](./validacoes)), controladas pelas mesmas flags `skip*`.

## Regras que só a Sefin verifica

1. **Prazo é parametrizado pelo município** — E0050 para substituição (exceto `cMotivo` `01`/`02`, desenquadramento/enquadramento no Simples Nacional) e E0822 para cancelamento; no cancelamento também há limite de valor (E0823). Cada município define sua janela; a lib não consulta esses parâmetros.
2. **Estado da NFS-e** — depois de **qualquer** cancelamento (101101 ou 105102) a NFS-e é terminal: novo cancelamento → E0840. A substituição também é barrada por eventos vinculados (ex.: análise fiscal pendente E0068, manifestação de confirmação E0070/E0072).
3. **Chain check em `substituir`** — original inexistente (E0044) ou já cancelada (E0046) → a emissão da nova é rejeitada no `subst.chSubstda`, e nada muda no SEFIN. Sem dangling state.
4. **Sem evento duplicado** — o `Id` determinístico do pedido + a regra acima fazem com que um retry de cancelamento nunca crie evento fantasma.

### Classificação de erros transientes

Por default (`defaultIsTransient`), `ReceitaRejectionError` é **permanente**. As duas exceções são tratadas como transientes automaticamente:

- **E1217** — "Serviço paralisado para manutenção" (validação inicial da mensagem na API, Anexo IV).
- **E1206** — "Certificado de Transmissão — Erro de acesso a LCR" (recepção da DPS, Anexo I).

Ambos vão para o `RetryStore` e são retentados pelo cron de `replayPendingEvents`. Para sobrescrever a classificação, passe `isTransient: (err) => boolean` em `CancelarParams` ou `SubstituirParams`. Lista completa (rede, timeout, 5xx, 429) em [Erros tipados](./erros#classificacao-padrao-transiente-vs-permanente).
