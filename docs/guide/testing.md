# Testando com `NfseClientFake`

A partir de v0.6, `open-nfse/testing` expõe um **dublê em memória** do `NfseClient` para você testar seu serviço sem abrir conexão com o SEFIN/ADN.

```ts
import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing';
```

## Por que dois pontos de import?

`open-nfse/testing` é um **subpath export** separado. Isso significa:

- A lib principal (`open-nfse`) não arrasta o código do fake para produção — tree-shaking nativo.
- O fake só é carregado em test runners.
- As duas classes são **estruturalmente compatíveis**: `NfseClientLike<L = Layout> = NfseClient<L> | NfseClientFake<L>` — sem argumento aceita cliente de qualquer layout.

Como no real, `layout` é **obrigatório** no construtor (`new NfseClientFake({ layout: 'nt004' })`; sem ele, ou com valor desconhecido, lança `InvalidLayoutError`) e fica exposto em `fake.layout`. `ambiente` é opcional (default `TipoAmbiente.Homologacao`).

## Tipando suas dependências

Nos pontos onde seu serviço recebe o cliente, tipe como `NfseClientLike<L>`, com o layout que o serviço emite:

```ts
import type { NfseClientLike } from 'open-nfse/testing';

export class PedidoService {
  constructor(private readonly nfse: NfseClientLike<'nt004'>) {}

  async criar(pedido: Pedido) {
    return this.nfse.emitir({ ... }); // só aceita params do nt004
  }
}

// em prod:
new PedidoService(new NfseClient({ layout: 'nt004', ambiente, certificado }));

// em teste:
new PedidoService(new NfseClientFake({ layout: 'nt004' }));
```

Com o layout no tipo, um campo exclusivo do outro layout (ex.: `ibsCbs`/`ajusteBC` do `nt009` num serviço `nt004`) é erro de compilação, e um cliente de outro layout não pode ser injetado. Os resultados também saem estreitados nos dois clientes: em `NfseClientLike<'nt009'>`, `emitir`/`emitirDpsPronta`/`emitirEmLote`/`substituir` devolvem `NfseNt009`. Use `NfseClientLike` sem argumento só em serviços que apenas leem (`fetchByChave`, `fetchByNsu`, …): nele, `emitir` aceita os params dos dois layouts e o erro só aparece em runtime (`LayoutMismatchError`).

## API de seed — pré-populando estado

```ts
const fake = new NfseClientFake({ layout: 'nt004', ambiente: TipoAmbiente.Homologacao });

// Uma NFS-e que `fetchByChave(chave)` deve retornar:
fake.seed.nfse('21113...', mockNfseEmitResult);

// Documentos que `fetchByNsu` deve retornar:
fake.seed.dfe([
  { nsu: 10, chaveAcesso: '...', tipoDocumento: TipoDocumento.Nfse, /* ... */ },
  { nsu: 11, chaveAcesso: '...', /* ... */ },
]);

// Parâmetros municipais seedados:
fake.seed.aliquota('2111300', '250101', '2026-03-01', {
  aliquotas: {
    '250101': [{ incidencia: 'Local', aliquota: 2.5, dataInicioVigencia: new Date('2026-01-01') }],
  },
});
fake.seed.historicoAliquotas('2111300', '250101', { aliquotas: { '250101': [/* ... */] } });

fake.seed.beneficio('2111300', 'B42', '2026-03-01', { beneficio: { ... } });
fake.seed.convenio('2111300', { parametrosConvenio: { ... } });
fake.seed.regimesEspeciais('2111300', '250101', '2026-03-01', { regimesEspeciais: { ... } });
fake.seed.retencoes('2111300', '2026-03-01', { retencoes: { ... } });
```

## Simulando falhas

```ts
// Próxima emissão lança ReceitaRejectionError:
fake.failNextEmit({
  kind: 'rejection',
  codigo: 'E0082',
  descricao: 'CNPJ do emitente prestador não encontrado no cadastro CNPJ na data de competência.',
});

// Próximo emitir/substituir retorna { status: 'retry_pending' } (a original
// de substituir fica intacta); emitirDpsPronta lança TimeoutError e emitirEmLote
// devolve o item com status 'failure' (TimeoutError em error), como no real
// (sem caminho transiente):
fake.failNextEmit({ kind: 'transient', message: 'simulated timeout' });

// Mesmo para cancelar:
fake.failNextCancel({
  kind: 'rejection',
  codigo: 'E0822',
  descricao: 'O prazo para o cancelamento da NFS-e expirou, conforme parametrização do município emissor da NFS-e.',
});
```

