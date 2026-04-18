# Parâmetros municipais

A API `/parametrizacao` do ADN expõe, para cada município aderente, os dados fiscais parametrizados: alíquotas de ISSQN, benefícios, regimes especiais, retenções, status do convênio. A partir de **v0.5** o `NfseClient` tem 6 métodos `consultar*` que envelopam esses endpoints com:

- **Cache pluggable** (default in-memory com TTLs sensatos).
- **PascalCase → camelCase** normalizado (o wire do ADN é inconsistente).
- **Dates → `Date`**, enums integer → string (alinhado ao resto da lib).
- **400/404 com body não são erro** — retornam o resultado com `mensagem` populada.

## Métodos

### `consultarAliquota(codMunicipio, codServico, competencia)`

Alíquota de ISSQN parametrizada para o trio município + serviço + competência.

```typescript
const r = await cliente.consultarAliquota('2111300', '250101', '2026-03-01');

// r.aliquotas é um Record<codServico, Aliquota[]>
for (const aliq of r.aliquotas['250101'] ?? []) {
  console.log(aliq.incidencia, aliq.aliquota, aliq.dataInicio);
}
```

TTL default: **6h**.

### `consultarHistoricoAliquotas(codMunicipio, codServico)`

Todas as alíquotas já parametrizadas para o serviço, do passado ao futuro.

```typescript
const { aliquotas } = await cliente.consultarHistoricoAliquotas('2111300', '250101');
```

TTL default: **24h** — histórico não muda.

### `consultarBeneficio(codMunicipio, numeroBeneficio, competencia)`

Detalhes de um benefício fiscal municipal (imunidade, redução de BC, alíquota diferenciada):

```typescript
const { beneficio } = await cliente.consultarBeneficio('2111300', 'B42', '2026-03-01');

console.log(beneficio?.descricao, beneficio?.tipoBeneficio);
console.log(beneficio?.servicos);       // linhas de serviço beneficiadas
console.log(beneficio?.contribuintes);  // inscrições restritas (se aplicável)
```

TTL default: **1h**.

### `consultarConvenio(codMunicipio)`

Status do convênio do município com a Sefin Nacional:

```typescript
const { parametrosConvenio } = await cliente.consultarConvenio('2111300');

parametrosConvenio?.tipoConvenio;                         // '1' = Pleno, '2' = Simplificado
parametrosConvenio?.aderenteAmbienteNacional;             // '0' | '1' | '-1'
parametrosConvenio?.situacaoEmissaoPadraoContribuintesRFB;
parametrosConvenio?.permiteAproveitamentoDeCreditos;
```

TTL default: **24h**.

### `consultarRegimesEspeciais(codMunicipio, codServico, competencia)`

Regimes especiais ativos (permitido, vedado, obrigatório) para cada combinação:

```typescript
const { regimesEspeciais } = await cliente.consultarRegimesEspeciais(
  '2111300',
  '250101',
  '2026-03-01',
);

// estrutura aninhada: regime → variante → RegimeEspecial[]
const simplesMeEpp = regimesEspeciais.SimplesNacional?.MeEpp?.[0];
simplesMeEpp?.situacao;   // '1' Permitido | '2' Vedado | '3' Obrigatório
```

TTL default: **12h**.

### `consultarRetencoes(codMunicipio, competencia)`

Configuração de retenções de ISSQN do município:

```typescript
const { retencoes } = await cliente.consultarRetencoes('2111300', '2026-03-01');

retencoes?.artigoSexto.habilitado;                    // retenção por art.6º LC 116
for (const rm of retencoes?.retencoesMunicipais ?? []) {
  rm.descricao;
  rm.tiposRetencao;                                   // ['1','2','3']
  rm.servicos;                                        // serviços alcançados
}
```

TTL default: **12h**.

## Cache pluggable

Interface:

```typescript
export interface ParametrosCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}
```

Default shipped: `createInMemoryParametrosCache()` (Map com TTL, por processo). Produção normalmente quer cache compartilhado — implemente contra Redis:

```typescript
import type { ParametrosCache } from 'open-nfse';

const redisCache: ParametrosCache = {
  async get(key) {
    const v = await redis.get(`nfse-param:${key}`);
    return v ? JSON.parse(v) : undefined;
  },
  async set(key, value, ttlMs) {
    await redis.set(`nfse-param:${key}`, JSON.stringify(value), 'PX', ttlMs);
  },
};

const cliente = new NfseClient({ ..., parametrosCache: redisCache });
```

## Opções por chamada

Cada `consultar*` aceita um objeto de opções:

```typescript
await cliente.consultarAliquota('2111300', '250101', new Date(), {
  useCache: false,      // força miss (bate direto no ADN)
  ttlMs: 60 * 60_000,   // override do TTL desta chamada
  cache: outra,         // cache específica (override do cliente)
});
```

## Erros vs dados ausentes

O ADN é peculiar: **400 e 404 retornam o mesmo shape** dos 200s, com o campo `mensagem` populado. A lib aceita esses statuses (`acceptedStatuses: [400, 404]`) e devolve o resultado com `mensagem` — **não lança**:

```typescript
const r = await cliente.consultarAliquota('9999999', 'xyz', '2026-03-01');
if (r.mensagem) {
  console.warn('Município ou serviço não encontrado:', r.mensagem);
  // r.aliquotas é {} aqui
}
```

`HttpError` sobe apenas em 401/403 (certificado), 5xx (instabilidade) ou timeout.

## Exemplo — alíquota aplicada

Para calcular o ISS devido de uma nota antes de emiti-la:

```typescript
async function aliquotaDevida(
  cliente: NfseClient,
  emitenteMunicipio: string,
  codServico: string,
  competencia: Date,
): Promise<number | undefined> {
  const { aliquotas } = await cliente.consultarAliquota(
    emitenteMunicipio,
    codServico,
    competencia,
  );
  // pega a primeira alíquota vigente (ADN devolve ativas para a competência)
  return aliquotas[codServico]?.[0]?.aliquota;
}

// emissão com alíquota auto-preenchida:
const aliq = await aliquotaDevida(cliente, '2111300', '250101', new Date());
await cliente.emitir({
  ...params,
  valores: { vServ: 1500, aliqIss: aliq ?? 0 },
});
```
