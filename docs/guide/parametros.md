# Parâmetros municipais

A API `/parametrizacao` do ADN expõe, para cada município aderente, os dados fiscais parametrizados: alíquotas de ISSQN, benefícios, regimes especiais, retenções, status do convênio. A partir de **v0.5** o `NfseClient` tem 6 métodos `consultar*` que envelopam esses endpoints com:

- **Cache pluggable** (default in-memory com TTLs sensatos).
- **PascalCase → camelCase** normalizado (o wire do ADN é inconsistente).
- **Dates → `Date`**, enums integer → string (alinhado ao resto da lib).
- **400/404 com body não são erro** — retornam o resultado com `mensagem` populada.

São consultas de cadastro: não dependem do leiaute da DPS e funcionam igual num cliente `nt004` ou `nt009` (o `layout` continua obrigatório no `NfseClient`, mas não muda nada aqui).

## Métodos

### `consultarAliquota(codMunicipio, codServico, competencia)`

Alíquota de ISSQN parametrizada para o trio município + serviço + competência.

```typescript
const r = await cliente.consultarAliquota('2111300', '250101', '2026-03-01');

// r.aliquotas é um Record<codServico, Aliquota[]>
for (const aliq of r.aliquotas['250101'] ?? []) {
  console.log(aliq.incidencia, aliq.aliquota, aliq.dataInicioVigencia);
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

// estrutura aninhada: regime → variante → RegimeEspecial[], com as chaves que o ADN devolve
// (nomes abaixo ilustrativos — o contrato do ADN só tipa o mapa)
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

const cliente = new NfseClient({ layout: 'nt004', ..., parametrosCache: redisCache });
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

Os demais casos lançam `HttpError`: 401/403 (certificado), 429 (`TooManyRequestsError`), 5xx (instabilidade), timeout, falha de rede ou outro status fora de 2xx/400/404 (`HttpStatusError`).

## Exemplo — estimar o ISS antes de emitir

Para mostrar o ISS devido de uma nota antes de emiti-la:

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

const vServ = 1500;
const aliq = await aliquotaDevida(cliente, '2111300', '250101', new Date());
// estimativa sobre vServ (sem descontos/ajustes de BC), arredondada ao centavo
const issEstimado = aliq === undefined ? undefined : Math.round(vServ * aliq) / 100;
```

::: warning Não copie a alíquota consultada para `valores.aliqIss`
A alíquota parametrizada é a que o Sefin aplica quando o convênio do município de incidência está ativo — e, nesse cenário, informar `pAliq` na DPS é **rejeitado** para prestador Não Optante (E0617) e para ME/EPP com apuração fora do Simples (E0635). Fora do convênio ativo, `pAliq` é obrigatório para Não Optante sem regime especial (E0619) e para ME/EPP com apuração fora do Simples (E0640). Para ME/EPP com apuração pelo Simples, depende da retenção do ISSQN, com convênio ativo (E0621/E0625) ou não (E0628/E0631). Com convênio ativo e prestador Não Optante, omita `aliqIss` (o default): o Sefin aplica a alíquota parametrizada e calcula `vISSQN`.
:::

## Avisos de cache

Alguns estados são **voláteis** e merecem TTL curto (ou bypass do cache) quando o município não está em operação normal:

- **O convênio do município pode deixar de estar ativo.** A DPS é rejeitada quando o município emissor não existe (E0037) ou não está "ATIVO" (E0038) no cadastro de convênio (exceto emitente MEI). Se sua aplicação decide onde/como emitir a partir de `consultarConvenio`, use `useCache: false` ou um TTL < 1 h para decisões sensíveis.
- **Inscrição Municipal pode ficar inativa a qualquer momento.** E0119 (IM não autorizada a emitir na data de processamento) e a rejeição de IM inativa no CNC na competência (E0124 no `nt004`, E0125 no `nt009`) dependem do cadastro do município, que esta API não expõe — não trate parâmetros em cache como garantia de que a IM está apta.
- **Convênio do município com a Sefin Nacional muda raramente** mas também não é imutável — o default de 24 h para `consultarConvenio` está calibrado pra isso.

Se você precisar invalidar cache manualmente (e.g., após uma rejeição E0038), passe `useCache: false` na próxima chamada ou destrua o cache externamente (`ParametrosCache.set` em impls próprias).
