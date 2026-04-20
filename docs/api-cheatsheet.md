# API cheat sheet

Assinaturas compactas de toda a superfície pública. Para parâmetros completos, tipos aninhados e JSDoc, clique em cada link para a [API completa (TypeDoc)](/api/).

## Cliente

### `NfseClient`

```ts
new NfseClient(config: NfseClientConfig): NfseClient
```

Todos os métodos abaixo retornam `Promise<T>`. Referência: [`NfseClient`](/api/classes/NfseClient).

#### Leitura
| Método                | Assinatura                                          | Lança                                                         |
|-----------------------|-----------------------------------------------------|---------------------------------------------------------------|
| `fetchByChave`        | `(chaveAcesso: string) → NfseQueryResult`           | `InvalidChaveAcessoError`, `NotFoundError`, `HttpError*`       |
| `fetchByNsu`          | `(params: FetchByNsuParams) → NsuQueryResult`       | `HttpError*` (404/400 **não** lançam — viram `status`)         |

#### Emissão
| Método                | Assinatura                                                                                         | Comportamento                                                  |
|-----------------------|----------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| `emitir`              | `(params: EmitirParams) → EmitirResult \| DpsDryRunResult`                                          | Counter após validação; transiente → `retry_pending`; permanente → throw |
| `emitirDpsPronta`     | `(dps: DPS, options?: EmitOptions) → NfseEmitResult \| DpsDryRunResult`                             | Escape hatch: sem counter, sem retry store, throw em tudo      |
| `emitirEmLote`        | `(dpsList: readonly DPS[], options?: EmitManyOptions) → EmitLoteResult`                             | Worker pool client-side; `stopOnError` opcional                |

#### Eventos
| Método                | Assinatura                                          | Comportamento                                                  |
|-----------------------|-----------------------------------------------------|----------------------------------------------------------------|
| `cancelar`            | `(params: CancelarParams) → CancelarResult`         | Evento 101101; discriminated `ok` / `retry_pending`            |
| `substituir`          | `(params: SubstituirParams) → SubstituirResult`     | Emit+cancel 105102; 4 estados + rollback automático            |
| `replayPendingEvents` | `(override?: RetryStore) → ReplayItem[]`            | Cron-friendly; SEFIN dedupa → idempotente                      |

#### Parâmetros municipais

Todas aceitam `options?: ConsultaOptions` e retornam `Consulta*Result`.

| Método                         | Args                                                                | TTL default |
|--------------------------------|---------------------------------------------------------------------|-------------|
| `consultarAliquota`            | `(codMunicipio, codServico, competencia: Date \| string)`            | 6h          |
| `consultarHistoricoAliquotas`  | `(codMunicipio, codServico)`                                        | 24h         |
| `consultarBeneficio`           | `(codMunicipio, numeroBeneficio, competencia)`                      | 6h          |
| `consultarConvenio`            | `(codMunicipio)`                                                    | 24h         |
| `consultarRegimesEspeciais`    | `(codMunicipio, codServico, competencia)`                           | 6h          |
| `consultarRetencoes`           | `(codMunicipio, competencia)`                                       | 6h          |

#### DANFSe
| Método                | Assinatura                                                                                         |
|-----------------------|----------------------------------------------------------------------------------------------------|
| `gerarDanfse`         | `(nfse: NFSe, options?: GerarDanfseOptions & { strategy?: 'auto' \| 'online' \| 'local' }) → Buffer` |
| `fetchDanfse`         | `(chaveAcesso: string) → Buffer`                                                                   |

`'auto'` (default) tenta online e cai para local **só em transientes** (`NetworkError`/`TimeoutError`/`ServerError`); permission/404 propagam. `fetchDanfse` valida `/^\d{50}$/` upfront.

#### Lifecycle
| Método                | Assinatura                                           |
|-----------------------|------------------------------------------------------|
| `close`               | `() → void` — libera dispatcher mTLS; idempotente    |

Após `close()`, qualquer método lança `ClientClosedError`.

### `NfseClientConfig`

