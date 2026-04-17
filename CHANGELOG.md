# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-04-17

Emissão síncrona. Pipeline completa de DTO → XML assinado → `POST /nfse` → NFS-e autorizada, com dry-run e emissão em lote. Leitura (v0.1) permanece inalterada.

### Added

- `NfseClient.emitir(dps)` — emissão síncrona. Monta o XML, assina com XMLDSig (RSA-SHA256 + exc-c14n + enveloped-signature), comprime em GZip+Base64 e envia ao SEFIN Nacional. Retorna `NfseEmitResult` com `chaveAcesso`, `idDps`, `xmlNfse` bruto, `nfse` já parseada, `alertas`, e metadados do processamento.
- `NfseClient.emitir(dps, { dryRun: true })` — mesma pipeline sem enviar. Retorna `DpsDryRunResult` com `xmlDpsAssinado` e `xmlDpsGZipB64` prontos para preview, inspeção offline ou testes locais.
- `NfseClient.emitirEmLote(dpsList, options?)` — emissão concorrente de múltiplas DPS (o SEFIN não tem endpoint de batch, a paralelização é no cliente). Configurável por `concurrency` (default `4`) e `stopOnError` (default `false` — coleta sucessos e falhas individuais). Cada item vira um `EmitLoteItem` com `status: 'success' | 'failure' | 'skipped'` preservando a ordem de entrada.
- `buildDpsId({ cLocEmi, tipoInsc, inscricaoFederal, serie, nDPS })` — gera o identificador de 45 posições conforme `TSIdDPS` da RTC v1.01 (`"DPS"` + cMun(7) + tpInsc(1) + inscFed(14, CPF zero-padded) + serie(5) + nDPS(15)). Valida cada campo e lança `InvalidDpsIdParamError` com o campo e valor ofensor.
- `buildDpsXml(dps, options?)` — inverso do parser. Serializa o DTO `DPS` em XML canônico matching the XSD sequence ordering; mantém `xmlns` em `<DPS>` e `<Signature>`, trata todos os `xs:choice` (Identificador, LocPrest, EnderecoLocalidade, TribTotal, InfoDedRed, ReferenciaDocDedRed, ImovelIdentificacao), formata datas (`dhEmi` → ISO UTC, `dCompet` → `YYYY-MM-DD`), decimais per `TSDec*V2` (integer ou 2 casas fixas), e omite campos `undefined`. Opção `includeXmlDeclaration` (default `true`).
- `signDpsXml(xml, certificate)` — assina um DPS XML com um `A1Certificate`. Algoritmo RSA-SHA256, canonicalização exc-c14n, transforms `enveloped-signature` + `exc-c14n`, digest SHA-256, Reference URI apontando para `#<infDPS.Id>`, KeyInfo com `<X509Certificate>` incorporado. Lança `InvalidXmlError` se o Id faltar e `DpsAlreadySignedError` se já houver Signature.
- `ReceitaRejectionError` reestruturado para carregar dados estruturados: `mensagens: MensagemProcessamento[]` (lista completa), acessores `codigo`/`descricao`/`complemento` sobre a primeira mensagem, `idDps`, `tipoAmbiente` (mapeado), `versaoAplicativo`, `dataHoraProcessamento`. Message do `Error` inclui `(+N erro(s))` quando há múltiplas.
- Factories `receitaRejectionFromPostError(body)` e `receitaRejectionFromResponseErro(body)` — traduzem os dois formatos de corpo do SEFIN (`NFSePostResponseErro` com array `erros` vs `ResponseErro` com campo único `erro`) em `ReceitaRejectionError` tipado. Retornam `undefined` quando o corpo não carrega mensagens reconhecíveis, permitindo que o caller decida o fallback.
- `examples/emit-nfse/` — exemplo runnable com dois scripts (`npm start` para emissão única, `npm run bulk` para emissão em lote com concorrência configurável). Dry-run por default; envio real atrás de `NFSE_CONFIRMA_EMISSAO=yes`.
- Nova dependência runtime: [`xml-crypto`](https://www.npmjs.com/package/xml-crypto) para XMLDSig (implementar `exc-c14n` à mão é um footgun conhecido).

### Changed

- **Breaking (pre-1.0):** `ReceitaRejectionError(code, reason)` foi substituído por `ReceitaRejectionError({ mensagens, idDps?, tipoAmbiente?, ... })`. Campos `code`/`reason` foram renomeados para `codigo`/`descricao` (consistente com o vocabulário fiscal PT-BR do resto da lib). Em v0.1 a classe existia mas não era instanciada por nenhum caller real — o impacto em consumidores deve ser nulo.
- `NfseClient.ensureState()` agora sempre carrega o certificado, mesmo quando o consumidor injeta um `dispatcher` custom. A assinatura do DPS precisa do par key/cert independentemente do transporte. Quando o dispatcher é custom, apenas o `Agent` mTLS é pulado.
- `NfseClient` exporta novos tipos: `DpsDryRunResult`, `EmitLoteItem`, `EmitLoteResult`, `EmitManyOptions`, `EmitOptions`, `NfseEmitResult`, `MensagemProcessamento`, `ReceitaRejectionErrorOptions`, `RawNfsePostErrorBody`, `RawResponseErroBody`, `BuildDpsIdParams`, `BuildDpsXmlOptions`, `TipoInscricaoEmitente`.

### Shipped

- 192 testes automatizados (era 122 em v0.1). Nova cobertura do XMLDSig via `xml-crypto` + `@xmldom/xmldom`, do ciclo completo emit → receive via `undici.MockAgent`, e do worker pool concorrente com `HttpClient.post` instrumentado.
- A pipeline `buildDpsXml` → `signDpsXml` → `gzipBase64Encode` → `POST /nfse` → `parseNfseXml` faz round-trip com o fixture real (`specs/samples/21113002200574753000100000000000146726037032711025.xml`).

### Not yet implemented (roadmap)

- Validação XSD local antes do envio (planejado como enhancement em v0.2.x).
- Eventos — cancelamento, substituição, manifestação (v0.3).
- DANFSe — geração local do PDF (v0.4).
- Parâmetros municipais com cache (v0.5).
- `NfseClientFake` para testes de consumidores (v0.6).

## [0.1.0] — 2026-04-16

First release. Reads-only scope: `fetchByChave` + `fetchByNsu` + full RTC v1.01 XML parsing to typed DTOs.

### Added

- `NfseClient` façade with lazy mTLS dispatcher construction, `fetchByChave(chave)`, `fetchByNsu({ ultimoNsu, cnpjConsulta?, lote? })`, `close()`.
- `Ambiente` enum (`ProducaoRestrita` | `Producao`) resolving to per-service endpoints (`sefin`, `adn`, `danfse`, `parametrosMunicipais`).
- `fetchByChave` — `GET /nfse/{chaveAcesso}` on SEFIN Nacional. Returns `NfseQueryResult` with raw `xmlNfse` string **and** fully parsed `nfse: NFSe` object.
- `fetchByNsu` — `GET /DFe/{NSU}` on ADN Contribuintes, with `ultimoNsu` cursor derived from the returned batch for pagination.
- `parseNfseXml(xml)` — standalone parser turning any RTC v1.01 NFS-e XML into the typed `NFSe` domain.
- **Full NFS-e domain model (RTC v1.01)**: ~70 interfaces covering emitente, prestador, tomador, intermediário, serviço (com variants `comExt` / `obra` / `lsadppu` / `atvEvento` / `explRod` / `infoCompl`), endereços (nacional + exterior + obra), substituição, dedução/redução, tributação municipal + federal + total, and the complete IBS/CBS tree on both NFS-e side (server-computed totals) and DPS side (emitente-declared).
- **30 enums**: `AmbienteGerador`, `TipoEmissao`, `OpcaoSimplesNacional`, `RegimeEspecialTributacao`, `TipoTribISSQN`, `TipoImunidadeISSQN`, `CST`, `JustificativaSubstituicao`, `ModoPrestacao`, `FinalidadeNFSe`, `TipoOperacao`, and 19 more — derived directly from the XSDs.
- **Discriminated unions** for XSD `xs:choice` groups: `IdentificadorPessoa` (CNPJ / CPF / NIF / cNaoNIF), `EnderecoLocalidade` (nacional / exterior), `LocPrest` (município / país), `TribTotal` (4 variants), `InfoDedRed` (3 variants), `ReferenciaDocDedRed` (6 variants), `RtcDocumentoReferenciado`, `AtvEventoIdentificacao`, `InfoObraIdentificacao`, `ImovelIdentificacao`.
- Certificate handling — `PfxCertificateInput` (simple `{ pfx, password }`) and `CertificateProvider` interface (pluggable); file and buffer providers with eager validation (throws typed errors at parse time for wrong password, invalid format, or expired cert).
- HTTP layer — `HttpClient` using undici with mTLS; JSON-first transport; typed errors for network (`NetworkError`), timeout (`TimeoutError`), generic status (`HttpStatusError`), and specialized 401 (`UnauthorizedError`), 403 (`ForbiddenError`), 404 (`NotFoundError`), 5xx (`ServerError`).
- `HttpClient.get/post` accept `RequestOptions.acceptedStatuses: number[]` — statuses in that list are returned as parsed bodies instead of thrown as errors. Used by `fetchByNsu` to handle ADN's pattern of returning **400/404 with the full `NsuQueryResult` body** (rejeição / nenhum documento). Normal consumers don't see `NotFoundError` from `fetchByNsu` on "caught up" — they see `status === 'NENHUM_DOCUMENTO_LOCALIZADO'`.
- **HTTP/1.1 forced on the mTLS dispatcher.** SEFIN Nacional rejects HTTP/2 with `HTTP_1_1_REQUIRED`; without `allowH2: false` + `ALPNProtocols: ['http/1.1']`, undici would hang silently. Discovered during integration testing against Produção Restrita.
- Error hierarchy — `Error` → `OpenNfseError` → `HttpError` / `CertificateError` / `ValidationError` / `ReceitaRejectionError` → concrete classes.
- `Logger` interface with `debug`/`info`/`warn`/`error` methods; `HttpClient` emits structured `http.request` / `http.response` events with `method`, `url`, `status`, `latencyMs`.
- Encoding helpers — `gzipBase64Encode` / `gzipBase64Decode` / `gzipBase64DecodeToText` (GZip + Base64 over `zlib`).
- Low-level XML parser (`src/xml/parser.ts`) using `fast-xml-parser`, namespace-stripped, values preserved as strings.

### Scope shipped

- 122 automated tests; statement coverage 94%, function coverage 95%.
- Real captured NFS-e sample (Simples Nacional, São Luís/MA) as integration fixture.
- Reference material in `schemas/rtc-v1.01/` (10 XSDs, NT04 RTC) and `specs/*.openapi.json` (SEFIN Nacional, ADN Contribuinte, ADN DANFSe).

### Not yet implemented (roadmap)

- Emissão síncrona — `cliente.emitir(...)` (v0.2).
- Eventos — cancelamento, substituição, manifestação (v0.3).
- DANFSe — geração local do PDF (v0.4).
- Parâmetros municipais com cache (v0.5).
- `NfseClientFake` para testes de consumidores (v0.6).

[Unreleased]: https://github.com/fm-s/open-nfse/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fm-s/open-nfse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fm-s/open-nfse/releases/tag/v0.1.0