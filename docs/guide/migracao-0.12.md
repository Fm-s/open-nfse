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

Para quem continua em produção no leiaute atual, escolha `'nt004'` em tudo: o comportamento é o da 0.11.

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
  readonly pedidoId: string;
}
// …ou use interseção (também serve para código genérico no layout)
type EmitirPedidoParams<L extends Layout = 'nt004'> = EmitirParams<L> & {
  readonly pedidoId: string;
};
```

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

## 6. Outras mudanças

- `parseNfseXml(xml, { logger? })` lê os dois leiautes; campos inesperados geram `warn` `nfse.parse.unexpected_field`.
- `cancelar`/`substituir` (funções livres) ganharam um `layout?` opcional ao final; pelo `NfseClient` nada muda.
- `PendingEvent.layout?` (opcional, observabilidade) — dados já persistidos continuam válidos.
- Novos enums `TipoAjusteBC` e `TipoAjusteBCLocImoveis`, novos erros `InvalidLayoutError` e `LayoutMismatchError` (com `field` opcional).
