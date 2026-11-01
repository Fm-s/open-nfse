# API cheat sheet

Assinaturas compactas de toda a superfície pública. Para parâmetros completos, tipos aninhados e JSDoc, clique em cada link para a [API completa (TypeDoc)](/api/).

## Cliente

### `NfseClient`

```ts
new NfseClient<L extends Layout>(config: NfseClientConfig<L>): NfseClient<L>  // layout: 'nt004' | 'nt009' obrigatório
```

O `layout` não tem default e tipa a emissão: num `NfseClient<'nt004'>`, `emitir`/`emitirDpsPronta`/`emitirEmLote`/`substituir` só aceitam params/DPS do `nt004` (chamador JS: `LayoutMismatchError` antes de consumir o `nDPS`, assinar ou tocar a rede; valor desconhecido → `InvalidLayoutError` no construtor). As leituras aceitam documentos dos dois layouts. Ver [Leiautes](/guide/layouts).

Todos os métodos abaixo retornam `Promise<T>`. Referência: [`NfseClient`](/api/classes/NfseClient).

#### Leitura
| Método                | Assinatura                                          | Lança                                                         |
|-----------------------|-----------------------------------------------------|---------------------------------------------------------------|
| `fetchByChave`        | `(chaveAcesso: string) → NfseQueryResult`           | `InvalidChaveAcessoError`, `NotFoundError`, `HttpError*`       |
| `fetchByNsu`          | `(params: FetchByNsuParams) → NsuQueryResult`       | `HttpError*` (404/400 **não** lançam — viram `status`)         |
| `fetchDpsStatus`      | `(idDps: string) → DpsStatusResult`                 | `InvalidDpsIdError`, `NotFoundError` (sem NFS-e gerada), `HttpError*` |
| `existsDpsStatus`     | `(idDps: string) → boolean`                         | `InvalidDpsIdError`, `HttpError*` (HEAD; 404 → `false`)        |

#### Emissão
| Método                | Assinatura                                                                                         | Comportamento                                                  |
|-----------------------|----------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| `emitir`              | `(params: EmitirParams<L>) → EmitirResult<L> \| DpsDryRunResult`                                    | Guards offline (layout, regras do `buildDps`) antes do counter; transiente → `retry_pending`; permanente → throw |
| `emitirDpsPronta`     | `(dps: DpsFor<L>, options?: EmitOptions) → NfseEmitResult<L> \| DpsDryRunResult`                    | Escape hatch: sem counter, sem retry store, throw em tudo      |
| `emitirEmLote`        | `(dpsList: readonly DpsFor<L>[], options?: EmitLoteOptions) → EmitLoteResult<L>`                    | Worker pool client-side; `stopOnError` opcional; uma DPS de outro layout rejeita o lote inteiro antes do primeiro envio |

NFS-e **autorizada** cuja resposta não pôde ser interpretada → `UnreadableAuthorizedNfseError` (com `chaveAcesso`; não reemita). No lote vira o item `success_unreadable`.

#### Eventos
| Método                | Assinatura                                          | Comportamento                                                  |
|-----------------------|-----------------------------------------------------|----------------------------------------------------------------|
| `cancelar`            | `(params: CancelarParams) → CancelarResult`         | Evento 101101; discriminated `ok` / `retry_pending`            |
| `substituir`          | `(params: SubstituirParams<L>) → SubstituirResult<L>` | Emite nova DPS com `<subst>`; sistema gera o 105102. Valida um `subst` já presente na DPS contra os argumentos, E0042 e o pattern do motivo. Discriminado `ok` / `retry_pending` |
| `replayPendingEvents` | `(override?: RetryStore) → ReplayItem[]`            | Cron-friendly, single-threaded; re-POSTa o mesmo `infDPS.Id` e reconcilia rejeição permanente (E0014/E1235) via `GET /dps/{id}` — só o 404 apaga a entrada |

#### Parâmetros municipais

Todas aceitam `options?: ConsultaOptions` e retornam `Consulta*Result`.