| Campo              | Tipo                              | Default                         | Obrigatório para                       |
|--------------------|-----------------------------------|---------------------------------|----------------------------------------|
| `ambiente`         | `Ambiente`                        | —                               | sempre                                 |
| `certificado`      | `CertificateInput`                | —                               | sempre                                 |
| `emitente`         | `EmitenteConfig?`                 | —                               | (reservado)                            |
| `timeoutMs`        | `number?`                         | `60_000`                        | —                                      |
| `logger`           | `Logger?`                         | `noopLogger`                    | —                                      |
| `dispatcher`       | `Dispatcher?`                     | auto (undici Agent mTLS)        | testes com `MockAgent`                 |
| `cepValidator`     | `CepValidator?`                   | `createViaCepValidator()`       | override ViaCEP                        |
| `retryStore`       | `RetryStore?`                     | —                               | `emitir`/`cancelar`/`substituir` transientes |
| `dpsCounter`       | `DpsCounter?`                     | —                               | `emitir(params)` sem `nDPS` explícito  |
| `parametrosCache`  | `ParametrosCache?`                | `createInMemoryParametrosCache()`| —                                     |

## Helpers standalone

Reexportados do pacote raiz; não precisam de `NfseClient`.

| Função                     | Assinatura                                                                          | Para quê                                                 |
|----------------------------|-------------------------------------------------------------------------------------|----------------------------------------------------------|
| `buildDps`                 | `(params: BuildDpsParams) → DPS`                                                    | Monta DPS completa a partir de ~10 campos                |
| `buildDpsId`               | `(params: BuildDpsIdParams) → string`                                               | Gera os 45 chars do `infDPS.Id`                          |
| `buildDpsXml`              | `(dps: DPS, options?: BuildDpsXmlOptions) → string`                                 | Serializa DPS em XML (sem assinar)                       |
| `signDpsXml`               | `(xml: string, cert: A1Certificate) → string`                                       | XMLDSig (RSA-SHA256 + exc-c14n + enveloped)              |
| `parseNfseXml`             | `(xml: string) → NFSe`                                                              | XML → DTO tipado                                          |
| `parseEventoXml`           | `(xml: string) → EventoProcessado`                                                  | XML de evento → DTO tipado                                |
| `validateDpsXml`           | `(xml: string, options?: ValidateDpsXmlOptions) → ValidateDpsXmlResult \| void`     | XSD RTC v1.01 via libxml2 WASM                           |
| `validateCnpj`             | `(cnpj: string) → void`                                                             | Formato + DV; lança `InvalidCnpjError`                   |
| `validateCpf`              | `(cpf: string) → void`                                                              | Formato + DV; lança `InvalidCpfError`                    |
| `createViaCepValidator`    | `(options?: ViaCepOptions) → CepValidator`                                          | ViaCEP com cache em memória                              |
| `createInMemoryDpsCounter` | `(initial?: number) → DpsCounter`                                                   | Counter em memória (testes/demos)                        |
| `createInMemoryRetryStore` | `() → RetryStore`                                                                   | Store em memória (testes/demos)                          |
| `createInMemoryParametrosCache` | `() → ParametrosCache`                                                         | Cache em memória (default do client)                     |
| `gerarDanfse`              | `(nfse: NFSe, options?: GerarDanfseOptions) → Buffer`                               | PDF local (pdfkit + QR code)                             |
| `fetchDanfse`              | `(httpClient: HttpClient, chaveAcesso: string) → Buffer`                            | GET /danfse/{chave} raw (uso interno do cliente)         |
| `buildCancelamentoXml`     | `(params: BuildCancelamentoXmlParams, options?) → string`                           | XML do pedRegEvento 101101                               |
| `buildSubstituicaoXml`     | `(params: BuildSubstituicaoXmlParams, options?) → string`                           | XML do pedRegEvento 105102                               |
| `buildEventoPedidoId`      | `(params: BuildEventoPedidoIdParams) → string`                                      | `infPedReg.Id` canônico                                  |
| `signPedRegEventoXml`      | `(xml: string, cert: A1Certificate) → string`                                       | XMLDSig para eventos                                     |
| `postEvento`               | `(httpClient, cert, chave, xml, options) → EventoResult`                            | POST /nfse/{chave}/eventos raw                           |
| `cancelar`                 | `(httpClient, cert, params: CancelarParams) → CancelarResult`                       | Impl pura; use `cliente.cancelar` em app code            |
| `substituir`               | `(httpClient, cert, params: SubstituirParams) → SubstituirResult`                   | Impl pura; use `cliente.substituir` em app code          |
| `providerFromFile`         | `(path: string, password: string) → CertificateProvider`                            | Provider que lê .pfx do disco                            |
| `collectCepsFromDps`       | `(dps: DPS) → readonly CollectedCep[]`                                              | Extrai todos CEPs (debug, dashboards)                    |
| `collectIdentifiersFromDps`| `(dps: DPS) → readonly CollectedIdentifier[]`                                       | Extrai CNPJs/CPFs (debug, dashboards)                    |
| `defaultIsTransient`       | `(err: unknown) → boolean`                                                          | Classificação default de erro transiente                 |

