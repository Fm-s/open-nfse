# Leiautes: `nt004` e `nt009`

A NFS-e Padrão Nacional passa por uma troca de leiaute em **01/12/2026** (NT 009/2026). Como NFS-e e DPS nos dois formatos convivem por muito tempo, a lib suporta **dois leiautes ao mesmo tempo**, identificados por `Layout`:

| `layout`  | O que é | Bundle XSD | Pasta |
|-----------|---------|------------|-------|
| `'nt004'` | Leiaute vigente em produção: NT 004 v2.0 + `tpRetPisCofins` (NT 007) + CNPJ alfanumérico | `20260727` | `schemas/1.01/` |
| `'nt009'` | NT 009 release 1 (`vAjusteBC` no lugar de `vDedRed`/`gReeRepRes`, `finNFSe` na raiz da DPS, CST/cClassTrib reposicionados, imóvel reestruturado, bens móveis) | `esquemas_prod_restrita_20261020` | `schemas/1.01-nt009/` |

Os dois serializam `versao="1.01"`; o que os distingue é a estrutura do XML. `LAYOUTS` exporta a lista (`readonly ['nt004', 'nt009']`).

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

O cliente é genérico no layout (`NfseClient<'nt004'>`), e a emissão é tipada por ele. Em `emitirDpsPronta`/`emitirEmLote`/`substituir`, uma DPS de outro layout não compila (o `layout` do DTO discrimina); em `emitir`, o compilador barra os inputs do `nt009` (`ajusteBC`, `ibsCbs`) num cliente `nt004` — em literais e em objetos já tipados como `EmitirParams<'nt009'>` (no `nt004` esses campos são `never`); em runtime (JS ou cast), eles lançam `LayoutMismatchError` (com `field`). Para JS puro (ou casts), a checagem acontece em runtime: valor fora de `LAYOUTS` lança `InvalidLayoutError`; uma DPS de outro layout lança `LayoutMismatchError` **antes** de consumir o contador, assinar ou fazer qualquer I/O (`emitirEmLote` valida o lote inteiro antes do primeiro item).

Funções livres seguem a mesma regra: as que recebem DTO leem `dps.layout`; as que recebem XML cru exigem `{ layout }`:

```ts
const dps = buildDps({ layout: 'nt009', /* ... */ });   // DpsFor<'nt009'>
await validateDpsXml(xml, { layout: 'nt009' });
await validatePedRegEventoXml(xml, { layout: 'nt009' });
await validateEventoXml(xml, { layout: 'nt009' });
```

## Virada em 01/12/2026

Na virada, **crie um novo cliente** com `layout: 'nt009'` (o `layout` não muda em um cliente existente). Antes, valide o fluxo em Produção Restrita, onde o `nt009` já está disponível.

