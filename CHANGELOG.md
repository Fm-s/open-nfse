# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/fm-s/open-nfse/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fm-s/open-nfse/releases/tag/v0.1.0
