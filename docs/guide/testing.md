# Testando com `NfseClientFake`

A partir de v0.6, `open-nfse/testing` expõe um **dublê em memória** do `NfseClient` para você testar seu serviço sem abrir conexão com o SEFIN/ADN.

```ts
import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing';
```

## Por que dois pontos de import?

`open-nfse/testing` é um **subpath export** separado. Isso significa:

- A lib principal (`open-nfse`) não arrasta o código do fake para produção — tree-shaking nativo.
- O fake só é carregado em test runners.
- As duas classes são **estruturalmente compatíveis**: `NfseClientLike = NfseClient | NfseClientFake`.

## Tipando suas dependências

Nos pontos onde seu serviço recebe o cliente, tipe como `NfseClientLike`:

```ts
import type { NfseClientLike } from 'open-nfse/testing';

export class PedidoService {
  constructor(private readonly nfse: NfseClientLike) {}

  async criar(pedido: Pedido) {
    return this.nfse.emitir({ ... });
  }
}

// em prod:
new PedidoService(new NfseClient({ ambiente, certificado }));

// em teste:
new PedidoService(new NfseClientFake());
```

## API de seed — pré-populando estado

```ts
const fake = new NfseClientFake({ ambiente: TipoAmbiente.Homologacao });

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
    '250101': [{ incidencia: 'Local', aliquota: 2.5, dataInicio: new Date('2026-01-01') }],
  },
});

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
  codigo: 'E401',
  descricao: 'CNPJ do emitente não autorizado',
});

// Próxima emissão retorna { status: 'retry_pending' }:
fake.failNextEmit({ kind: 'transient', message: 'simulated timeout' });

// Mesmo para cancelar:
fake.failNextCancel({ kind: 'rejection', codigo: 'E8001', descricao: 'Prazo expirado' });
```

A falha é **consumida na próxima chamada** — se você programar uma e o teste não acionar a chamada esperada, a próxima chamada futura pegaria a falha. Use `reset()` entre testes.

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
  const fake = new NfseClientFake();
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
  let fake: NfseClientFake;
  let service: PedidoService;

  beforeEach(() => {
    fake = new NfseClientFake();
    service = new PedidoService(fake);
  });

  it('emite nota e guarda a chave no pedido', async () => {
    const pedido = { id: 1, valor: 100, cliente: { cnpj: '...' } };
    const resultado = await service.emitirNota(pedido);
    expect(resultado.chaveAcesso).toMatch(/^\d{50}$/);
    expect(fake.emittedChaves).toHaveLength(1);
  });

  it('marca pedido como rejeitado quando CNPJ é inválido', async () => {
    fake.failNextEmit({
      kind: 'rejection',
      codigo: 'E401',
      descricao: 'CNPJ não autorizado',
    });
    await expect(service.emitirNota({ id: 1, /* ... */ }))
      .rejects.toMatchObject({ name: 'ReceitaRejectionError', codigo: 'E401' });
  });

  it('retorna retry_pending e salva para replay quando há timeout', async () => {
    fake.failNextEmit({ kind: 'transient', message: 'mock timeout' });
    const r = await fake.emitir({ /* params */ });
    expect(r.status).toBe('retry_pending');
  });
});
```

## O que o fake NÃO faz

- **Não valida assinatura XMLDSig** — a NFS-e sintetizada traz uma `Signature` com valores `FAKE_*`. Se seu código verifica a signature, faça mock também.
- **Não executa o `replayPendingEvents` completo** — a função existe mas retorna `[]`. Se quiser testar replay, use um `RetryStore` de verdade + `NfseClient` com `MockAgent`.
- **Não persiste pendentes em `failNextCancel({kind:'transient'})`** — cancelamento transiente joga `TimeoutError` direto. Emissão transiente retorna `retry_pending` com o pending objeto sintético, mas sem tocar no store real.

Esses limites são deliberados — o fake é para testar **o código do consumidor**, não o fluxo de retry interno da lib.