A falha simula a resposta do POST e é **consumida na próxima chamada que chegaria à rede** — se você programar uma e o teste não acionar a chamada esperada, a próxima chamada futura pegaria a falha. Use `reset()` entre testes.

Como no cliente real, as validações offline rodam **antes** da falha programada — o fake chama as mesmas funções do real (`buildDps`, `validarCancelamento`, `buildCancelamentoXml`, `prepararSubstituicao`, a validação de CPF/CNPJ), não cópias. Params inválidos lançam o erro de validação e a falha continua programada:

- `emitir`: layout dos params (`LayoutMismatchError`) e todos os guards do `buildDps` — regras do Anexo I do layout (`RuleViolationError` com `err.rule`, ex.: as de `ajusteBC`/`ibsCbs` no `nt009`) e DV de CPF/CNPJ (ver [Validações](./validacoes#regras-do-anexo-i)).
- `emitirDpsPronta` / `emitirEmLote` / `substituir`: DPS de outro layout ou com campo do outro layout (`LayoutMismatchError`; `emitirEmLote` checa o lote inteiro antes), E0031/E0034 numa DPS `nt009` e DV de CPF/CNPJ (respeitando `skipCpfCnpjValidation`).
- `cancelar`: `xMotivo` obrigatório com `cMotivo` 9 e dentro de `TSMotivo`, chave/`verAplic` do pedido.
- `substituir`: E0078, `TSMotivo`, `TSChaveNFSe`, E0042, `infDPS.subst` divergente dos params e `InvalidDpsIdError`.

O `dryRun` também não consome a falha.

## Introspecção — verificando o que foi feito

```ts
await service.emitirNota(pedido);

expect(fake.emittedChaves).toHaveLength(1);
expect(fake.cancelledChaves).toEqual([]);
expect(fake.eventosRegistrados).toHaveLength(0);

await service.cancelarNota(chave, 'Erro na emissão');
expect(fake.cancelledChaves).toContain(chave);
expect(fake.eventosRegistrados[0]?.evento.infEvento.Id).toMatch(/^EVT/);
```

Visões expostas:

| Getter                | Retorna                                      |
|-----------------------|----------------------------------------------|
| `emittedChaves`       | `readonly string[]` — chaves emitidas/seedadas |
| `cancelledChaves`     | `readonly string[]` — chaves canceladas        |
| `substituidas`        | `ReadonlyMap<original, nova>`                  |
| `eventosRegistrados`  | `readonly EventoResult[]`                      |

## `reset()`

Limpa todo o estado — seeds + failures + emissões registradas. Chame em `beforeEach` para isolar testes:

```ts
describe('PedidoService', () => {
  const fake = new NfseClientFake({ layout: 'nt004' });
  const service = new PedidoService(fake);

  beforeEach(() => fake.reset());

  it('cancela nota em caso de erro de pagamento', async () => { ... });
  it('emite nota segmentada quando há múltiplos itens', async () => { ... });
});
```

## Exemplo — teste end-to-end

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NfseClientFake } from 'open-nfse/testing';
import { PedidoService } from '../src/pedido-service.js';

describe('PedidoService', () => {
  let fake: NfseClientFake<'nt004'>;
  let service: PedidoService;

  beforeEach(() => {
    fake = new NfseClientFake({ layout: 'nt004' });
    service = new PedidoService(fake);
  });

  it('emite nota e guarda a chave no pedido', async () => {
    const pedido = { id: 1, valor: 100, cliente: { cnpj: '...' } };
    const resultado = await service.emitirNota(pedido);
    // regra de formação (TSIdNFSe sem "NFS"): inscrição nas posições 10–23
    expect(resultado.chaveAcesso).toMatch(/^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$/);
    expect(fake.emittedChaves).toHaveLength(1);
  });

  it('marca pedido como rejeitado quando a Receita recusa o emitente', async () => {
    fake.failNextEmit({
      kind: 'rejection',
      codigo: 'E0082',
      descricao: 'CNPJ do emitente prestador não encontrado no cadastro CNPJ na data de competência.',
    });
    await expect(service.emitirNota({ id: 1, /* ... */ }))
      .rejects.toMatchObject({ name: 'ReceitaRejectionError', codigo: 'E0082' });
  });

  it('retorna retry_pending e salva para replay quando há timeout', async () => {
    fake.failNextEmit({ kind: 'transient', message: 'mock timeout' });
    const r = await fake.emitir({ /* params */ });
    expect(r.status).toBe('retry_pending');
  });
});
```

## A NFS-e sintetizada

`emitir`/`emitirDpsPronta`/`substituir` devolvem uma NFS-e montada por `synthNfse(dps, chaveAcesso, ambiente)` (também exportado em `open-nfse/testing`) a partir da DPS. Ela preserva o layout da DPS (`nfse.layout`), e nos resultados o tipo vem estreitado pelo layout do fake (`NfseClientFake<'nt009'>` → `NfseNt009`).

A chave vem de `synthChaveAcesso(sequential, cnpj, idDps?)` (também exportado). Com `idDps`, segue a regra de formação de `TSIdNFSe`: Cód.Mun., Tipo de Inscrição e Inscrição copiados do `infDPS.Id` + Amb.Ger. `2` + nNFSe (13) + AAMM + Cód.Num. (9) + DV **fictício** (o algoritmo do DV não está nas fontes oficiais) — por isso uma nota do fake passa na correspondência da E0042 ao ser substituída. Sem `idDps`, gera o formato legado das versões anteriores.

O grupo `infNFSe.valores` segue as fórmulas do Anexo I: `vCalcDR` (`nt004`) / `vCalcAjusteBCISSQN` (`nt009`) a partir do ajuste da BC informado, `vBC`, `vISSQN = vBC × pAliq`, `vTotalRet` e `vLiq` (ISSQN, PIS e COFINS só são subtraídos quando retidos). Em `substituir`, a DPS embutida carrega `infDPS.subst` com a chave original. No `nt009`, DPS com `IBSCBS` gera `infNFSe.IBSCBS.totCIBS.vTotNF = vLiq` (regra de 2026).

O fake não conhece parâmetros municipais nem alíquotas de IBS/CBS: usa a alíquota de ISSQN informada na DPS (`aliqIss`), não sintetiza `tpBM`, `cLocIncid` nem os valores de IBS/CBS (`gIBS`, `gCBS`), e não soma IBS/CBS a `vTotNF` (regra a partir de 2027). Não use o fake para validar cálculos que dependem desses parâmetros.

## O que o fake NÃO faz

- **Não valida o XML contra o XSD nem consulta CEP** — só os guards offline listados em [Simulando falhas](#simulando-falhas).
- **Não valida assinatura XMLDSig** — a NFS-e sintetizada traz uma `Signature` com valores `FAKE_*`. Se seu código verifica a signature, faça mock também.
- **Não executa o `replayPendingEvents` completo** — a função existe mas retorna `[]`. Se quiser testar replay, use um `RetryStore` de verdade + `NfseClient` com `MockAgent`.
- **Não persiste pendentes em `failNextCancel({kind:'transient'})`** — cancelamento transiente joga `TimeoutError` direto. Emissão transiente (`emitir`, `substituir`) retorna `retry_pending` com um `PendingEmission` no formato do real (com `layout`, `idDps`, `nDPS`), mas XML fictício e sem tocar em nenhum `RetryStore`.
- **Não simula nota autorizada com resposta ilegível** — `failNextEmit` só programa `rejection` ou `transient`; `UnreadableAuthorizedNfseError` e o status `success_unreadable` do `emitirEmLote` não saem do fake. Para testar esse caminho, use o `NfseClient` com `MockAgent`.
- **Não acessa o ADN para DANFSe** — `gerarDanfse` sempre renderiza localmente (qualquer `strategy`) e `consultarDanfse` devolve o PDF local da nota seedada/emitida (ou um PDF mínimo com a chave).

Esses limites são deliberados — o fake é para testar **o código do consumidor**, não o fluxo de retry interno da lib.
