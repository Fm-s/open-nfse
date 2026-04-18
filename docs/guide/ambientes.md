# Ambientes e endpoints

## Enum `Ambiente`

```typescript
import { Ambiente } from 'open-nfse';

Ambiente.ProducaoRestrita   // homologação oficial da Receita
Ambiente.Producao           // produção real — notas com valor fiscal
```

## Hosts por ambiente

A API oficial está **dividida em hosts distintos**. O `NfseClient` resolve automaticamente qual host usar por endpoint:

| Serviço                      | ProducaoRestrita                                            | Producao                                |
|------------------------------|-------------------------------------------------------------|-----------------------------------------|
| **SEFIN Nacional**           | `sefin.producaorestrita.nfse.gov.br/SefinNacional`          | `sefin.nfse.gov.br/SefinNacional`       |
| **ADN Contribuintes**        | `adn.producaorestrita.nfse.gov.br/contribuintes`            | `adn.nfse.gov.br/contribuintes`         |
| **ADN DANFSe**               | `adn.producaorestrita.nfse.gov.br/danfse`                   | `adn.nfse.gov.br/danfse`                |
| **ADN Parâmetros Municipais**| `adn.producaorestrita.nfse.gov.br/parametrizacao`           | `adn.nfse.gov.br/parametrizacao`        |

::: warning Contratos diferentes por host
**SEFIN** usa camelCase + `tipoAmbiente: int`. **ADN** usa PascalCase + `TipoAmbiente: string`. Essa diferença é proposital e a lib normaliza tudo para o shape público tipado — você nunca vê essas inconsistências no seu código.
:::

## Endpoints usados hoje

| Operação                               | Método | Endpoint                                                      | Host                        |
|----------------------------------------|--------|---------------------------------------------------------------|-----------------------------|
| `fetchByChave`                         | GET    | `/nfse/{chaveAcesso}`                                         | SEFIN                       |
| `emitir`, `emitirDpsPronta`, `emitirEmLote` | POST | `/nfse`                                                  | SEFIN                       |
| `cancelar`, `substituir`, `replayPendingEvents` | POST | `/nfse/{chaveAcesso}/eventos`                        | SEFIN                       |
| `fetchByNsu`                           | GET    | `/DFe/{NSU}`                                                  | ADN Contribuintes           |
| `fetchDanfse`, `gerarDanfse` (online)  | GET    | `/{chaveAcesso}`                                              | ADN DANFSe                  |
| `consultarAliquota`, `consultarHistoricoAliquotas` | GET | `/aliquotas/...`                                   | ADN Parâmetros Municipais   |
| `consultarBeneficio`                   | GET    | `/beneficios/...`                                             | ADN Parâmetros Municipais   |
| `consultarConvenio`                    | GET    | `/convenios/{codMunicipio}`                                   | ADN Parâmetros Municipais   |
| `consultarRegimesEspeciais`            | GET    | `/regimesespeciais/...`                                       | ADN Parâmetros Municipais   |
| `consultarRetencoes`                   | GET    | `/retencoes/...`                                              | ADN Parâmetros Municipais   |

## `TipoAmbiente` — o enum do resultado

Separado do `Ambiente` (que é a *escolha* de endpoint). `TipoAmbiente` é o que **a Receita retorna** nos resultados:

```typescript
import { TipoAmbiente } from 'open-nfse';

TipoAmbiente.Producao     // '1'
TipoAmbiente.Homologacao  // '2'

const r = await cliente.fetchByChave(chave);
if (r.tipoAmbiente === TipoAmbiente.Producao) {
  // essa é uma nota com valor fiscal
}
```

## mTLS e HTTP/1.1

O SEFIN autentica via **mTLS** (mutual TLS) — o cliente apresenta seu certificado A1 na conexão. A lib constrói um `undici.Agent` com o certificado carregado e força **HTTP/1.1** (SEFIN rejeita HTTP/2 com `HTTP_1_1_REQUIRED` em paths autenticados):

```typescript
new Agent({
  allowH2: false,                      // desabilita HTTP/2
  connect: {
    key: cert.keyPem,
    cert: cert.certPem,
    ALPNProtocols: ['http/1.1'],       // recusa H2 já na negociação TLS
  },
});
```

::: tip Se esquecer `ALPNProtocols: ['http/1.1']`
A request trava silenciosamente — undici não surfaces o `HTTP_1_1_REQUIRED` como uma promise rejection. A lib já garante essa config; se você for construir um dispatcher customizado via `NfseClientConfig.dispatcher`, replique o mesmo padrão.
:::

## Timeout

Default 60s (`timeoutMs: 60_000`). Ajuste via config:

```typescript
new NfseClient({
  ambiente: Ambiente.Producao,
  certificado,
  timeoutMs: 120_000,   // 2 min — SEFIN pode ser lento em horário de pico
});
```

Timeouts viram `TimeoutError` (transiente) — seguros para retry.

## Dispatcher customizado (avançado)

Use só em testes ou setups exóticos. Ao passar um dispatcher:

- A lib **não fecha** ele em `close()` (você mantém o lifecycle)
- A lib **ainda carrega o certificado** (precisa para assinar a DPS)
- `MockAgent` do undici é o caso típico em testes

```typescript
import { MockAgent } from 'undici';

const mock = new MockAgent();
mock.disableNetConnect();

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dispatcher: mock,
});
```

## `AmbienteEndpoints` — acesso direto

Se precisar dos URLs (ex: um dashboard mostrando para qual host está apontando):

```typescript
import { AMBIENTE_ENDPOINTS, Ambiente } from 'open-nfse';

const endpoints = AMBIENTE_ENDPOINTS[Ambiente.Producao];
endpoints.sefin;                  // "https://sefin.nfse.gov.br/SefinNacional"
endpoints.adn;                    // "https://adn.nfse.gov.br/contribuintes"
endpoints.danfse;
endpoints.parametrosMunicipais;
```

## Checklist para passar de `ProducaoRestrita` para `Producao`

1. ✅ Certificado A1 **do CNPJ real** (o de produção, não o de testes).
2. ✅ CNPJ habilitado no Emissor Nacional com IM ativa no município aderente.
3. ✅ Fechou ciclo completo em Produção Restrita: emitir → consultar → cancelar → substituir → distribuição por NSU.
4. ✅ Schema SQL de [integração](./integracao) implementado e testado.
5. ✅ Retry/reconciliação cron rodando (em `replayPendingEvents` para eventos; em `fetchByChave` para emit `status = error`).
6. ✅ Monitoramento: taxa de rejeição por código, latência, alerta de expiração de certificado.
7. ✅ Base legal LGPD documentada para retenção dos XMLs fiscais.
8. ✅ Base encriptada / acesso ao PFX limitado.

Só então troque `Ambiente.ProducaoRestrita` → `Ambiente.Producao`. **Cada emissão em produção é um documento fiscal oficial.**
