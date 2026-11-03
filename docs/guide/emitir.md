# Emitir NFS-e

`emitir(params)` é o fluxo primário. Recebe params de alto nível (sem `nDPS`), roda as validações offline, consulta o `DpsCounter` **só depois** que tudo passa, e retorna um resultado discriminado. Falha de rede não duplica: o pendente vai para o `RetryStore` com o XML assinado (mesmo `infDPS.Id`) e o replay reconcilia via `GET /dps/{id}` quando o re-POST é rejeitado — uma DPS que o SEFIN já autorizou volta como `success_emission`, não como falha (ver seção 4). DPS quebrada nunca queima número da série.

```
params → layout + regras do buildDps → CPF/CNPJ → XSD do layout → CEP
   ↓ (se tudo passou)
counter.next() → nDPS real → sign → POST /nfse
   ↓
{ status: 'ok', nfse }                 ← autorizada (nfse.nfse: NfseFor<L>)
{ status: 'retry_pending', pending }   ← transiente, salvo no RetryStore
throw ReceitaRejectionError            ← regra fiscal violada (nDPS consumido)
throw UnreadableAuthorizedNfseError    ← AUTORIZADA, resposta ilegível (não reemita)
```

Os guards do `buildDps` (layout, regras fechadas do Anexo I — `RuleViolationError`) rodam antes de qualquer I/O, inclusive antes de carregar o certificado.

Erros transientes cobrem `NetworkError`, `TimeoutError`, `ServerError` (5xx) e `TooManyRequestsError` (429). O 429 respeita o cabeçalho `Retry-After` do servidor — a entrada fica no `RetryStore` com `notBefore` calculado pela `RetryPolicy` configurada e o cron de replay só toca nela quando elegível. Detalhes em [Erros tipados](./erros#429-e-retrypolicy).

**Não envolva esta chamada em retry loop próprio para 429/5xx.** Cada `emitir()` consome um `nDPS` antes do POST; um wrapper externo que recapta e retenta queima números da série e cria buracos permanentes no sequencial. A lib já persiste o pendente — use `replayPendingEvents` (ver seção 4).

## Setup

`dpsCounter` é obrigatório (ou passe `nDPS` explícito em cada chamada); `retryStore` é obrigatório se você quiser que falhas transientes sejam persistidas em vez de lançar:

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004',                          // define também o tipo de `emitir`/`emitirDpsPronta`
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),   // produção: UPDATE ... RETURNING
  retryStore: createInMemoryRetryStore(),   // produção: tabela nfse_pending_events
});
```

Impls Postgres completas dos dois: [Integração em serviços](./integracao).

`layout` é **obrigatório, sem default** (`'nt004'` = produção atual; `'nt009'` = NT 009, produção em 01/12/2026). Ele tipa o cliente: `new NfseClient({ layout: 'nt004', … })` é um `NfseClient<'nt004'>`, cujo `emitir` só aceita params do `nt004` (sem `ajusteBC`/`ibsCbs`) e devolve `NfseNt004`. Chamador JS com valor desconhecido recebe `InvalidLayoutError` no construtor; DPS/params de outro layout, `LayoutMismatchError` antes de consumir o contador. Detalhes em [Leiautes](./layouts).

::: tip `tpAmb` segue o `ambiente` do cliente
Em `emitir` e `cancelar`, o `tpAmb` omitido vem do `ambiente`: `Ambiente.Producao` → `'1'`, `Ambiente.ProducaoRestrita` → `'2'` (Homologação). Um `tpAmb` explícito prevalece. O `buildDps` avulso não conhece o cliente e tem default `'2'` — ao montar a DPS para `emitirDpsPronta`/`emitirEmLote`/`substituir` em produção, passe `tpAmb: TipoAmbienteDps.Producao`, senão a Receita rejeita com E0006 (ambiente da DPS diverge do ambiente de recebimento).
:::

## 1. Emissão mínima

```typescript
import {
  OpcaoSimplesNacional, RegimeApuracaoSimplesNacional, RegimeEspecialTributacao,
} from 'open-nfse';

