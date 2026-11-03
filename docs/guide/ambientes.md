# Ambientes e endpoints

## Enum `Ambiente`

```typescript
import { Ambiente } from 'open-nfse';

Ambiente.ProducaoRestrita   // homologação oficial da Receita
Ambiente.Producao           // produção real — notas com valor fiscal
```

## `ambiente` e `layout` são independentes

O `NfseClient` exige os dois, sem default: `ambiente` escolhe os hosts; `layout` (`'nt004'` | `'nt009'`) escolhe o leiaute das DPS que o cliente emite.

```typescript
const cliente = new NfseClient({
  layout: 'nt004',                     // leiaute vigente em produção
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
});
```

Os hosts são os mesmos para os dois leiautes. O `nt009` está em Produção Restrita desde 20/10/2026 e entra em produção em 01/12/2026 (o `nt004` vale até 30/11/2026) — valide o `nt009` em `ProducaoRestrita` antes da virada. Detalhes em [Leiautes](./layouts.md).

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
| `fetchDpsStatus` / `existsDpsStatus`   | GET / HEAD | `/dps/{idDps}`                                            | SEFIN                       |
| `emitir`, `emitirDpsPronta`, `emitirEmLote`, `substituir` | POST | `/nfse`                                    | SEFIN                       |
| `cancelar`                             | POST   | `/nfse/{chaveAcesso}/eventos`                                 | SEFIN                       |
| `replayPendingEvents`                  | POST   | `/nfse` (emissões) e `/nfse/{chaveAcesso}/eventos` (eventos)  | SEFIN                       |
| `replayPendingEvents` (reconciliação)  | GET    | `/dps/{idDps}`, depois `/nfse/{chaveAcesso}`                  | SEFIN                       |
| `fetchByNsu`                           | GET    | `/DFe/{NSU}`                                                  | ADN Contribuintes           |
| `consultarDanfse`, `gerarDanfse` (`'online'`/`'auto'`, deprecated) | GET | `/{chaveAcesso}`                      | ADN DANFSe                  |
| `consultarAliquota`                    | GET    | `/{codMunicipio}/{codServico}/{competencia}/aliquota`         | ADN Parâmetros Municipais   |
| `consultarHistoricoAliquotas`          | GET    | `/{codMunicipio}/{codServico}/historicoaliquotas`             | ADN Parâmetros Municipais   |
| `consultarBeneficio`                   | GET    | `/{codMunicipio}/{numeroBeneficio}/{competencia}/beneficio`   | ADN Parâmetros Municipais   |
| `consultarConvenio`                    | GET    | `/{codMunicipio}/convenio`                                    | ADN Parâmetros Municipais   |
| `consultarRegimesEspeciais`            | GET    | `/{codMunicipio}/{codServico}/{competencia}/regimes_especiais` | ADN Parâmetros Municipais  |
| `consultarRetencoes`                   | GET    | `/{codMunicipio}/{competencia}/retencoes`                     | ADN Parâmetros Municipais   |

`substituir` emite a DPS substituta (com `infDPS.subst`) no `POST /nfse`; o evento 105102 é gerado pelo Sistema Nacional. A reconciliação do replay roda quando o re-POST de uma emissão é rejeitado de forma permanente (E0014, ou E1235 depois da virada de leiaute) — veja [Integração](./integracao.md#cron-de-retry).

## `TipoAmbiente` — o enum do resultado

Separado do `Ambiente` (que é a *escolha* de endpoint). `TipoAmbiente` é o que **a Receita retorna** nos resultados:

```typescript
import { TipoAmbiente } from 'open-nfse';

TipoAmbiente.Producao     // 'PRODUCAO'
TipoAmbiente.Homologacao  // 'HOMOLOGACAO'

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
  layout: 'nt004',
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
  layout: 'nt004',
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
3. ✅ Fechou ciclo completo em Produção Restrita **no `layout` que vai usar em produção**: emitir → consultar → cancelar → substituir → distribuição por NSU.
4. ✅ Schema SQL de [integração](./integracao.md) implementado e testado.
5. ✅ Cron de `replayPendingEvents` rodando (emissões e eventos pendentes, com reconciliação via `GET /dps/{id}`). Nota **autorizada** com resposta ilegível — `UnreadableAuthorizedNfseError` (lançado por `emitir`/`emitirDpsPronta`/`substituir`), `success_unreadable` (`emitirEmLote`) e `success_emission_unreadable` (replay) — é persistida pela chave do erro, nunca reemitida.
6. ✅ Plano para a virada de leiaute de 01/12/2026: [drenar o `RetryStore`](./migracao-0.12.md#virada-retrystore) com o cliente `nt004` antes de criar o cliente `nt009`.
7. ✅ Monitoramento: taxa de rejeição por código, latência, alerta de expiração de certificado.
8. ✅ Base legal LGPD documentada para retenção dos XMLs fiscais.
9. ✅ Base encriptada / acesso ao PFX limitado.

Só então troque `Ambiente.ProducaoRestrita` → `Ambiente.Producao`. **Cada emissão em produção é um documento fiscal oficial.**

::: tip `tpAmb` acompanha o `ambiente`
Em `emitir` e `cancelar`, o `tpAmb` omitido vem do `ambiente` (`Ambiente.Producao` → `'1'`). A exceção é a DPS montada à parte com `buildDps` (default `'2'`) para `emitirDpsPronta`/`emitirEmLote`/`substituir`: em produção passe `tpAmb: TipoAmbienteDps.Producao`, senão a Receita rejeita com E0006. Veja [Emitir — Setup](./emitir.md#setup).
:::
