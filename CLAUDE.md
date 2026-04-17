# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**v0.1.0 shipped** (reads-only: `fetchByChave`, `fetchByNsu`, full RTC v1.01 XML → typed DTOs). Still ahead: emission (v0.2), events (v0.3), DANFSe generation (v0.4), parâmetros municipais (v0.5). See `ROADMAP.md`.

## Commands

```
npm test             # run vitest once
npm run test:watch   # vitest in watch
npm run test:coverage
npm run typecheck    # tsc --noEmit on the whole tree (tests included)
npm run build        # tsc -p tsconfig.build.json → emits dist/ without tests
npm run lint         # biome check
npm run lint:fix     # biome check --write (safe fixes; some rules need --unsafe)
```

`prepublishOnly` chains lint + typecheck + tests + clean + build. Don't publish without it passing.

- Single test file: `npx vitest run src/nfse/parse-xml.test.ts`
- Single test by name: `npx vitest run -t 'parses exterior tomador'`

## What this library is

TypeScript/Node client for **NFS-e Padrão Nacional** (nfse.gov.br) — the unified Brazilian service-invoice API operated by the Receita Federal, sole standard from **2026-01-01** (LC 214/2025). Talks directly to the official API; not a wrapper over a commercial gateway.

**Canonical Portuguese domain terms** — do not translate:

- **DPS** — Declaração de Prestação de Serviços (what the emitente submits)
- **NFS-e** — the authorized document returned by the Receita
- **DF-e** — Documentos Fiscais Eletrônicos (umbrella for distribution by NSU)
- **NSU** — Número Sequencial Único (cursor for incremental DF-e sync, per CPF/CNPJ)
- **DANFSe** — PDF representation of an NFS-e
- **IBS / CBS / NBS / cClassTrib** — Reforma Tributária tax codes
- **Sefin Nacional** — federal emission endpoint host; **ADN** (Ambiente de Dados Nacional) — federal distribution endpoint host

## Architecture — actual shipped shape

The API is split across **two base URLs**, not one:

| Service | Path on `Ambiente` | Endpoints used |
|---|---|---|
| **SEFIN Nacional** | `endpoints.sefin` | `POST /nfse` (v0.2), `GET /nfse/{chave}`, `GET/HEAD /dps/{id}`, events on `/nfse/{chave}/eventos` (v0.3), `POST /decisao-judicial/nfse` |
| **ADN Contribuintes** | `endpoints.adn` | `GET /DFe/{NSU}`, `GET /NFSe/{ChaveAcesso}/Eventos` |
| **ADN DANFSe** | `endpoints.danfse` | `GET /{chaveAcesso}` → PDF (v0.4) |
| **ADN Parâmetros Municipais** | `endpoints.parametrosMunicipais` | (v0.5) |

Crucially, **SEFIN uses camelCase + int `tipoAmbiente`** while **ADN uses PascalCase + string `TipoAmbiente`** — wire-format types stay private per module and the public DTOs normalize to a single convention. Don't ever "unify" the wire formats at the HTTP layer; they're genuinely different contracts.

```
┌──────────────────────────────────────────────────────────┐
│   Public API — NfseClient + typed NFSe/DPS domain + enums │
├──────────────────────────────────────────────────────────┤
│   nfse/fetch-by-chave        │   dfe/fetch-by-nsu         │
│   nfse/parse-xml (RTC v1.01) │   (ADN PascalCase mapping) │
├──────────────────────────────────────────────────────────┤
│   http/client (undici + mTLS, JSON + gzip/base64 codec)   │
├──────────────────────────────────────────────────────────┤
│   certificate (ICP-Brasil A1, node-forge, pluggable)      │
└──────────────────────────────────────────────────────────┘
```

**Invariants that are easy to accidentally break**:

- **`HttpClient` knows nothing about NFS-e semantics** — it's just "mTLS JSON + status mapping." Domain knowledge (XML parsing, rejection codes, NSU pagination) lives upstream.
- **`NfseClient.close()` only closes dispatchers it owns.** When a user (or test) injects a `dispatcher`, we don't close it — they own the lifecycle. `ownsDispatcher` flag tracks this.
- **XML values stay as strings through the low-level parser.** `src/xml/parser.ts` never coerces; coercion (`"2"` → `2`, ISO string → `Date`) happens in `src/nfse/parse-xml.ts` because only the domain layer knows semantic types.
- **XSD `xs:choice` → TS discriminated union.** `IdentificadorPessoa`, `LocPrest`, `TribTotal`, `InfoDedRed`, `ReferenciaDocDedRed`, `EnderecoLocalidade` (and more) are unions where consumers narrow via `in` operator. Never collapse a choice to "optional fields" — you lose exhaustiveness.
- **Identifiers stay `string` (CNPJ, CPF, CEP, cMun, cTribNac)** to preserve leading zeros. **Decimals → `number`** (document this precision tradeoff; consumers needing exact fiscal math wrap in Decimal.js). **Dates → `Date`**.
- **Some Receita endpoints return 4xx with meaningful bodies.** ADN Contribuintes `/DFe/{NSU}` returns **400 with the full response body** for rejeição and **404 with the full body** for "nenhum documento localizado". These are NOT HTTP errors — the real status is in `body.StatusProcessamento`. `HttpClient.get/post` accepts a `RequestOptions.acceptedStatuses: number[]` list; statuses in the list bypass `mapStatusError` and are parsed normally. `fetchByNsu` uses `[400, 404]`. When implementing v0.2 emission, `POST /nfse` 400 also carries a rejection body (`NFSePostResponseErro`) — same pattern, use `acceptedStatuses: [400]`.
- **Force HTTP/1.1 — SEFIN Nacional rejects HTTP/2.** The server responds `HTTP_1_1_REQUIRED` on H2 streams for authenticated paths. undici's Agent must be constructed with `allowH2: false` AND `ALPNProtocols: ['http/1.1']` in `connect` — without both, undici may hang silently when the server kills H2 streams (the error closes the socket in a way that doesn't surface as a promise rejection). Both `createMtlsDispatcher` and the inline Agent construction inside `NfseClient.ensureState` already do this; don't remove it.