## Fake (testing)

```ts
import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing';
```

Structurally compat com `NfseClient` via `NfseClientLike`. API de seeding documentada em [Testando com o fake](/guide/testing).

## Interfaces pluggable

```ts
interface DpsCounter {
  next(scope: { emitenteCnpj: string; serie: string }): Promise<string>;
}

interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}

interface ParametrosCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface CepValidator {
  validate(cep: string): Promise<CepInfo>;
}

interface CertificateProvider {
  load(): Promise<A1Certificate>;
}

interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
}
```

## Enums

Exportados da raiz. Usados como tipos nos DTOs e como valor quando se monta params manualmente.

| Enum                              | Valores (amostra)                                                                                   |
|-----------------------------------|------------------------------------------------------------------------------------------------------|
| `Ambiente`                        | `Producao`, `ProducaoRestrita`                                                                       |
| `TipoAmbiente`                    | `Producao='1'`, `Homologacao='2'`                                                                    |
| `OpcaoSimplesNacional`            | `Nao`, `MeEpp`, `Mei`, ...                                                                            |
| `RegimeEspecialTributacao`        | `Nenhum`, `Microempresa`, ...                                                                         |
| `TipoEmitenteDps`                 | `Prestador='1'`, `Tomador='2'`, `Intermediario='3'`                                                  |
| `TipoAmbienteDps`                 | `Producao='1'`, `Homologacao='2'`                                                                    |
| `CST` (PIS/COFINS)                | `'00'`...`'09'`                                                                                       |
| `TipoRetISSQN`, `TipoTribISSQN`, `IndicadorTotalTributos` | flags numéricos string                                                        |
| `JustificativaCancelamento`       | `ErroEmissao='1'`, `ServicoNaoPrestado='2'`, `Outros='9'`                                            |
| `JustificativaSubstituicao`       | `DesenquadramentoSN='01'`, `EnquadramentoSN='02'`, ...                                                |
| `TipoEventoNfse`                  | `Cancelamento='101101'`, `Substituicao='105102'`, ...                                                |
| `StatusDistribuicao`              | `DocumentosLocalizados`, `NenhumDocumento`, `Rejeicao`                                                |
| `TipoDocumento`, `TipoEvento`     | enums de distribuição NSU                                                                             |