| Método                         | Args                                                                | TTL default |
|--------------------------------|---------------------------------------------------------------------|-------------|
| `consultarAliquota`            | `(codMunicipio, codServico, competencia: Date \| string)`            | 6h          |
| `consultarHistoricoAliquotas`  | `(codMunicipio, codServico)`                                        | 24h         |
| `consultarBeneficio`           | `(codMunicipio, numeroBeneficio, competencia)`                      | 1h          |
| `consultarConvenio`            | `(codMunicipio)`                                                    | 24h         |
| `consultarRegimesEspeciais`    | `(codMunicipio, codServico, competencia)`                           | 12h         |
| `consultarRetencoes`           | `(codMunicipio, competencia)`                                       | 12h         |

Os TTLs estão em `DEFAULT_TTL_MS`.

#### DANFSe
| Método                | Assinatura                                                                                         |
|-----------------------|----------------------------------------------------------------------------------------------------|
| `gerarDanfse`         | `(nfse: NFSe, options?: GerarDanfseOptions & { strategy?: 'auto' \| 'online' \| 'local' }) → Buffer` |
| `consultarDanfse`     | `(chaveAcesso: string) → Buffer` — **deprecated**                                                  |

`'local'` (default desde v0.10.1) renderiza offline. `'auto'`/`'online'` e `consultarDanfse` são **deprecated** (NT 008/2026 — endpoint suspenso em 03/08/2026; cada uso loga `danfse.online.deprecated`): `'auto'` tenta online e cai para local **só em transientes** (`NetworkError`/`TimeoutError`/`ServerError`); permission/404 propagam. `consultarDanfse` valida a chave upfront (`InvalidChaveAcessoError`).

#### Lifecycle
| Método                | Assinatura                                           |
|-----------------------|------------------------------------------------------|
| `close`               | `() → void` — libera dispatcher mTLS; idempotente    |

Após `close()`, qualquer método lança `ClientClosedError`.

### `NfseClientConfig<L>`

| Campo              | Tipo                              | Default                         | Obrigatório para                       |
|--------------------|-----------------------------------|---------------------------------|----------------------------------------|
| `layout`           | `L extends Layout` (`'nt004' \| 'nt009'`) | — (sem default)          | sempre                                 |
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
| `retryPolicy`      | `RetryPolicy?`                    | `createDefaultRetryPolicy()`    | override de timing (backoff exponencial, jitter, etc.) |

## Helpers standalone

Reexportados do pacote raiz. As funções que recebem `httpClient` (`consultarDanfse`, `postEvento`, `cancelar`, `substituir`, `fetchDpsStatus`/`existsDpsStatus`, `fetch*` de parâmetros municipais) esperam o `HttpClient` interno da lib, que não é exportado — em código de aplicação use os métodos do `NfseClient`; as demais funcionam sem cliente. Assíncronos (retornam `Promise`): `validate*Xml`, `gerarDanfse`, `consultarDanfse`, `postEvento`, `cancelar`, `substituir`, `fetchDpsStatus`/`existsDpsStatus` e `fetch*` de parâmetros municipais.