## Schema provenance

- **Canonical XSDs**: `schemas/rtc-v1.01/` — the 10 XSDs from NT04 RTC v1.01 (the Reforma Tributária revision). **Not the 2022 v1.00 base** — that one is obsolete for 2026 production.
- **OpenAPI specs**: `specs/*.openapi.json` — Swagger specs for SEFIN Nacional, ADN Contribuinte, ADN DANFSe. Extracted from Produção Restrita Swagger UIs (cert-gated) on 2026-04-16. When the Receita updates a spec, drop the new JSON here.
- **Sample responses**: `specs/samples/*.xml` — real captured NFS-e XMLs from Produção Restrita. Used as fixture in `parse-xml.test.ts`. Add more samples as they're captured; parser coverage grows with them.

`schemas/` and `specs/` are reference material, not shipped. `biome.json` ignores both. The `files: ["dist"]` whitelist keeps them out of the npm tarball.

## Design principles (binding)

Public commitments — changes need explicit user sign-off:

1. **DTO in, DTO out.** Callers never see XML, GZip, Base64, mTLS plumbing, or XMLDSig. Everything is plain typed objects. (The raw `xmlNfse` string is still exposed on `NfseQueryResult` as an escape hatch, not a replacement.)
2. **Typed errors, one class per failure mode.** `ExpiredCertificateError`, `NotFoundError`, `ReceitaRejectionError`, etc. Three-level hierarchy: `Error` → `OpenNfseError` → intermediate group (`HttpError`, `CertificateError`, `ValidationError`) → concrete.
3. **Stateless.** No database, no framework, no hidden global state.
4. **Schema-driven types.** Every TS interface in `src/nfse/domain.ts` maps to a TCxxx complex type in the XSD. When a Nota Técnica lands, walk the XSD diff → update domain types + parser + add fixture → bump MINOR.
5. **DPS builder (v0.2) will be separable from transport.** A caller must be able to build + validate + get signed XML without sending (dry-run / preview / offline tests).
6. **Pluggable certificate provider.** `CertificateProvider` is an interface; concrete providers (file, buffer, and future KMS/Vault/env) implement it. `NfseClientConfig.certificado` also accepts the simple `{ pfx, password }` shape for the common case.

## Roadmap ordering — why reads come before writes

- **v0.1 (shipped) = consulta/distribuição only.** A broken read just needs a retry.
- **v0.2 = emissão síncrona** (write-side). A broken emission can produce invalid fiscal documents in production, so it ships only after reads, mTLS, cert loading, and error typing are proven.

Do not add emission features to v0.1 "for convenience." The ordering is risk management, not schedule.

## Scope fences (from ROADMAP.md)

Explicitly out of scope — flag if a request pushes into these:

- ERP integrations (Bling, Omie, Tiny, etc.) — belong in separate packages built on top.
- Web UI / dashboard — this is a library, not a product.
- Persistence of emitted notes, retry queues, orchestration — consumer's responsibility.
- Legacy municipal ABRASF emitters — obsolete in 2026.
- NF-e (produto) — different standard, different project.

## Tax-reform timeline

IBS/CBS transition 2026–2033 with annual Notas Técnicas. Workflow when one lands:

1. Download the new XSD bundle, drop in `schemas/rtc-vX.YZ/`.
2. Diff against current schemas — identify new/renamed/changed TCxxx types.
3. Update `src/nfse/domain.ts` (interfaces), `src/nfse/enums.ts` (any new fixed-value simple types), `src/nfse/parse-xml.ts` (walkers + discriminant branches).
4. Prefer optional fields over required — additive-friendly types reduce breaking-change blast radius.
5. Add a captured real sample covering the new fields to `specs/samples/`.
6. Bump MINOR (0.X.0 → 0.Y.0 pre-1.0; 1.Y → 1.Z after 1.0).