Lista completa no código-fonte: [`src/nfse/enums.ts`](https://github.com/fm-s/open-nfse/blob/main/src/nfse/enums.ts) + [`src/dfe/types.ts`](https://github.com/fm-s/open-nfse/blob/main/src/dfe/types.ts).

## Erros

Todos herdam de `OpenNfseError`. Árvore e comportamento por método em [Erros tipados](/guide/erros).

| Classe                            | Quando é lançado                                                            |
|-----------------------------------|------------------------------------------------------------------------------|
| `NetworkError`                    | Rede abaixo, DNS, socket fechado                                             |
| `TimeoutError`                    | `timeoutMs` excedido                                                         |
| `UnauthorizedError` (401)         | Certificado inválido ou não apresentado                                      |
| `ForbiddenError` (403)            | CNPJ sem permissão                                                           |
| `NotFoundError` (404)             | Recurso inexistente (chave, etc.)                                            |
| `ServerError` (5xx)               | Erro do lado da Receita                                                      |
| `HttpStatusError`                 | Base genérica para status não mapeados                                       |
| `ExpiredCertificateError`         | A1 vencido (detectado no load)                                               |
| `InvalidCertificateError`         | A1 malformado / PKCS#12 corrompido                                           |
| `InvalidCertificatePasswordError` | Senha errada do .pfx                                                         |
| `InvalidChaveAcessoError`         | Chave fora de `/^\d{50}$/`                                                    |
| `InvalidXmlError`                 | XML estruturalmente inválido                                                 |
| `XsdValidationError`              | XSD RTC v1.01 violado; carrega `violations[]`                                 |
| `InvalidCepError`                 | Formato inválido / ViaCEP 404                                                |
| `InvalidCnpjError` / `InvalidCpfError` | DV incorreto ou formato                                                |
| `InvalidDpsIdParamError`          | Params de `buildDpsId` fora do formato                                       |
| `InvalidEventoPedidoIdParamError` | Params de `buildEventoPedidoId` fora do formato                              |
| `DpsAlreadySignedError`           | Tentativa de assinar um XML que já tem `<Signature>`                         |
| `MissingRetryStoreError`          | Transiente sem `retryStore` configurado                                      |
| `MissingDpsCounterError`          | `emitir(params)` sem `params.nDPS` e sem `dpsCounter`                         |
| `ReceitaRejectionError`           | HTTP 400 com body de rejeição; `codigo`, `descricao`, `mensagens[]`          |
| `ClientClosedError`               | Chamada após `cliente.close()`                                               |

## Types principais

Todos os DTOs de domínio (RTC v1.01) em `src/nfse/domain.ts` são reexportados. Fluxos de resultado:

| Tipo                         | Variantes / forma                                                                                  |
|------------------------------|----------------------------------------------------------------------------------------------------|
| `NfseQueryResult`             | `{ chaveAcesso, xmlNfse, nfse: NFSe, tipoAmbiente, versaoAplicativo, dataHoraProcessamento }`      |
| `NsuQueryResult`              | `{ status, documentos[], alertas[], erros[], ultimoNsu, ... }`                                      |
| `NfseEmitResult`              | `{ chaveAcesso, idDps, xmlNfse, nfse, alertas[], ... }`                                             |
| `EmitirResult` (discriminated)| `{ status: 'ok', nfse: NfseEmitResult }` \| `{ status: 'retry_pending', pending, error }`          |
| `DpsDryRunResult`             | `{ dryRun: true, xmlDpsAssinado, xmlDpsGZipB64 }`                                                   |
| `EmitLoteResult`              | `{ items: EmitLoteItem[], successCount, failureCount, skippedCount }`                               |
| `CancelarResult` (discriminated) | `'ok'` \| `'retry_pending'`                                                                     |
| `SubstituirResult` (discriminated) | `'ok'` \| `'retry_pending'` \| `'rolled_back'` \| `'rollback_pending'`                        |
| `ReplayItem`                  | `'success'` \| `'success_emission'` \| `'still_pending'` \| `'failed_permanent'`                   |
| `PendingEvent` (discriminated)| `kind: 'emission' \| 'cancelamento_simples' \| 'cancelamento_por_substituicao' \| 'rollback_cancelamento'` |
| `ConsultaAliquotasResult`, `ConsultaBeneficioResult`, `ConsultaConvenioResult`, `ConsultaRegimesEspeciaisResult`, `ConsultaRetencoesResult` | parâmetros municipais normalizados |

Types detalhados, incluindo RTC / IBS / CBS (`RtcInfoTributosSitClas`, `RtcTotalIbs`, etc.): [API completa](/api/).