const resultado = await cliente.emitir({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: {
      opSimpNac: OpcaoSimplesNacional.MeEpp,
      regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
  // O membro do choice totTrib depende do regime: ME/EPP usa pTotTribSN (% aprox.
  // do Simples), MEI usa indTotTrib='0' (default), Não Optante usa vTotTrib/pTotTrib.
  valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
});

if (resultado.status === 'ok') {
  console.log(resultado.nfse.chaveAcesso);
}
```

`tomador` é opcional — se você não informar, a nota é emitida sem tomador identificado (legal em casos específicos, tipicamente varejo presencial).

## 2. Com tomador identificado

```typescript
await cliente.emitir({
  emitente: { /* ... ME/EPP, como acima ... */ },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
  tomador: {
    documento: { CNPJ: '11222333000181' },     // ou { CPF: '01075595363' }
    nome: 'Acme Ltda',
    email: 'financeiro@acme.test',
    endereco: {
      codMunicipio: '3550308',
      cep: '01310100',
      logradouro: 'Avenida Paulista',
      numero: '1578',
      bairro: 'Bela Vista',
      complemento: 'conj 12',                   // opcional
    },
  },
});
```

O CEP é validado contra ViaCEP por default. Desligue com `skipCepValidation: true` se estiver emitindo em lote e quiser cache próprio (ou passe um `cepValidator` custom).

## Layout `nt009`: `ajusteBC` e `ibsCbs`

Num cliente `nt009`, `emitir` aceita os mesmos params e mais dois grupos declarativos — `ajusteBC` (`AjusteBCInputNt009`, ajuste da base de cálculo) e `ibsCbs` (`IbsCbsInputNt009`, grupo IBS/CBS). A lib não calcula tributo: os valores vão como informados, e `finNFSe` sai como `'0'` (único valor do release 1).

```typescript
import {
  NfseClient, Ambiente, OpcaoSimplesNacional, RegimeEspecialTributacao,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente9 = new NfseClient({
  layout: 'nt009',                          // NfseClient<'nt009'> → resultados com NfseNt009
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),
  retryStore: createInMemoryRetryStore(),
});

const r9 = await cliente9.emitir({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    // Ajuste da BC do ISSQN por percentual/valor: prestador não MEI (E0436) e sem regime especial (E0445).
    regime: {
      opSimpNac: OpcaoSimplesNacional.NaoOptante,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  // cNBS é obrigatório com ibsCbs (E0322); 01.01 → NBS 1.1502.10.00 (Anexo VIII).
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Desenvolvimento de sistemas' },
  valores: { vServ: 1500, pTotTrib: { pTotTribFed: 13.45, pTotTribEst: 0, pTotTribMun: 5 } },
  ajusteBC: { issqn: { percentual: 10 } },
  // 01.01 → cClassTrib 000001 e cIndOp 100301 (Anexo VIII).
  ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' }, cIndOp: '100301' },
});
```

As regras de rejeição **fechadas** do Anexo I `20261020` — as que dependem só dos inputs — são checadas antes de consumir o `nDPS` e lançam `RuleViolationError` com o código em `err.rule` (`'E0322'`, `'E0532'`…). As que dependem de cadastro, parametrização municipal ou da calculadora do IBS/CBS ficam com a SEFIN. Lista completa e regras de contexto do ajuste de BC: [Leiautes](./layouts#inputs-de-alto-nivel-do-nt009).

### Locação de imóvel (99.03) — descontos derivados

Todo `cTribNac` 99.XX.XX exige `tribISSQN: '4'` (Não Incidência — **E0532** no `nt009`; o default `'1'` lança). Na locação (99.03), `ibsCbs.imovel.locacao` é obrigatória (E0937) e o `buildDps` **deriva** os descontos da DPS a partir dos totais da operação, como exigem E0434/E0443:

```typescript
import { TipoTribISSQN } from 'open-nfse';

await cliente9.emitir({
  emitente: { /* ... Não Optante, como acima ... */ },
  serie: '1',
  // 99.03.01 → NBS 1.1002.10.00, cIndOp 020201, cClassTrib 200027 (Anexo VIII).
  servico: { cTribNac: '990301', cNBS: '110021000', descricao: 'Locação de imóvel residencial' },
  valores: {
    vServ: 1000,                              // pCopropriedade × vTotOper = 50% × 2000
    tribISSQN: TipoTribISSQN.NaoIncidencia,   // E0532; sem aliqIss
    pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 },
  },
  ibsCbs: {
    classificacao: { CST: '200', cClassTrib: '200027' },
    cIndOp: '020201',                         // 99.03 exige um cIndOp 02XXXX (E0902)
    imovel: {
      codMunicipio: '2111300',
      locacao: { pCopropriedade: 50, vTotOper: 2000, vDescIncondTot: 100, vDescCondTot: 30 },
      unidades: [{ identificacao: { cCIB: 'ABC12345' } }], // cIndOp 020101/020201/020301 exige (E0938)
    },
  },
});
// DPS: valores.vDescCondIncond = { vDescIncond: 50, vDescCond: 15 }  (50% × 100, 50% × 30)
```

- `vDescIncond = pCopropriedade/100 × vDescIncondTot` (idem `vDescCond`), em 2 casas, meio centavo para cima. Desconto derivado zero não é emitido; derivado `>= vServ` lança E0431/E0432.
- `vTotOper` é o valor **total** da operação, não a parte do coproprietário; `vServ` deve ser `pCopropriedade × vTotOper` — o `buildDps` confere (E0433), aceitando o produto truncado ou arredondado para cima em centavos.
- `locacao` fora do 99.03 lança E0936; bens móveis (`ibsCbs.bensMoveis`) só no 99.04.01, onde são obrigatórios (E0963/E0967).
- E0902 (`cIndOp` 02XXXX) e E0938 (`unidades` obrigatórias) **não** são checadas pelo `buildDps` — quem rejeita é a SEFIN.

## 3. Lidando com cada resultado

A chave está em **tratar os três desfechos como cenários distintos**, não como variações do mesmo:

```typescript
import { ReceitaRejectionError, UnreadableAuthorizedNfseError } from 'open-nfse';

try {
  // `params` literal. Se vier tipado como EmitirParams<'nt004'>, passe
  // { ...params, dryRun: false } para cair no overload sem dry-run (ver seção 5).
  const r = await cliente.emitir(params);

  if (r.status === 'ok') {
    // Autorizada. Persista como documento fiscal oficial.
    await db.tx(async (tx) => {
      await tx.insert('nfse_autorizadas', {
        chave_acesso: r.nfse.chaveAcesso,
        id_dps: r.nfse.idDps,
        xml_nfse: r.nfse.xmlNfse,
        nnfse: r.nfse.nfse.infNFSe.nNFSe,
        valor_liquido: r.nfse.nfse.infNFSe.valores.vLiq,
        dh_proc: r.nfse.dataHoraProcessamento,
        tipo_ambiente: r.nfse.tipoAmbiente,
      });
      for (const alerta of r.nfse.alertas) {
        await tx.insert('nfse_alertas', { chave: r.nfse.chaveAcesso, ...alerta });
      }
    });
    return;
  }

  if (r.status === 'retry_pending') {
    // Transiente. Já persistido no retryStore pela lib.
    // Um cron de replayPendingEvents() cuida do resto.
    logger.warn('emit transient', { pendingId: r.pending.id, err: r.error.message });
    return;
  }
} catch (err) {
  if (err instanceof UnreadableAuthorizedNfseError) {
    // AUTORIZADA — a lib só não conseguiu montar o DTO (parser/layout). A nota
    // existe: persista a chave e NÃO reemita (geraria uma 2ª NFS-e). `xmlNfse`
    // falta quando a resposta veio sem o XML: baixe depois com fetchByChave.
    await db.insert('nfse_autorizadas', {
      chave_acesso: err.chaveAcesso,
      id_dps: err.idDps,
      xml_nfse: err.xmlNfse ?? null,
    });
    logger.error('NFS-e autorizada sem DTO', { chave: err.chaveAcesso, causa: err.cause });
    return;
  }
  if (err instanceof ReceitaRejectionError) {
    // Permanente. nDPS foi consumido; a nota foi definitivamente rejeitada.
    await db.insert('nfse_rejeicoes', {
      id_dps: err.idDps,
      codigo: err.codigo,
      descricao: err.descricao,
      mensagens: err.mensagens,
    });
    logger.error('emit rejeitada', { codigo: err.codigo, descricao: err.descricao });
    return;
  }
  throw err;
}
```

Três regras que emergem dessa estrutura:

- **`ok`** e **`UnreadableAuthorizedNfseError`** são os caminhos que criam linha em `nfse_autorizadas` — o segundo é raro (resposta que o parser não lê), mas a nota existe do mesmo jeito.
- **`retry_pending`** não precisa de ação imediata — a lib já salvou o pendente. Você pode opcionalmente registrar um log para dashboard, mas o replay cron é quem fecha o ciclo.
- **Permanente** (`ReceitaRejectionError`) consumiu o `nDPS` mas não vai virar NFS-e autorizada. Registre para auditoria e siga. Erros de validação local (`RuleViolationError`, `XsdValidationError`, `LayoutMismatchError`…) lançam **antes** do contador — nenhum `nDPS` consumido.

## 4. Cron de replay

Tudo que cai em `retry_pending` (de `emitir`, `cancelar` ou `substituir`) é persistido no `RetryStore`. Um cron que chama `replayPendingEvents` re-posta cada um com o XML assinado original (mesmo `infDPS.Id`; eventos deduplicados em `(chave, tipoEvento)`), então chamar N vezes não gera nota nova.

**Emissão já autorizada não vira falha.** O caso clássico de transiente é o timeout **depois** que o SEFIN gravou a NFS-e. O re-POST dessa DPS não devolve sucesso: volta como rejeição permanente — `E0014` (série/número já existe numa NFS-e) ou, se o pendente atravessou uma virada de layout, `E1235` (falha de schema). Antes de remover uma emissão rejeitada, a lib consulta `GET /dps/{idDps}`:

| `GET /dps/{id}`             | Item                                                                          | Store       |
|-----------------------------|-------------------------------------------------------------------------------|-------------|
| NFS-e encontrada            | `success_emission` (baixada via `GET /nfse/{chave}`), `reconciledFrom` = a rejeição | removida |
| NFS-e de **outra** DPS      | `failed_permanent` + `warn` `nfse.replay.reconcile_mismatch` (ver abaixo)       | removida    |
| 404                         | `failed_permanent` (`error` = a rejeição) — nenhuma NFS-e saiu dessa DPS       | removida    |
| falha transiente (inclui corpo malformado) | `still_pending` + `warn` `nfse.replay.reconcile_pending` | mantida     |
| outra falha (401/403/400) | `still_pending` + `warn` `nfse.replay.reconcile_failed` — investigue: volta a cada varredura | mantida |

O `infDPS.Id` só codifica município, CNPJ/CPF, série e `nDPS`. Se a numeração colidiu (contador em memória reiniciado, `nDPS` explícito reaproveitado), o E0014 é legítimo e o `GET /dps/{id}` devolve a nota **antiga**. Por isso a lib confere a DPS embutida na NFS-e baixada contra a persistida — `SignatureValue` da DPS, ou `dhEmi` quando a persistida não tem assinatura — e, se divergem, devolve `failed_permanent`: o serviço pendente **não** foi faturado; reemita com um `nDPS` novo.

Resposta 201 que o parser não consegue ler vira `success_emission_unreadable` (`error` = `UnreadableAuthorizedNfseError` com `chaveAcesso`/`xmlNfse`): a nota existe e a entrada sai do store. O mesmo status sai quando o `GET /dps/{id}` acha a nota mas o `GET /nfse/{chave}` falha de forma permanente — aí `error.xmlNfse` vem `undefined` (baixe depois com `fetchByChave`). `ReplayItem` usa a união `NFSe` (o store pode ter pendentes de outro layout — antes de trocar o cliente para `nt009`, drene o store: [Migração 0.12 §7](./migracao-0.12#virada-retrystore)).

Entradas com `notBefore` no futuro (caso clássico: 429 com `Retry-After: 120`) são puladas silenciosamente — não aparecem no resultado e ficam no store até `notBefore <= now`. A cada falha transiente no replay, `notBefore` é recalculado pela `RetryPolicy` e `attempts` incrementado. **`replayPendingEvents` é single-threaded** — dois processos chamando concorrentemente duplicariam o tráfego para o SEFIN. Garanta exclusão mútua no caller (cron single-instance ou lock distribuído).

```typescript
// schedule: a cada 1-5 minutos, um worker só
const items = await cliente.replayPendingEvents();

for (const item of items) {
  switch (item.status) {
    case 'success_emission':
      await db.insert('nfse_autorizadas', {
        chave_acesso: item.emission.chaveAcesso,
        id_dps: item.emission.idDps,
        xml_nfse: item.emission.xmlNfse,
        /* ... */
      });
      // item.reconciledFrom presente: o re-POST foi rejeitado (E0014/E1235…),
      // mas GET /dps/{id} mostrou que a nota já existia.
      logger.info('replay emissão ok', { id: item.id, reconciliada: !!item.reconciledFrom });
      break;

    case 'success_emission_unreadable':
      // Autorizada, mas a lib não montou o DTO — persista a chave, não reemita.
      await db.insert('nfse_autorizadas', {
        chave_acesso: item.error.chaveAcesso,
        id_dps: item.error.idDps,
        xml_nfse: item.error.xmlNfse ?? null, // pode faltar: fetchByChave depois
      });
      logger.error('replay: NFS-e autorizada sem DTO', { id: item.id, causa: item.error.cause });
      break;

    case 'success':
      // Evento de cancelamento (101101) bem sucedido
      await db.insert('nfse_eventos', {
        chave_acesso: item.evento.evento.infEvento.pedRegEvento.infPedReg.chNFSe,
        tipo_evento: item.evento.evento.infEvento.pedRegEvento.infPedReg.tipoEvento,
        xml_evento: item.evento.xmlEvento,
        /* ... */
      });
      logger.info('replay evento ok', { id: item.id });
      break;

    case 'still_pending':
      // Transiente de novo — fica no store, próxima rodada tenta
      logger.warn('replay transient', { id: item.id, err: item.error.message });
      break;

    case 'failed_permanent':
      // Permanente — lib removeu do store. Para emissões, o GET /dps/{id}
      // confirmou que não há NFS-e dessa DPS (404, ou a nota achada é de outra
      // DPS — warn nfse.replay.reconcile_mismatch). Consulta que não decide
      // (403, corpo malformado…) nunca cai aqui: vira still_pending. Caller
      // decide (alerta, ticket, reemissão consciente com novo nDPS).
      logger.error('replay permanent', { id: item.id, err: item.error.message });
      break;
  }
}
```

O worker deve ser **único entre todos os processos**, não um por processo — crons concorrentes re-postam a mesma DPS ao mesmo tempo: não nasce nota nova (o `infDPS.Id` é o mesmo e o SEFIN rejeita o repetido com E0014, que o replay reconcilia via `GET /dps/{id}`), mas a quota é desperdiçada e os dois processos disputam a mesma entrada do store.

## 5. Bulk com o mesmo fluxo seguro

`emitir(params)` é uma chamada por vez, mas um worker pool simples paraleliza sem perder a segurança do counter + retry store:

```typescript
import { type EmitirParams, type EmitirResult, UnreadableAuthorizedNfseError } from 'open-nfse';

type ItemBulk =
  | EmitirResult<'nt004'>
  | { readonly status: 'autorizada_ilegivel'; readonly error: UnreadableAuthorizedNfseError }
  | { readonly status: 'throw'; readonly error: Error };

async function emitirBulk(
  lote: readonly EmitirParams<'nt004'>[],
  concurrency = 4,
): Promise<ItemBulk[]> {
  const resultados: ItemBulk[] = new Array(lote.length);
  let proximo = 0;

  async function worker() {
    while (proximo < lote.length) {
      const idx = proximo++;
      // `dryRun: false` escolhe o overload que devolve EmitirResult (não o dry-run).
      const params = { ...(lote[idx] as EmitirParams<'nt004'>), dryRun: false as const };
      try {
        resultados[idx] = await cliente.emitir(params);
      } catch (err) {
        resultados[idx] =
          err instanceof UnreadableAuthorizedNfseError
            ? { status: 'autorizada_ilegivel', error: err } // AUTORIZADA — não reemita
            : { status: 'throw', error: err as Error };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return resultados;
}

const lote = pedidosDoMes.map((p) => paramsParaEmissao(p)); // sua função
const rs = await emitirBulk(lote, 4);

for (const r of rs) {
  if (r.status === 'ok') await persistirAutorizada(r);
  else if (r.status === 'autorizada_ilegivel') await persistirAutorizada(r.error); // chaveAcesso/xmlNfse
  else if (r.status === 'retry_pending') logger.warn('pendente', r.pending.id);
  else await persistirRejeicao(r.error);
}
```

Cada `emitir(params)` individual ainda:
- Consulta o `DpsCounter` atomicamente (sua impl Postgres garante isso)
- Persiste `retry_pending` no `RetryStore` em falha transiente
- Lança em rejeição permanente — exceto `UnreadableAuthorizedNfseError`, que é nota **autorizada** (vai para `nfse_autorizadas` com a `chaveAcesso`, nunca para rejeições)

Sem surpresas ao paralelizar.

::: tip Cache de CEP em lote
O validador default já é um `createViaCepValidator()` único por processo, com cache em memória — CEPs repetidos no lote custam um lookup só. Passe um `cepValidator` próprio em `NfseClientConfig` só para trocar o provider ou compartilhar o cache entre processos.
:::

## 6. Dry-run — preview sem enviar

Roda os mesmos guards e validações, monta e assina o XML **sem enviar à Receita** e **sem consumir o counter**. Ideal para CI, auditoria de payload ou debug offline:

```typescript
const dry = await cliente.emitir({ ...params, dryRun: true }); // DpsDryRunResult

dry.xmlDpsAssinado;   // XML assinado (RSA-SHA256 + exc-c14n + enveloped)
dry.xmlDpsGZipB64;    // payload gzip+base64, pronto para POST manual se quiser
```

Placeholder `nDPS: '1'` é usado no dry-run (ou passe `params.nDPS` explícito). O certificado é carregado (para assinar) e o lookup de CEP ainda consulta o ViaCEP — para um dry-run 100% offline, passe também `skipCepValidation: true`. Para uma DPS já montada, `cliente.emitirDpsPronta(dps, { dryRun: true })` devolve o mesmo `DpsDryRunResult`.

## 7. Opções (flags)

`EmitirParams<L>` é o `BuildDpsParams` do layout `L` sem `layout` (vem do cliente) e com `nDPS` opcional, somado a `EmitOptions` — as flags viajam junto no mesmo objeto:

```typescript
await cliente.emitir({
  ...params,
  dryRun: false,                  // true = preview sem enviar (seção 6)
  skipValidation: false,          // pula o XSD do layout do cliente
  skipCepValidation: false,       // pula lookup ViaCEP
  skipCpfCnpjValidation: false,   // pula DV CPF/CNPJ
  cepValidator: brasilApi,        // override do validador default
  nDPS: '999',                    // override — counter NÃO é chamado
});
```

Validações rodam nesta ordem: layout + regras do `buildDps` (sempre) → CPF/CNPJ (sync) → XSD (WASM) → CEP (HTTP). Desligar é útil em cenários específicos (alta-frequência com cache próprio, debug) — mais detalhes em [Validações](./validacoes).

## Errors de validação local (throw imediato)

Com defaults, essas falhas **nem chegam** à Receita:

| Erro                           | Causa                                                       |
|--------------------------------|-------------------------------------------------------------|
| `InvalidCnpjError`             | DV do CNPJ incorreto ou formato fora de `^[A-Z0-9]{12}\d{2}$` |
| `InvalidCpfError`              | Mesmo, para CPF                                             |
| `InvalidCepError`              | `err.reason`: `'format'`, `'not_found'` (CEP inexistente no ViaCEP) ou `'api_unavailable'` (ViaCEP fora do ar) |
| `XsdValidationError`           | DPS não bate com o XSD do layout (campo faltando, pattern errado) |
| `InvalidDpsIdParamError`       | cMun/CNPJ/série/nDPS fora do formato do `TSIdDPS`            |
| `RuleViolationError`           | Regra fechada do Anexo I, código em `err.rule` (ex.: E0322, E0532, E0712/E0713, E0424) |
| `InvalidLayoutError`           | `layout` fora de `LAYOUTS` (chamador JS)                     |
| `LayoutMismatchError`          | DPS/params de outro layout que o do cliente, ou campo exclusivo do outro layout (`err.field`) |
| `MissingDpsCounterError`       | `emitir(params)` sem `params.nDPS` e sem `dpsCounter` configurado |
| `MissingRetryStoreError`       | Transiente no POST sem `retryStore` para persistir — o único da tabela que ocorre **depois** do envio (`nDPS` já consumido) |

Todos herdam de `OpenNfseError` — [hierarquia completa](./erros).

::: tip IBS / CBS e data de competência
Regra E0850 do Anexo I (nos dois layouts): o grupo `IBSCBS` só é aceito com `dCompet ≥ 2026-01-01`. Se você está emitindo retroativamente para competência anterior, omita-o (no `nt009`, não passe `ibsCbs`) — a Receita rejeita com E0850, que não é checada localmente. O espelho, para documentos de dedução/redução: `docFiscalOutro` só com competência do documento (`dtCompDoc`) anterior a 2026 (E0942 no `nt004`, cujo texto diz "anterior a 31/12/2025"; no `nt009`, E0476 no `ajusteBC`, checada pelo `buildDps`).
:::

## Reconciliação pós-timeout — `fetchDpsStatus`

Se um `emitir()` não retornou (processo morreu, timeout sem `retry_pending` capturado), você pode consultar o status pelo `idDps` usando `GET /dps/{id}`:

```typescript
import { NotFoundError } from 'open-nfse';

try {
  const status = await cliente.fetchDpsStatus('DPS211130020057475300010000001000000000000001');
  // NFS-e existe — reconcilia com seu DB usando status.chaveAcesso
  console.log('recuperada:', status.chaveAcesso);
} catch (err) {
  if (err instanceof NotFoundError) {
    // nenhuma NFS-e gerada com esse idDps — pode reemitir com novo idDps
  } else {
    throw err;
  }
}
```

Para reconciliação em lote, use `existsDpsStatus(idDps)` (HEAD, sem body) e busque detalhes só nos que existem:

```typescript
const pendentes = await db.query(`SELECT id_dps FROM dps_submissions WHERE status='in_flight'`);
for (const { id_dps } of pendentes) {
  if (await cliente.existsDpsStatus(id_dps)) {
    const s = await cliente.fetchDpsStatus(id_dps);
    await persistirAutorizada(s);
  } else {
    await db.query(`UPDATE dps_submissions SET status='pending' WHERE id_dps = $1`, [id_dps]);
  }
}
```

---

## Escape hatch: `emitirDpsPronta(dps)`

Quando você precisa controlar a pipeline inteira (replay determinístico, pré-assinatura externa, migração de sistema legado, integração com HSM custom), use `cliente.emitirDpsPronta(dps)`. Ele **bypassa counter e retry store** — throw em tudo, nenhum `retry_pending`.

```typescript
import { buildDps } from 'open-nfse';

const dps = buildDps({
  layout: 'nt004',                               // obrigatório
  emitente: { /* ... */ },
  serie: '1', nDPS: '42',                        // obrigatório
  servico: { /* ... */ },
  valores: { /* ... */ },
});

const nfseAutorizada = await cliente.emitirDpsPronta(dps);
console.log(nfseAutorizada.chaveAcesso);
```

`buildDps` monta DPS completa a partir de ~10 campos semânticos (vs 50+ manuais) e tem um overload por layout: `layout: 'nt004'` devolve `DpsNt004`, `layout: 'nt009'` devolve `DpsNt009` (e aceita `ajusteBC`/`ibsCbs`). O campo `layout` do DTO é sintético — nunca vai para o XML (os dois layouts serializam `versao="1.01"`). Defaults aplicados: `versao='1.01'`, `tpAmb='2'` (Homologação; no `emitir` do cliente o default segue o `ambiente` — ver [Setup](#setup)), `tpEmit='1'`, `dhEmi=now`, `dCompet=now`, `verAplic='open-nfse/<versão>'` (ex.: `open-nfse/0.12.0rc1`), `tribISSQN='1'`, `tpRetISSQN='1'`, `locPrest=emitente.codMunicipio` e, no `nt009`, `finNFSe='0'`.

**Total de tributos (`totTrib`) depende do regime** (`opSimpNac`) — o builder seleciona o membro válido e rejeita o inválido (E0710/E0712/E0713):

| Regime (`opSimpNac`) | Membro do `totTrib` |
|---|---|
| MEI (`2`) | `indTotTrib='0'` (default automático) |
| ME/EPP (`3`) | informe `pTotTribSN` (% aprox. do Simples) |
| Não Optante (`1`) | informe `vTotTrib` **ou** `pTotTrib` (Lei da Transparência / IBPT) |

Cobre o caso comum; para **tomador exterior, obra, atividade-evento**, dedução/redução e IBS/CBS no `nt004` (no `nt009`, ajuste de BC e IBS/CBS saem de `ajusteBC`/`ibsCbs`), construa `InfDPSNt004`/`InfDPSNt009` manualmente (todos os tipos RTC estão exportados) e monte a DPS como `{ layout, versao: '1.01', infDPS }`.

### `emitirEmLote(dpsList, options)`

Mesmo contrato do escape hatch — worker pool client-side sobre `DpsFor<L>[]` pré-montado (`nDPS` preenchido pelo caller), **sem** `DpsCounter` nem `RetryStore`. O lote inteiro é checado contra o layout do cliente antes do primeiro envio: um único item de outro layout rejeita tudo com `LayoutMismatchError`.

```typescript
const resLote = await cliente.emitirEmLote(dpsList, { concurrency: 4, stopOnError: false });
// resLote: EmitLoteResult<'nt004'> — { items, successCount, failureCount, skippedCount }

for (const item of resLote.items) {
  switch (item.status) {
    case 'success':            // item.result: NfseEmitResult<'nt004'>
      await persistirAutorizada(item.result);
      break;
    case 'success_unreadable': // AUTORIZADA, resposta ilegível — não reemita
      await persistirAutorizada(item.error); // chaveAcesso, idDps, xmlNfse?
      break;
    case 'failure':            // inclui 429/5xx: nada é persistido pela lib
      await persistirRejeicao(item.error);
      break;
    case 'skipped':            // stopOnError: true abortou antes deste item
      break;
  }
}
```

`successCount` conta `success` **e** `success_unreadable`, que também não aborta o lote com `stopOnError`. Re-enviar um item que falhou (mesmo `nDPS`, mesmo `infDPS.Id`) pode voltar como E0014 se a DPS já tinha sido autorizada — confira com `fetchDpsStatus(idDps)` antes de tratar como falha. A seção **5. Bulk com o mesmo fluxo seguro** acima é o equivalente idiomático para quem quer manter o `DpsCounter` + `RetryStore` no caminho.

## Exemplo runnable

[`examples/emit-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/emit-nfse) — `npm start` (emissão única) e `npm run bulk` (lote), ambos com dry-run por default.
