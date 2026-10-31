# Migração 0.11 → 0.12

A `0.12.0` introduz o suporte a dois leiautes (`nt004` e `nt009`; veja [Leiautes](./layouts)). É uma versão com **breaking changes**; a `0.12.0-rc.1` é uma release candidate publicada sob o dist-tag `next`.

## Checklist

1. Passe `layout` ao construir o cliente.
2. Passe `layout` ao chamar `buildDps`.
3. Passe `{ layout }` às funções de validação de XSD.
4. Troque os nomes de tipos que ganharam sufixo.
5. Use `NfseClientFake({ layout })` nos testes.
6. Se você escreveu `NfseClientLike` próprio, revise a nova assinatura genérica.

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

## 2. `buildDps` exige `layout`

```ts
// antes
const dps = buildDps({ emitente, serie: '1', nDPS: '42', servico, valores });

// depois
const dps = buildDps({ layout: 'nt004', emitente, serie: '1', nDPS: '42', servico, valores });
```

O retorno é `DpsFor<'nt004'>`. Os inputs novos (`ajusteBC`, `ibsCbs`) existem só com `layout: 'nt009'`.

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