| Função                     | Assinatura                                                                          | Para quê                                                 |
|----------------------------|-------------------------------------------------------------------------------------|----------------------------------------------------------|
| `buildDps`                 | `(params: BuildDpsParamsNt004) → DpsNt004` · `(params: BuildDpsParamsNt009) → DpsNt009` | Monta DPS de ~10 campos; `layout` obrigatório; `totTrib` por regime (MEI `indTotTrib` / ME-EPP `pTotTribSN` / Não Optante `vTotTrib`·`pTotTrib`); valida DV CPF/CNPJ; no `nt009` aceita `ajusteBC`/`ibsCbs` com as regras do Anexo I (`RuleViolationError`) |
| `buildDpsId`               | `(params: BuildDpsIdParams) → string`                                               | Gera os 45 chars do `infDPS.Id`                          |
| `buildDpsXml`              | `(dps: DPS, options?: BuildDpsXmlOptions) → string`                                 | Serializa DPS em XML (sem assinar); `versao="1.01"` nos dois layouts |
| `signDpsXml`               | `(xml: string, cert: A1Certificate) → string`                                       | XMLDSig (RSA-SHA256 + exc-c14n + enveloped)              |
| `parseNfseXml`             | `(xml: string, options?: ParseNfseXmlOptions /* { logger? } */) → NFSe`             | XML → DTO tipado; detecta o layout por `infDPS/finNFSe`; campo do outro layout → `warn` `nfse.parse.unexpected_field` |
| `parseEventoXml`           | `(xml: string) → EventoProcessado`                                                  | XML de evento → DTO tipado                                |
| `validateDpsXml`           | `(xml: string, options: ValidateDpsXmlOptions /* { layout, throwOnInvalid? } */) → void \| ValidateDpsXmlResult` | XSD RTC v1.01 do layout via libxml2 WASM; `throwOnInvalid: false` devolve as violações |
| `validatePedRegEventoXml` / `validateEventoXml` | `(xml: string, options: ValidateDpsXmlOptions) → void \| ValidateDpsXmlResult` | Mesmo, para pedido de evento / evento                    |
| `validateCnpj`             | `(cnpj: string) → void`                                                             | Formato + DV (aceita CNPJ alfanumérico); lança `InvalidCnpjError` |
| `validateCpf`              | `(cpf: string) → void`                                                              | Formato + DV; lança `InvalidCpfError`                    |
| `createViaCepValidator`    | `(options?: ViaCepOptions) → CepValidator`                                          | ViaCEP com cache em memória                              |
| `createInMemoryDpsCounter` | `(initial?: number) → DpsCounter`                                                   | Counter em memória (testes/demos)                        |
| `createInMemoryRetryStore` | `() → RetryStore`                                                                   | Store em memória (testes/demos)                          |
| `createInMemoryParametrosCache` | `() → ParametrosCache`                                                         | Cache em memória (default do client)                     |
| `gerarDanfse`              | `(nfse: NFSe, options?: GerarDanfseOptions) → Buffer`                               | PDF local (pdfkit + QR code)                             |
| `consultarDanfse`          | `(httpClient: HttpClient, chaveAcesso: string) → Buffer`                            | GET /danfse/{chave} raw (uso interno do cliente; endpoint suspenso pela NT 008/2026) |
| `buildCancelamentoXml`     | `(params: BuildCancelamentoXmlParams, options?) → string`                           | XML do pedRegEvento 101101                               |
| `buildSubstituicaoXml`     | `(params: BuildSubstituicaoXmlParams, options?) → string`                           | **Deprecated**: XML do pedRegEvento 105102, só para inspeção/testes de XSD — o 105102 é gerado pelo Sistema Nacional; use `substituir` |
| `buildEventoPedidoId`      | `(params: BuildEventoPedidoIdParams) → string`                                      | `infPedReg.Id` canônico                                  |
| `signPedRegEventoXml`      | `(xml: string, cert: A1Certificate) → string`                                       | XMLDSig para eventos                                     |
| `postEvento`               | `(httpClient, cert, chave, xml, options?: { xmlJaAssinado? }) → EventoResult & { xmlAssinado }` | POST /nfse/{chave}/eventos raw                |
| `cancelar`                 | `(httpClient, cert, retryPolicy: RetryPolicy, params: CancelarParams, layout?) → CancelarResult`     | Impl pura; use `cliente.cancelar` em app code (passe `createDefaultRetryPolicy()`) |
| `substituir`               | `(httpClient, cert, retryPolicy: RetryPolicy, params: SubstituirParams<L>, layout?: L, logger?) → SubstituirResult<L>` | Impl pura; use `cliente.substituir` em app code (passe `createDefaultRetryPolicy()`) |
| `fetchDpsStatus` / `existsDpsStatus` | `(httpClient, idDps: string) → DpsStatusResult` / `boolean`               | Impl pura dos métodos homônimos do cliente               |
| `fetchAliquota`, `fetchHistoricoAliquotas`, `fetchBeneficio`, `fetchConvenio`, `fetchRegimesEspeciais`, `fetchRetencoes` | `(httpClient, …args, cache?, options?) → Consulta*Result` | Impl pura dos `consultar*` do cliente |
| `parsePfx`                 | `(pfx: Buffer, password: string) → A1Certificate`                                   | Lê um PKCS#12 em memória                                 |
| `providerFromFile`         | `(path: string, password: string) → CertificateProvider`                            | Provider que lê .pfx do disco                            |
| `collectCepsFromDps`       | `(dps: DPS) → readonly CollectedCep[]`                                              | Extrai todos CEPs (debug, dashboards)                    |
| `collectIdentifiersFromDps`| `(dps: DPS) → readonly CollectedIdentifier[]`                                       | Extrai CNPJs/CPFs (debug, dashboards)                    |
| `defaultIsTransient`       | `(err: unknown) → boolean`                                                          | Classificação default de erro transiente                 |
| `createDefaultRetryPolicy` | `(options?: DefaultRetryPolicyOptions) → RetryPolicy`                               | Policy default: respeita Retry-After + cap 1h            |
| `isPendingEmission` / `isPendingEventoCancelamento` | `(p: PendingEvent) → p is PendingEmission` / `p is PendingEventoCancelamento` | Type guards do `PendingEvent`          |
| `pendingEmissionId` / `pendingEventId` | `(idDps)` / `(chaveNfse, tipoEvento, kind) → string`                    | Ids canônicos das entradas do `RetryStore`               |
| `receitaRejectionFromPostError` / `receitaRejectionFromResponseErro` | `(body, options?) → ReceitaRejectionError \| undefined` | Monta o erro a partir do body bruto de rejeição (`undefined` sem mensagens) |

