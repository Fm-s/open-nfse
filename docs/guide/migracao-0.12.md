# Migração 0.11 → 0.12

A `0.12.0` introduz o suporte a dois leiautes (`nt004` e `nt009`; veja [Leiautes](./layouts)). É uma versão com **breaking changes**; a `0.12.0-rc.1` é uma release candidate publicada sob o dist-tag `next`.

## Checklist

1. Passe `layout` ao construir o cliente.
2. Passe `layout` ao chamar `buildDps`.
3. Passe `{ layout }` às funções de validação de XSD.
4. Troque os nomes de tipos que ganharam sufixo.
5. Use `NfseClientFake({ layout })` nos testes.
6. Se você escreveu `NfseClientLike` próprio, revise a nova assinatura genérica.
7. DTOs de `DPS` persistidos na 0.11 (sem `layout`) precisam de `layout: 'nt004'` antes de voltar à lib.
8. `interface X extends EmitirParams` (sem argumento) não compila mais — use `EmitirParams<'nt004'>`.
9. Na virada para o `nt009`, drene o `RetryStore` com o cliente `nt004` antes de trocar ([seção 7](#virada-retrystore)).
10. Revise os pré-checks novos de `cancelar`/`substituir`, o tratamento de `UnreadableAuthorizedNfseError` e as mudanças do `NfseClientFake` ([seção 6](#outras-mudancas)) — valem também no `nt004`.

Para quem continua em produção no leiaute atual, escolha `'nt004'` em tudo: os XMLs enviados e o fluxo de emissão são os da 0.11, **com** os pré-checks locais, os resultados novos e as mudanças do fake listados na [seção 6](#outras-mudancas) e no fim da [seção 7](#virada-retrystore).

## 1. `NfseClient` exige `layout`

```ts
// antes (0.11)
const cliente = new NfseClient({ ambiente, certificado });

// depois (0.12)
const cliente = new NfseClient({ layout: 'nt004', ambiente, certificado });
// NfseClient<'nt004'>: emitir/emitirDpsPronta/emitirEmLote/substituir só aceitam tipos nt004
```

`EmitirParams<L>` não tem campo `layout` (vem da config). Valor inválido lança `InvalidLayoutError`; DPS de outro layout, `LayoutMismatchError`.

### `EmitirParams` virou alias condicional

Na 0.11, `EmitirParams` era uma `interface`; na 0.12 é um alias condicional distribuído por layout (`EmitirParams<L extends Layout = Layout>`). Sem argumento ele é uma união, e o TypeScript não deixa uma interface estendê-la (`TS2312: An interface can only extend an object type…`):

```ts
// antes (0.11) — não compila mais na 0.12
interface EmitirPedidoParams extends EmitirParams {
  readonly pedidoId: string;
}

// depois (0.12) — fixe o layout…
interface EmitirPedidoParams extends EmitirParams<'nt004'> {
  readonly dryRun?: false;
  readonly pedidoId: string;
}
// …ou use interseção (também serve para código genérico no layout)
type EmitirPedidoParams<L extends Layout = 'nt004'> = EmitirParams<L> & {
  readonly dryRun?: false;
  readonly pedidoId: string;
};

async function emitirPedido<L extends Layout>(cliente: NfseClient<L>, p: EmitirPedidoParams<L>) {
  return cliente.emitir(p); // Promise<EmitirResult>
}
```

O `readonly dryRun?: false` é necessário para o valor ser aceito por `cliente.emitir(p)`: `EmitirParams` declara `dryRun?: boolean`, e os overloads de `emitir` pedem `dryRun: true` (→ `DpsDryRunResult`) **ou** `dryRun?: false` (→ `EmitirResult`) — um `boolean` aberto não casa com nenhum dos dois (`TS2769`). Para um tipo de preview, use `readonly dryRun: true`.

## 2. `buildDps` exige `layout`

```ts
// antes
const dps = buildDps({ emitente, serie: '1', nDPS: '42', servico, valores });

// depois
const dps = buildDps({ layout: 'nt004', emitente, serie: '1', nDPS: '42', servico, valores });
```

O retorno é `DpsNt004` (`DpsNt009` com `layout: 'nt009'`). Os inputs novos (`ajusteBC`, `ibsCbs`) existem só com `layout: 'nt009'`.

### DPS persistidas na 0.11

Uma `DPS` montada e guardada (banco, fila, JSON) na 0.11 não tem o campo `layout`. Na 0.12, `buildDpsXml`, `emitirDpsPronta`/`emitirEmLote`/`substituir` e os coletores (`collectIdentifiersFromDps`, `collectCepsFromDps`) lançam `InvalidLayoutError` para uma DPS sem `layout`. Ao reidratar, acrescente o layout em que ela foi montada — na 0.11 só existia o `nt004`:

```ts
const dps: DpsNt004 = { ...(JSON.parse(salvo) as Omit<DpsNt004, 'layout'>), layout: 'nt004' };
```

Datas guardadas como string continuam precisando voltar a `Date`, como na 0.11. `PendingEmission`/`PendingEvent` já persistidos não precisam de migração: guardam XML assinado, e o `layout?` deles é opcional.

## 3. Validadores de XSD exigem `{ layout }`

```ts
// antes
await validateDpsXml(xml);
await validateEventoXml(xml);

// depois
await validateDpsXml(xml, { layout: 'nt004' });
await validateEventoXml(xml, { layout: 'nt004' });
await validatePedRegEventoXml(xml, { layout: 'nt004' });
```

## 4. Tipos renomeados

Tipos que mudam entre os layouts ganharam sufixo, **sem alias sem sufixo**. Os principais:

| 0.11 | 0.12 |
|------|------|
| `InfoValores` | `InfoValoresNt004` / `InfoValoresNt009` |
| `InfoDedRed` | `InfoDedRedNt004` |
| `RtcInfoIbsCbs` | `RtcInfoIbsCbsNt004` / `RtcInfoIbsCbsNt009` |
| `ValoresNFSe` | `ValoresNFSeNt004` / `ValoresNFSeNt009` |
| `InfDPS` | `InfDPSNt004` / `InfDPSNt009` |
| `InfNFSe` | `InfNFSeNt004` / `InfNFSeNt009` |

`DPS` e `NFSe` agora são uniões (`DpsNt004 | DpsNt009`, `NfseNt004 | NfseNt009`) com o discriminante sintético `layout`. Estreite com `if (nfse.layout === 'nt004')`. Para tipar por layout use `DpsFor<L>` / `NfseFor<L>`. Se o seu código acessa `vDedRed`, `gReeRepRes` etc., ele agora precisa estreitar para `nt004`.

## 5. `NfseClientFake` e `NfseClientLike`

```ts
// antes
const fake = new NfseClientFake();
// depois
const fake = new NfseClientFake({ layout: 'nt004' });          // ambiente continua opcional
const fake9 = new NfseClientFake({ layout: 'nt009', ambiente: TipoAmbiente.Homologacao });
```

`NfseClientLike<L = Layout>` é genérico; sem argumento aceita qualquer cliente, então serviços só de leitura não precisam escolher.

## 6. Outras mudanças {#outras-mudancas}

- `parseNfseXml(xml, { logger? })` lê os dois leiautes; campos do outro leiaute geram `warn` `nfse.parse.unexpected_field` (e são ignorados); valores aceitos pelo XSD mas sempre rejeitados pelo Anexo I (nt009: E0031, E0034) são mantidos, com `warn` `nfse.parse.rule_violation`.
- `cancelar` (função livre) ganhou `layout?` opcional ao final; `substituir` (função livre) ganhou `layout?` e, depois dele, `logger?` (recebe os `warn` do parser da substituta). Pelo `NfseClient` nada muda.
- `PendingEvent.layout?` (opcional, observabilidade) — dados já persistidos continuam válidos.
- Novos enums `TipoAjusteBC` e `TipoAjusteBCLocImoveis`, novos erros `InvalidLayoutError` e `LayoutMismatchError` (com `field` opcional).

**Pré-checks novos em `cancelar`/`substituir` (os dois leiautes, antes de qualquer I/O):**

- `xMotivo` segue o pattern de `TSString` (base de `TSMotivo`): só U+0020–U+00FF, sem espaço nas pontas. Travessão `–`, aspas curvas, tab ou quebra de linha (o caso comum de texto colado de editor) lançam `RuleViolationError` (`rule: 'TSMotivo'`) — na 0.11 iam à Sefin e voltavam como rejeição de schema. `xMotivo` ausente ou não-string (chamador JS) também vira `RuleViolationError('TSMotivo')`, não `TypeError`.
- `substituir`: um `infDPS.subst` já preenchido na `novaDps` precisa ser idêntico a `chaveOriginal`/`cMotivo`/`xMotivo` — divergência lança `RuleViolationError` (`rule: 'infDPS/subst'`); na 0.11 o `subst` da DPS era enviado em silêncio. A chave substituída é checada contra `TSChaveNFSe` (`rule: 'TSChaveNFSe'`) e contra o `infDPS.Id` da substituta — Cód.Mun./Tipo de Inscrição/Inscrição iguais (`rule: 'E0042'`) — e um `infDPS.Id` fora de `TSIdDPS` lança `InvalidDpsIdError`.

**Emissão e leitura:**

- Resposta `201` cujo XML a lib não consegue ler → `UnreadableAuthorizedNfseError` com a chave (ver [seção 7](#virada-retrystore)); o mesmo para um `201` com `chaveAcesso` mas sem `nfseXmlGZipB64`. `201` sem corpo → `NetworkError` (transiente: `emitir`/`substituir` devolvem `retry_pending` e o replay reconcilia). `fetchDpsStatus` com `200` sem `chaveAcesso` também lança `NetworkError`.
- `fetchByChave`, `consultarDanfse` e o `NfseClientFake` aceitam, além do pattern de `TSChaveNFSe`, a chave na regra de formação de `TSIdNFSe` (CNPJ alfanumérico nas posições 10–23) — a chave real de um CNPJ alfanumérico com letra no 12º caractere não casa com `TSChaveNFSe`.
- `verAplic` default: na 0.11 era `open-nfse/<versão>` literal; na 0.12 o pré-release convencional é compactado (`0.12.0-rc.1` → `open-nfse/0.12.0rc1`), cai para o prefixo `onfse/` quando não cabe nos 20 chars e, como último recurso, para `onfse#<hash>` (nunca trunca nem lança). Só importa se você lê o `verAplic` das notas emitidas.

**`NfseClientFake` e `synthNfse`** (testes que afirmavam o comportamento antigo do fake podem quebrar):

- Os guards offline do real rodam **antes** da falha programada, que não é consumida por eles nem pelo `dryRun`: os do `buildDps` em `emitir`, o DV de CPF/CNPJ em `emitirDpsPronta`/`emitirEmLote`/`substituir` (honrando `skipCpfCnpjValidation`), os de `cancelar` (motivo, `TSMotivo`, chave e `verAplic` do pedido) e os de `substituir` acima.
- `substituir` com `failNextEmit({ kind: 'transient' })` devolve `retry_pending` (como o real) em vez de lançar `TimeoutError`; a original fica intacta.
- As chaves sintetizadas seguem a regra de formação de `TSIdNFSe` a partir do `infDPS.Id` (`synthChaveAcesso(seq, cnpj, idDps?)`), então passam na E0042 ao serem substituídas.
- `synthNfse` calcula `infNFSe.valores` pelas fórmulas do Anexo I (`vBC` com os ajustes da BC, `vISSQN = vBC × pAliq`, `vTotalRet`, e `vLiq` subtraindo ISSQN/PIS/COFINS **só quando retidos** — na 0.11 o ISSQN era sempre subtraído) e lança `InvalidLayoutError` para DPS sem `layout`.
- Os resultados de emissão do fake são estreitados pelo layout como no real (`NfseClientFake<'nt009'>` / `NfseClientLike<'nt009'>` → `NfseNt009`).

## 7. Virada para o `nt009`: drenar o `RetryStore` {#virada-retrystore}

O leiaute atual vale até **30/11/2026**; em 01/12 o `nt009` entra em produção. O `RetryStore` guarda o XML **já assinado** de cada emissão pendente, e o replay o reenvia como está: uma DPS `nt004` não tem `infDPS/finNFSe` (obrigatório no `nt009`), então reenviada depois da virada deve ser rejeitada por schema (E1235). Eventos pendentes não são afetados — o leiaute de evento não muda no release 1.

**Roteiro:**

1. **Antes de 30/11 23:59**, pare de emitir com o cliente `nt004` e drene o store com ele mesmo:

   ```ts
   const nt004 = new NfseClient({ layout: 'nt004', ambiente, certificado, retryStore });
   for (;;) {
     const items = await nt004.replayPendingEvents();
     // trate os itens como no cron (success_emission → nfse_autorizadas, etc.)
     const emissoes = (await retryStore.list()).filter((p) => p.kind === 'emission');
     if (emissoes.length === 0) break;
     await new Promise((r) => setTimeout(r, 60_000)); // ainda há pendentes: espere e repita
   }
   await nt004.close();
   ```

2. **Comece com folga de pelo menos 1h.** Entradas com `notBefore` no futuro (429 com `Retry-After`; a policy default limita a espera a 1h) são **puladas sem aparecer no resultado** — por isso o laço acima olha o `store.list()`, não os itens. Se o prazo apertar, regrave a entrada sem `notBefore` (`const { notBefore, ...e } = entry; await retryStore.save(e)`) e rode o replay de novo — o SEFIN pode devolver outro 429.
3. **Só então** crie o cliente `nt009` (o `layout` não muda num cliente existente) e volte a emitir.
4. **Sobrou alguma emissão `nt004`?** O replay com o cliente `nt009` gera `warn` `nfse.replay.layout_divergente` e reenvia o XML. Na rejeição (E1235), a lib consulta `GET /dps/{idDps}` antes de apagar a entrada:
   - a DPS já tinha virado NFS-e (o POST original deu timeout depois do commit) → `success_emission` com a NFS-e e `reconciledFrom` = a rejeição. **Não reemita.**
   - a NFS-e achada embute **outra** DPS (série/nDPS reaproveitados) → `failed_permanent` + `warn` `nfse.replay.reconcile_mismatch`: trate como o 404 abaixo.
   - 404 → `failed_permanent`: nenhuma nota saiu dessa DPS. Refaça a emissão com o cliente `nt009` (novo `nDPS` do counter). O `id` do item é `emission:<idDps>`; se você precisa de `serie`/`nDPS`/`emitenteCnpj` para remontar, leia-os do `store.list()` **antes** do replay.
   - falha transiente na consulta → `still_pending`; a entrada fica para a próxima passada.
   - outra falha na consulta (401/403/400, corpo malformado) → também `still_pending` + `warn` `nfse.replay.reconcile_failed`: a entrada fica até a consulta decidir. Investigue (permissão do certificado no `GET /dps`, proxy) em vez de reemitir.

A mesma reconciliação vale fora da virada: um re-POST rejeitado com E0014 (série/número já existe) de uma DPS que o SEFIN autorizou antes do timeout volta como `success_emission`, não como falha.

**Mudanças no `ReplayItem` e na emissão (0.12):**

- `success_emission` ganhou `reconciledFrom?` (a rejeição do re-POST, quando o item veio da reconciliação) e há o status novo `success_emission_unreadable`. Um `switch` exaustivo sobre `item.status` precisa do `case` novo.
- Novo erro `UnreadableAuthorizedNfseError`: NFS-e **autorizada** cuja resposta a lib não conseguiu interpretar (parser ou NFS-e de outro layout que a DPS enviada). Carrega `chaveAcesso`/`idDps`/`xmlNfse` — persista e **não reemita**. Na 0.11 essa falha saía como um erro genérico, sem a chave. `emitir`/`emitirDpsPronta`/`substituir` lançam; `emitirEmLote` devolve o item `success_unreadable` (conta em `successCount` e não aborta o lote com `stopOnError`); o replay, `success_emission_unreadable`. Um `switch` exaustivo sobre `EmitLoteItem['status']` também precisa do `case` novo.
- O replay não apaga mais uma emissão sem saber se a nota existe: só o `404` do `GET /dps/{id}` leva a `failed_permanent`; qualquer outra falha da consulta mantém a entrada (`still_pending`).
- Resultados de emissão tipados pelo layout do cliente: em `NfseClient<'nt009'>`, `emitir`/`emitirDpsPronta`/`emitirEmLote`/`substituir` devolvem `NfseNt009` (`NfseEmitResult<L>`, `EmitirResult<L>`, `EmitLoteResult<L>`, `SubstituirResult<L>`; sem argumento, a união de antes). O `ReplayItem` segue com a união — o store pode ter pendentes de outro layout.