Atenção às emissões pendentes: o `RetryStore` guarda o XML já assinado e o replay o reenvia como está — a lib não converte entre layouts. Segundo a CGNFS-e, o leiaute atual vale **até 30/11/2026**, e no `nt009` `infDPS/finNFSe` é obrigatório; uma DPS `nt004` reenviada depois da virada deve ser rejeitada por schema (E1235). Nesse caso o replay consulta `GET /dps/{idDps}` antes de apagar a entrada: se a DPS já tinha virado NFS-e (timeout depois do commit), o item volta como `success_emission` com `reconciledFrom`; se não (404), vira `failed_permanent` e a emissão precisa ser refeita no `nt009`, com novo `nDPS`; qualquer outra falha da consulta mantém a entrada (`still_pending`). `PendingEvent.layout?` registra o layout de origem; uma emissão de outro layout que o do cliente gera `warn` `nfse.replay.layout_divergente`. **Drene o `RetryStore` com o cliente `nt004` antes de trocar** — o roteiro está em [Migração 0.11 → 0.12](./migracao-0.12#virada-retrystore). Eventos pendentes (cancelamento) não são afetados: o leiaute de evento não muda no release 1 (Anexo II 20261020).

## Leitura: os dois leiautes, sem perda

NFS-e emitidas no leiaute antigo continuam chegando por `fetchByChave`/`fetchByNsu` depois de 01/12. O parser **detecta o layout** pelo elemento `infDPS/finNFSe` (filho direto de `infDPS`; obrigatório no `nt009`, inexistente no `nt004`) e devolve o DTO correspondente, com todos os campos acessíveis. A NFS-e herda o layout da DPS que ela embute:

```ts
import { parseNfseXml } from 'open-nfse';

const nfse = parseNfseXml(xml, { logger });
if (nfse.layout === 'nt009') {
  nfse.infNFSe.DPS.infDPS.finNFSe;      // NfseNt009
} else {
  nfse.infNFSe.DPS.infDPS.valores.vDedRed;  // NfseNt004
}
```

`layout` no DTO é um campo **sintético**: nunca é serializado. O parser é leniente e sem perdas — um campo exclusivo do outro layout é ignorado com um `warn` (`nfse.parse.unexpected_field`), não lançado; um valor que o XSD do layout aceita, mas que o Anexo I sempre rejeita (nt009: `cMotivoEmisTI` 2–4 pela E0031, `chNFSeRej` pela E0034), é **mantido** no DTO com um `warn` `nfse.parse.rule_violation` (`{ layout, field, path, value, rule }`). A emissão continua barrando esses valores (`RuleViolationError`). Métodos de leitura devolvem a união `NFSe`, independentemente do `layout` do cliente.

## Tipos

A regra de nomes:

- **Igual nos dois XSDs → nome sem sufixo** (`InfoPrestador`, `Serv`, `RtcInfoDest`, `TribMunicipal`, …).
- **Mudou entre os bundles → um tipo por layout**: `InfDPSNt004`/`InfDPSNt009`, `InfoValoresNt004`/`InfoValoresNt009`, `RtcInfoIbsCbsNt004`/`…Nt009`, `InfNFSeNt004`/`…Nt009`, `ValoresNFSeNt004`/`…Nt009`, entre outros.
- **Só existe em um layout → sufixo desse layout**: `InfoDedRedNt004`, `RtcInfoReeRepResNt004` e os enums `TipoDedRedNt004`/`TipoReembolsoRepasseNt004` (grupos que o `nt009` removeu); `InfoAjusteBCNt009`, `AjusteBCIssqnNt009`, `RtcInfoBensMoveisNt009`, `RtcLocacaoImovelNt009`, os enums `TipoAjusteBCNt009`/`TipoAjusteBCLocImoveisNt009` e os inputs do `buildDps` (`AjusteBCInputNt009`, `IbsCbsInputNt009`, …).

Não há alias sem sufixo para nenhum tipo que mudou. A lista completa de renomeações está na [migração](./migracao-0.12#tipos-renomeados).

`DPS = DpsNt004 | DpsNt009` e `NFSe = NfseNt004 | NfseNt009` são uniões discriminadas pelo `layout`; `DpsFor<L>` e `NfseFor<L>` resolvem o membro de um layout (`BuildDpsParamsFor<L>`, idem para os parâmetros do `buildDps`). Os tipos da emissão são genéricos no layout e, sem argumento, viram a união: `EmitirParams<L>`, `EmitirResult<L>`, `NfseEmitResult<L>`, `EmitLoteItem<L>`/`EmitLoteResult<L>`, `SubstituirParams<L>`/`SubstituirResult<L>`. Num `NfseClient<'nt009'>` (ou `NfseClientFake<'nt009'>`/`NfseClientLike<'nt009'>`), a NFS-e devolvida pela emissão já vem tipada como `NfseNt009`. O `ReplayItem` continua com a união, porque o `RetryStore` pode guardar pendentes de outro layout.

## Inputs de alto nível do `nt009`

`buildDps` e `emitir` aceitam, **só no `nt009`**, dois grupos declarativos (sem cálculo de tributo — o cálculo do IBS/CBS é do Sefin):

- `ajusteBC` (`AjusteBCInputNt009`): ajuste da base de cálculo do ISSQN (percentual **ou** valor) e documentos de ajuste (`DocumentoAjusteBCInputNt009`, tipo `TipoAjusteBCNt009`);
- `ibsCbs` (`IbsCbsInputNt009`): classificação (`ClassificacaoIbsCbsInputNt009`: `CST`, `cClassTrib`, crédito presumido, tributação regular, diferimento), destinatário (`DestinatarioInputNt009` — sem `inscricaoMunicipal`, que não existe em `TCRTCInfoDest`), NFS-e referenciadas, imóvel (`ImovelInputNt009`, `UnidadeImobiliariaInputNt009`) e bens móveis (`BemMovelInputNt009`). `indDest` é derivado: com `destinatario`, destinatário distinto; sem ele, o tomador é o destinatário.

```ts
import { buildDps, OpcaoSimplesNacional, RegimeEspecialTributacao } from 'open-nfse';

const dps = buildDps({
  layout: 'nt009',
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    // Ajuste da BC do ISSQN por percentual/valor: Não Optante (ou ME/EPP fora do SN), sem regime especial.
    regime: {
      opSimpNac: OpcaoSimplesNacional.NaoOptante,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  nDPS: '42',
  // cNBS é obrigatório quando o grupo IBSCBS vai na DPS (E0322); 01.01 → NBS 1.1502.10.00 (Anexo VIII).
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Desenvolvimento de sistemas' },
  valores: { vServ: 1500, pTotTrib: { pTotTribFed: 13.45, pTotTribEst: 0, pTotTribMun: 5 } },
  tomador: {
    documento: { CNPJ: '11222333000181' },
    nome: 'Acme Ltda',
    endereco: {
      codMunicipio: '3550308', cep: '01310100',
      logradouro: 'Avenida Paulista', numero: '1578', bairro: 'Bela Vista',
    },
  },
  ajusteBC: { issqn: { percentual: 10 } },
  // 01.01 → cClassTrib 000001 e cIndOp 100301 (domicílio do adquirente = tomador), Anexo VIII.
  ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' }, cIndOp: '100301' },
});
```

`finNFSe` é preenchido com `'0'` (único valor do release 1). As regras de rejeição **fechadas** do Anexo I `20261020` — as que dependem só dos inputs — são checadas antes de montar a DPS e lançam `RuleViolationError` com o código da regra — entre elas E0313 (MEI sem `cTribMun`), as do ajuste de BC (E0435/E0436/E0445, E0453, E0462–E0465, E0467, E0469, E0470, E0472, E0476, E0479, E0492) e as do grupo IBS/CBS (E0903, E0905/E0906, E0936/E0937, E0939, E0940, E0949, E0959, E0963, E0966/E0967, E0970, E0974). As que dependem de cadastro, parametrização municipal ou da calculadora do IBS/CBS ficam com a SEFIN. A E0855 (IBS/CBS obrigatório para competência a partir de 01/10/2026) também não é checada: pela orientação do CGNFS-e de 07/08/2026, a omissão do grupo não rejeita a nota até 31/12/2026 (reafirmada em 29/10/2026, sem citar prazo final), e por isso as obrigatoriedades por serviço abaixo (E0937, E0963) só valem quando `ibsCbs` é informado. Pontos que mudam o uso:

- **`servico.cNBS` é obrigatório com `ibsCbs`** (E0322).
- **Todo `cTribNac` 99.XX.XX exige `valores.tribISSQN: TipoTribISSQN.NaoIncidencia`** (`'4'`, E0532) — inclusive locação 99.03 e bens móveis 99.04.01; o default (`OperacaoTributavel`, `'1'`) lança.
- **Locação (99.03):** com `ibsCbs`, `ibsCbs.imovel.locacao` é obrigatório (E0937) e só é aceito nesse subitem (E0936). `vDescIncond`/`vDescCond` da DPS são derivados de `pCopropriedade × vDescIncondTot`/`vDescCondTot` (E0434/E0443; `pCopropriedade` em percentual, resultado em 2 casas com meio centavo para cima); desconto derivado zero não é emitido, e um derivado `>= vServ` lança (E0431/E0432). Fora da locação, `buildDps` não emite descontos. `vServ` deve ser `pCopropriedade × vTotOper`, com `vTotOper` = valor total da operação, não a parte do coproprietário — conferido pelo `buildDps` (E0433), que aceita o produto truncado ou arredondado para cima em centavos, já que o Anexo I não fixa o arredondamento.
- **Bens móveis (99.04.01):** com `ibsCbs`, `ibsCbs.bensMoveis` é obrigatório (E0963) e só é aceito nesse código (E0967), com `quantidade > 0` (E0974).

O ajuste de BC do ISSQN também tem regras de **contexto**. As que dependem do município de incidência — situação do convênio, parametrização do código de serviço, alíquota efetiva — só o Sefin consegue aplicar e **não** são checadas localmente: E0447 (alíquota efetiva abaixo de 2%), E0449/E0450 (convênio/parametrização, prestador fora do SN) e E0451/E0452/E0455 (ME/EPP com apuração pelo SN, admitido só em alguns subitens). Valem ainda as restrições de regime e de tributação: ISSQN não tributável (E0435), MEI (E0436), regime especial ≠ 0 (E0445) — essas três checadas localmente — e benefício municipal de isenção (E0448, só na SEFIN). Por isso o exemplo usa um prestador Não Optante: para um ME/EPP com `regApTribSN = 1` e `cTribNac` 01.01.01, qualquer ajuste por percentual/valor é rejeitado, com convênio ativo (E0455) ou não (E0452).

## Para quem mantém a lib

Adicionar um novo layout segue a receita do `CLAUDE.md` (bundle em `schemas/<versão>-<id>/`, diff estrutural, tipos com sufixo para o que mudou ou só existe no layout novo, regra de detecção, ruleset em `specs/ruleset/<id>/`, testes de round-trip, bump MINOR).
