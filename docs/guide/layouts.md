# Leiautes: `nt004` e `nt009`

A NFS-e Padrão Nacional passa por uma troca de leiaute em **01/12/2026** (NT 009/2026). Como NFS-e e DPS nos dois formatos convivem por muito tempo, a lib suporta **dois leiautes ao mesmo tempo**, identificados por `Layout`:

| `layout`  | O que é | Bundle XSD | Pasta |
|-----------|---------|------------|-------|
| `'nt004'` | Leiaute vigente em produção: NT 004 v2.0 + `tpRetPisCofins` (NT 007) + CNPJ alfanumérico | `20260727` | `schemas/1.01/` |
| `'nt009'` | NT 009 release 1 (`vAjusteBC` no lugar de `vDedRed`/`gReeRepRes`, `finNFSe` na raiz da DPS, CST/cClassTrib reposicionados, imóvel reestruturado, bens móveis) | `esquemas_prod_restrita_20261020` | `schemas/1.01-nt009/` |

Os dois serializam `versao="1.01"`; o que os distingue é a estrutura do XML. `LAYOUTS` exporta a lista (`readonly Layout[]`).

::: warning Preview
O `nt009` acompanha o último bundle de **Produção Restrita**. Os tipos `*Nt009` e os inputs `ajusteBC`/`ibsCbs` podem mudar entre as versões `0.12.0-rc.N` (uma RC por novo bundle), até a `0.12.0` final.
:::

## Como escolher

`layout` é **obrigatório** e explícito. Não há default nem seleção automática por data: cada adiamento de cronograma exigiria um release da lib.

```ts
const cliente = new NfseClient({
  layout: 'nt004',            // ou 'nt009'
  ambiente: Ambiente.Producao,
  certificado: { pfx, password },
});
// cliente: NfseClient<'nt004'>
```

O cliente é genérico: `emitir`, `emitirDpsPronta`, `emitirEmLote` e `substituir` só aceitam tipos daquele layout em tempo de compilação. Para JS puro (ou casts), a checagem acontece em runtime: valor fora de `LAYOUTS` lança `InvalidLayoutError`; uma DPS de outro layout lança `LayoutMismatchError` **antes** de consumir o contador, assinar ou fazer qualquer I/O (`emitirEmLote` valida o lote inteiro antes do primeiro item).

Funções livres seguem a mesma regra: as que recebem DTO leem `dps.layout`; as que recebem XML cru exigem `{ layout }`:

```ts
const dps = buildDps({ layout: 'nt009', /* ... */ });   // DpsFor<'nt009'>
await validateDpsXml(xml, { layout: 'nt009' });
await validatePedRegEventoXml(xml, { layout: 'nt009' });
await validateEventoXml(xml, { layout: 'nt009' });
```

## Virada em 01/12/2026

Na virada, **crie um novo cliente** com `layout: 'nt009'` (o `layout` não muda em um cliente existente). Antes, valide o fluxo em Produção Restrita, onde o `nt009` já está disponível.

Atenção a eventos pendentes: o `RetryStore` guarda o XML já assinado e o reenvia como está. `PendingEvent.layout?` registra o layout de origem (só observabilidade). Reenviar após a virada uma DPS `nt004` pode ser rejeitado pelo servidor; a lib não converte.

## Leitura: os dois leiautes, sem perda

NFS-e emitidas no leiaute antigo continuam chegando por `fetchByChave`/`fetchByNsu` depois de 01/12. O parser **detecta o layout** pelo elemento `infDPS/finNFSe` (filho direto de `infDPS`; obrigatório no `nt009`, inexistente no `nt004`) e devolve o DTO correspondente, com todos os campos acessíveis:

```ts
import { parseNfseXml } from 'open-nfse';

const nfse = parseNfseXml(xml, { logger });
if (nfse.layout === 'nt009') {
  nfse.infNFSe.DPS.infDPS.finNFSe;      // NfseNt009
} else {
  nfse.infNFSe.DPS.infDPS.valores.vDedRed;  // NfseNt004
}
```

`layout` no DTO é um campo **sintético**: nunca é serializado. O parser é leniente — um campo inesperado para o layout detectado é ignorado com um `warn` (`nfse.parse.unexpected_field`), não lançado. Métodos de leitura devolvem a união `NFSe`, independentemente do `layout` do cliente.

## Tipos

Tipos cujo `TCxxx` não mudou entre os bundles mantêm o nome (`InfoPrestador`, `Serv`, `RtcInfoDest`, …). Os que mudaram têm sufixo: `InfDPSNt004`/`InfDPSNt009`, `InfoValoresNt004`/`InfoValoresNt009`, `RtcInfoIbsCbsNt004`/`…Nt009`, `InfNFSeNt004`/`…Nt009`. `DPS = DpsNt004 | DpsNt009`, `NFSe = NfseNt004 | NfseNt009`; `DpsFor<L>` e `NfseFor<L>` resolvem o tipo por layout.

## Inputs de alto nível do `nt009`

`buildDps` e `emitir` aceitam, **só no `nt009`**, dois grupos declarativos (sem cálculo de tributo — o cálculo do IBS/CBS é do Sefin):

- `ajusteBC` (`AjusteBCInput`): ajuste da base de cálculo do ISSQN (percentual **ou** valor) e documentos de ajuste;
- `ibsCbs` (`IbsCbsInput`): classificação (`CST`, `cClassTrib`, crédito presumido, tributação regular, diferimento), destinatário, NFS-e referenciadas, imóvel (`ImovelInput`, `UnidadeImobiliariaInput`) e bens móveis (`BemMovelInput`).

```ts
const dps = buildDps({
  layout: 'nt009',
  emitente, serie: '1', nDPS: '42', servico, valores,
  ajusteBC: { issqn: { percentual: 10 } },
  ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' } },
});
```

`finNFSe` é preenchido com `'0'` (único valor do release 1). Regras de rejeição fechadas do Anexo I `20261020` (E0453, E0464, E0465, E0467, E0469, E0472) são checadas antes de montar a DPS.

## Para quem mantém a lib

Adicionar um novo layout segue a receita do `CLAUDE.md` (bundle em `schemas/<versão>-<id>/`, diff estrutural, tipos com sufixo só para o que mudou, regra de detecção, ruleset em `specs/ruleset/<id>/`, testes de round-trip, bump MINOR).