Constantes: `LAYOUTS` (`['nt004', 'nt009']`), `AMBIENTE_ENDPOINTS`, `DEFAULT_TTL_MS`, `noopLogger`.

## Fake (testing)

```ts
import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing';

const fake = new NfseClientFake({ layout: 'nt004' }); // ambiente? opcional
```

Structurally compat com `NfseClient` via `NfseClientLike<L>`. Reaproveita os guards offline do cliente real (layout, regras do `buildDps`, cancelamento/substituição) antes de consumir a falha programada (`failNextEmit`/`failNextCancel`); a chave sintetizada para uma DPS segue a regra de formação oficial (`TSIdNFSe`). Exporta também `FakeSeed`, `synthNfse`, `synthChaveAcesso` e o tipo `ProgrammedFailure`. API de seeding documentada em [Testando com o fake](/guide/testing).

## Interfaces pluggable

```ts
interface DpsCounter {
  next(scope: { emitenteCnpj: string; serie: string }): Promise<string>;
}

interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;       // MUST return Date (não string)
  delete(id: string): Promise<void>;
}

interface RetryPolicy {
  computeNotBefore(err: Error, now: Date, context?: RetryContext): Date | undefined;
}

interface RetryContext {
  readonly attempt: number;        // 1+ (incl. a tentativa que acabou de falhar)
  readonly firstAttemptAt: Date;   // primeira persistência da entrada
}

interface DefaultRetryPolicyOptions {
  readonly defaultRetryAfterMs?: number;  // fallback p/ 429/503 sem header (default 60_000)
  readonly maxRetryAfterMs?: number;      // cap defensivo (default 3_600_000 = 1h)
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
| `TipoAmbiente`                    | `Producao='PRODUCAO'`, `Homologacao='HOMOLOGACAO'` (≠ `TipoAmbienteDps`, que é `'1'`/`'2'`)          |
| `OpcaoSimplesNacional`            | `NaoOptante='1'`, `Mei='2'`, `MeEpp='3'`                                                              |
| `RegimeEspecialTributacao`        | `Nenhum='0'`, ..., `SociedadeProfissionais='6'`, `Outros='9'`                                         |
| `TipoEmitenteDps`                 | `Prestador='1'`, `Tomador='2'`, `Intermediario='3'`                                                  |
| `TipoAmbienteDps`                 | `Producao='1'`, `Homologacao='2'`                                                                    |
| `CST` (PIS/COFINS)                | `Nenhum='00'`, `TributavelAliquotaBasica='01'`, ...                                                   |
| `TipoRetISSQN`, `TipoTribISSQN`, `IndicadorTotalTributos` | flags numéricos string                                                        |
| `JustificativaCancelamento`       | `ErroEmissao='1'`, `ServicoNaoPrestado='2'`, `Outros='9'`                                            |
| `JustificativaSubstituicao`       | `DesenquadramentoSN='01'`, `EnquadramentoSN='02'`, ..., `Outros='99'`                                 |
| `TipoEventoNfse`                  | `Cancelamento='101101'`, `CancelamentoPorSubstituicao='105102'`, ...                                 |
| `FinalidadeNFSe`                  | `Regular='0'` — `finNFSe` (`nt004`: dentro de `IBSCBS`; `nt009`: filho direto de `infDPS`)            |
| `TipoAjusteBCNt009`, `TipoAjusteBCLocImoveisNt009` | tipos de ajuste da BC (`nt009`)                                                      |
| `TipoDedRedNt004`, `TipoReembolsoRepasseNt004` | tipos de dedução/redução e reembolso/repasse (`nt004`)                                   |
| `StatusDistribuicao`              | `DocumentosEncontrados`, `NenhumDocumento`, `Rejeicao`                                                |
| `TipoDocumento`, `TipoEvento`     | enums de distribuição NSU                                                                             |

Enums que só existem num layout levam o sufixo `Nt004`/`Nt009`. Lista completa no código-fonte: [`src/nfse/enums.ts`](https://github.com/fm-s/open-nfse/blob/main/src/nfse/enums.ts) + [`src/dfe/types.ts`](https://github.com/fm-s/open-nfse/blob/main/src/dfe/types.ts).

## Erros

Todos herdam de `OpenNfseError` — a maioria via os grupos `HttpError` (→ `HttpStatusError`), `CertificateError` e `ValidationError`; `ReceitaRejectionError`, `UnreadableAuthorizedNfseError` e `ClientClosedError` herdam direto. Árvore e comportamento por método em [Erros tipados](/guide/erros).

| Classe                            | Quando é lançado                                                            |
|-----------------------------------|------------------------------------------------------------------------------|
| `NetworkError`                    | Rede abaixo, DNS, socket fechado                                             |
| `TimeoutError`                    | `timeoutMs` excedido                                                         |
| `UnauthorizedError` (401)         | Certificado inválido ou não apresentado                                      |
| `ForbiddenError` (403)            | CNPJ sem permissão                                                           |
| `NotFoundError` (404)             | Recurso inexistente (chave, etc.)                                            |
| `ServerError` (5xx)               | Erro do lado da Receita                                                      |
| `TooManyRequestsError` (429)      | Rate limit; transiente — vira `retry_pending` com `notBefore` do Retry-After |
| `HttpStatusError`                 | Base genérica + método `getRetryAfterMs()` (RFC 7231)                        |
| `ExpiredCertificateError`         | A1 vencido (detectado no load)                                               |
| `InvalidCertificateError`         | A1 malformado / PKCS#12 corrompido                                           |
| `InvalidCertificatePasswordError` | Senha errada do .pfx                                                         |
| `InvalidLayoutError`              | `layout` desconhecido (chamador JS); carrega `received`                      |
| `LayoutMismatchError`             | Params/DPS de outro layout que o do cliente; `expected`, `received`          |
| `RuleViolationError`              | Regra de negócio checada offline; `rule` traz o código (ex.: `E0322`)        |
| `InvalidChaveAcessoError`         | Chave de acesso fora do formato (50 chars; aceita CNPJ alfanumérico)         |
| `InvalidDpsIdError`               | `idDps` fora do formato do `infDPS.Id`                                       |
| `InvalidXmlError`                 | XML estruturalmente inválido                                                 |
| `XsdValidationError`              | XSD RTC v1.01 do layout violado; carrega `violations[]`                      |
| `InvalidCepError`                 | `reason`: `'format'` / `'not_found'` (CEP inexistente) / `'api_unavailable'` |
| `InvalidCnpjError` / `InvalidCpfError` | DV incorreto ou formato                                                |
| `InvalidDpsIdParamError`          | Params de `buildDpsId` fora do formato                                       |
| `InvalidEventoPedidoIdParamError` | Params de `buildEventoPedidoId` fora do formato                              |
| `DpsAlreadySignedError`           | Tentativa de assinar um XML que já tem `<Signature>`                         |
| `MissingRetryStoreError`          | Transiente sem `retryStore` configurado                                      |
| `MissingDpsCounterError`          | `emitir(params)` sem `params.nDPS` e sem `dpsCounter`                         |
| `ReceitaRejectionError`           | HTTP 400 com body de rejeição; `codigo`, `descricao`, `mensagens[]`          |
| `UnreadableAuthorizedNfseError`   | NFS-e **autorizada** com resposta ilegível; `chaveAcesso`, `idDps`, `xmlNfse` — não reemita; nunca transiente |
| `ClientClosedError`               | Chamada após `cliente.close()`                                               |

## Types principais

Todos os DTOs de domínio (RTC v1.01) em `src/nfse/domain.ts` são reexportados. Tipos que mudam entre os layouts — ou que só existem num deles — levam o sufixo `Nt004`/`Nt009`, sem alias sem sufixo.

| Tipo                         | Variantes / forma                                                                                  |
|------------------------------|----------------------------------------------------------------------------------------------------|
| `Layout`                      | `'nt004' \| 'nt009'`                                                                               |
| `DPS` / `NFSe`                | `DpsNt004 \| DpsNt009` / `NfseNt004 \| NfseNt009`, discriminados pelo campo sintético `layout` (nunca serializado) |
| `DpsFor<L>` / `NfseFor<L>`    | o membro da união para o layout `L`                                                                |
| `BuildDpsParams`              | `BuildDpsParamsNt004 \| BuildDpsParamsNt009` (`BuildDpsParamsFor<L>`); inputs `nt009`: `AjusteBCInputNt009`, `IbsCbsInputNt009`, `ClassificacaoIbsCbsInputNt009`, `DestinatarioInputNt009`, `ImovelInputNt009`, `UnidadeImobiliariaInputNt009`, `BemMovelInputNt009`, `DocumentoAjusteBCInputNt009` |
| `EmitirParams<L>`             | `BuildDpsParamsFor<L>` sem `layout` (vem do cliente), `nDPS` opcional + `EmitOptions`              |
| `NfseQueryResult`             | `{ chaveAcesso, xmlNfse, nfse: NFSe, tipoAmbiente, versaoAplicativo, dataHoraProcessamento }`      |
| `NsuQueryResult`              | `{ status, documentos[], alertas[], erros[], ultimoNsu, ... }`                                      |
| `NfseEmitResult<L>`           | `{ chaveAcesso, idDps, xmlNfse, nfse: NfseFor<L>, alertas[], ... }`                                 |
| `EmitirResult<L>` (discriminated)| `{ status: 'ok', nfse: NfseEmitResult<L> }` \| `{ status: 'retry_pending', pending, error }`    |
| `DpsDryRunResult`             | `{ dryRun: true, xmlDpsAssinado, xmlDpsGZipB64 }`                                                   |
| `EmitLoteResult<L>`           | `{ items: EmitLoteItem<L>[], successCount, failureCount, skippedCount }` — item `'success'` \| `'success_unreadable'` \| `'failure'` \| `'skipped'` |
| `CancelarResult` (discriminated) | `'ok'` \| `'retry_pending'`                                                                     |
| `SubstituirResult<L>` (discriminated) | `{ status:'ok', novaNfse: NfseEmitResult<L> }` \| `{ status:'retry_pending', pending, error }` — sistema gera o 105102; transiente → RetryStore; sem rollback |
| `ReplayItem`                  | `'success'` \| `'success_emission'` (`reconciledFrom?`) \| `'success_emission_unreadable'` \| `'still_pending'` \| `'failed_permanent'` |
| `PendingEvent` (discriminated)| `kind: 'emission' \| 'cancelamento_simples' \| 'cancelamento_por_substituicao' \| 'rollback_cancelamento'`; `layout?` de origem |
| `ConsultaAliquotasResult`, `ConsultaBeneficioResult`, `ConsultaConvenioResult`, `ConsultaRegimesEspeciaisResult`, `ConsultaRetencoesResult` | parâmetros municipais normalizados |

Types detalhados, incluindo RTC / IBS / CBS (`RtcInfoTributosSitClasNt004`, `RtcIbsCbsNt009`, `RtcTotalIbs`, etc.): [API completa](/api/).
