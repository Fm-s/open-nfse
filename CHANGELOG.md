# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] — 2026-04-17

Endurecimento pós-auditoria interna (race conditions, validação de input, caps defensivos). Nenhuma quebra de API pública.

### Added

- `ClientClosedError` exportado da raiz — lançado quando qualquer método é chamado em um `NfseClient` após `close()`. Cliente é single-shot; instancie um novo para reconectar.
- `NfseClient` agora é **race-safe** na primeira chamada: `ensureState()` cacheia o promise em voo, evitando que chamadas concorrentes construam dois `Agent` mTLS e vazem o primeiro.
- `close()` agora é **idempotente** e **mid-flight-safe**: chamar durante um `ensureState()` em voo dispara `ClientClosedError` e libera o dispatcher recém-construído sem vazar.

### Changed

- **`NfseClient.gerarDanfse('auto')`** restringiu o fallback para local apenas em erros transientes (`NetworkError`, `TimeoutError`, `ServerError`/5xx). Erros permanentes (`ForbiddenError`, `UnauthorizedError`, `NotFoundError`, `InvalidChaveAcessoError`) agora **propagam** — antes um cert expirado, CNPJ sem permissão ou chave inexistente era mascarado por um PDF local degradado, escondendo o problema real.

### Fixed

- `NfseClient.fetchDanfse(chave)` agora valida `/^\d{50}$/` e lança `InvalidChaveAcessoError` antes de tocar a rede, espelhando o comportamento de `fetchByChave`. Anteriormente qualquer string era passada ao ADN.
- `fetchByNsu` agora lança `NetworkError` quando o corpo do response 400/404 não traz o campo `StatusProcessamento` — protege contra proxy/WAF na frente do ADN respondendo com payload genérico, que antes era silenciosamente parseado como "nenhum documento".
- HTTP client passou a ler o response body em chunks e aborta se passar de **10 MB** — proteção contra proxies mal configurados devolvendo HTML/JSON gigantes.
- Descompressão GZip agora usa `maxOutputLength: 50 MB` — defesa contra gzip-bomb (e.g. 1 KB → 1 GB) em responses corrompidas.

### Docs

- `docs/guide/erros.md`: `ClientClosedError` adicionado à hierarquia.
- `docs/guide/principios.md`: hierarquia de erros atualizada.
- `docs/guide/danfse.md`: warning explícito sobre quais erros sobem vs. caem para local no modo `'auto'`.
- `docs/guide/consultar.md`: nota sobre a guarda de `StatusProcessamento` no ADN.
- `docs/guide/integracao.md`: caps de 10 MB / 50 MB documentados em "Considerações de produção".
- Regressions tests cobrindo: fechamento idempotente, `ClientClosedError` pós-close, race de `ensureState`, validação de chave em `fetchDanfse`, fallback narrow em `gerarDanfse('auto')`.

## [0.7.0] — 2026-04-17

DANFSe — PDF do documento fiscal auxiliar, com modo **online-first + fallback local**. Último feature antes da fase de estabilização pré-1.0.

### Added

- `NfseClient.gerarDanfse(nfse, options?)` — default tenta o PDF oficial do ADN e cai pro renderer local em qualquer falha. Log `danfse.online.fallback` no logger para rastreabilidade.
- `options.strategy: 'auto' | 'online' | 'local'` — controla o comportamento:
  - `auto` (default): online com fallback local
  - `online`: só ADN, lança se falhar
  - `local`: só renderer local, zero rede
- `NfseClient.fetchDanfse(chave)` — baixa o PDF oficial direto. Sem fallback.
- `gerarDanfse(nfse, options?)` standalone — função pura, reexportada da raiz. Útil pra regerar DANFSe a partir de XML persistido.
- **`HttpClient.getPdf(path)`** — novo método para GETs binários (bypass do `JSON.parse`). Mantém mTLS, timeout, `acceptedStatuses`.
- `GerarDanfseOptions`: `urlConsultaPublica`, `ambiente`, `observacoes` — aplicam no modo local.

### Layout do PDF local

A4 portrait, uma página:
- Cabeçalho com chave + nº NFS-e + protocolo
- Prestador + tomador (ou "não identificado") com endereços formatados
- Descrição do serviço (cTribNac, cNBS, cTribMun)
- Valores (ISS, retenções, IBS/CBS quando presente) com **valor líquido em destaque**
- QR Code + URL para o portal público de consulta
- Watermark **HOMOLOGAÇÃO** vermelho translúcido quando `ambiente: ProducaoRestrita`
- Autorização: chave formatada, cStat, dhProc, verAplic, nDFSe

### Fake

- `NfseClientFake.gerarDanfse(nfse)` — gera PDF local (mesma lib, mesmo layout). Útil pra snapshot tests.
- `NfseClientFake.fetchDanfse(chave)` — se a chave foi seedada, renderiza localmente; senão retorna um PDF dummy `%PDF-1.4\nFake DANFSe for {chave}\n%%EOF\n` — facilita asserções sobre chamadas sem comparar bytes.

### Dependencies

- `+ pdfkit ^0.18` (runtime) — geração de PDF
- `+ qrcode ^1.5` (runtime) — QR code
- `+ @types/pdfkit` + `@types/qrcode` (dev)

### Shipped

- **326 testes** (era 321). 5 novos cobrindo: PDF válido com magic bytes, título no /Info dict, opções `observacoes`/`ambiente`/`urlConsultaPublica`.
- Nova página [docs/guide/danfse.md](https://fm-s.github.io/open-nfse/guide/danfse).

### Trade-offs

- **Layout local não é pixel-perfect** com o template oficial. Cobre todos os campos obrigatórios mas margens/tipografia diferem. Pra fidelidade total, use `strategy: 'online'`.
- **Sem logo/brasão** — a lib não carrega ativos visuais. Consumers que queiram marca própria geram PDF próprio a partir do XML.
- **Fontes Helvetica built-in** — universal mas genéricas. Fontes custom ficam para melhoria futura.

[0.7.0]: https://github.com/fm-s/open-nfse/compare/v0.6.0...v0.7.0

## [0.6.0] — 2026-04-17

`NfseClientFake` — dublê em memória para consumidores testarem seus serviços sem abrir conexão com SEFIN/ADN.

### Added

- **`open-nfse/testing` subpath** — `import { NfseClientFake, type NfseClientLike } from 'open-nfse/testing'`.
- `NfseClientFake` com **mesma superfície pública** de `NfseClient`: fetchByChave, fetchByNsu, emitir, emitirDpsPronta, emitirEmLote, cancelar, substituir, replayPendingEvents, consultar* (6 métodos), close.
- `fake.seed.*` API fluente para pré-popular estado:
  - `seed.nfse(chave, result)`
  - `seed.dfe(documentos[])`
  - `seed.aliquota/historicoAliquotas/beneficio/convenio/regimesEspeciais/retencoes(...)`
- `fake.failNextEmit({ kind: 'rejection'|'transient', ... })` e `failNextCancel(...)` — programa uma falha que é **consumida** pela próxima chamada relevante.
- `fake.reset()` — limpa todo estado (seeds + failures + emissões/eventos registrados).
- **Getters de introspecção** (read-only): `emittedChaves`, `cancelledChaves`, `substituidas`, `eventosRegistrados` — para assertions nos testes.
- `synthChaveAcesso(sequential, cnpj)` e `synthNfse(dps, chave, ambiente)` — helpers de síntese expostos caso o consumidor queira compor resultados customizados.
- `NfseClientLike = NfseClient | NfseClientFake` — tipo para suas dependências.
- Nova página [docs/guide/testing.md](https://fm-s.github.io/open-nfse/guide/testing).

### Shipped

- **321 testes** (era 304). 17 novos cobrindo: emit (ok/rejection/transient/dryRun/counter increment), fetchByChave (seeded/404/malformed), fetchByNsu (empty/seeded), cancelar (ok/rejection), substituir (state tracking), parâmetros seeded, `reset()`.

### Limitações deliberadas

- **Não valida XMLDSig** na NFS-e sintetizada (valores `FAKE_*`).
- `replayPendingEvents()` retorna `[]` — para testar replay de verdade use `NfseClient` + `MockAgent` de undici.
- `failNextCancel({kind:'transient'})` lança `TimeoutError` direto (não persiste em store).

Esses limites são intencionais — o fake é para testar **o código do consumidor**, não o fluxo interno de retry da lib.

[0.6.0]: https://github.com/fm-s/open-nfse/compare/v0.5.0...v0.6.0

## [0.5.0] — 2026-04-17

Parâmetros municipais — cliente tipado para a API `/parametrizacao` do ADN com cache pluggable. Fecha o lado de leitura: emit + consulta de NFS-e + distribuição de DF-e + parâmetros.

### Added

- `NfseClient.consultarAliquota(codMunicipio, codServico, competencia)` — alíquota vigente.
- `NfseClient.consultarHistoricoAliquotas(codMunicipio, codServico)` — histórico completo (passado + futuro).
- `NfseClient.consultarBeneficio(codMunicipio, numeroBeneficio, competencia)` — benefício fiscal (imunidade, redução de BC, alíquota diferenciada).
- `NfseClient.consultarConvenio(codMunicipio)` — status do convênio + emissor nacional + MAN.
- `NfseClient.consultarRegimesEspeciais(codMunicipio, codServico, competencia)` — Simples Nacional / MEI / Sociedade profissional / etc.
- `NfseClient.consultarRetencoes(codMunicipio, competencia)` — configuração de retenções (art. 6º LC 116 + municipais).
- `ParametrosCache` interface pluggable + `createInMemoryParametrosCache()` default.
- `NfseClientConfig.parametrosCache` — override com Redis/Memcached/etc.
- `ConsultaOptions` — `useCache?`, `ttlMs?`, `cache?` per-call overrides.
- `DEFAULT_TTL_MS` — TTLs sensatos por tipo de consulta (6h alíquota, 24h histórico, 1h benefício, 12h regimes/retenções, 24h convênio).
- Novos tipos tipados: `Aliquota`, `Beneficio`, `BeneficioServico`, `BeneficioInscricao`, `ParametrosConvenio`, `RegimeEspecial`, `Retencoes` + mais.

### Shipped

- 304 testes (era 290). Novos 14: cache (memory + TTL expiry) + fetch functions (cada endpoint cobrindo happy path, 404 com body, cache hit, override de competência Date vs string).
- Nova página de guia [docs/guide/parametros.md](https://fm-s.github.io/open-nfse/guide/parametros).

### Notes

- O ADN retorna `TipoAmbiente` como **integer** aqui (diferente de ADN Contribuintes que usa string). Normalizado em `1|2` no tipo público.
- `TipoConvenio` tem um campo ruim no wire (`tipoConvenioDeserializationSetter`) — normalizado para `tipoConvenio` no DTO público.
- Apenas os endpoints GET foram expostos. Os POST de mutação de parâmetros são usados por prefeituras, não por contribuintes — fora do escopo.

[0.5.0]: https://github.com/fm-s/open-nfse/compare/v0.4.0...v0.5.0

## [0.4.0] — 2026-04-17

Emissão segura com `DpsCounter` + tratamento transiente via `RetryStore`. Garante que uma DPS quebrada nunca queima um número da série, e que falhas de rede ficam persistidas para replay idempotente.

### Added

- `DpsCounter` interface + `createInMemoryDpsCounter()` default + `MissingDpsCounterError`. Contrato atômico (`UPDATE ... RETURNING` ou equivalente) para gerar `nDPS`. Schema SQL de backing em [docs/guide/integracao.md](https://fm-s.github.io/open-nfse/guide/integracao).
- `NfseClient.emitir(params)` **com nova semântica**: recebe `EmitirParams` (BuildDpsParams sem `nDPS`). Fluxo: validações offline (CPF/CNPJ → XSD → CEP) → `counter.next()` → build+sign+POST → resultado discriminado.
- `NfseClient.cancelar(params)` **alinhado com `emitir`**: retorna `CancelarResult` discriminado. Transientes vão pro `RetryStore` (`status: 'retry_pending'`), rejeições permanentes lançam `ReceitaRejectionError`. `PendingEventKind` ganha `'cancelamento_simples'`. Antes qualquer falha virava throw — agora falhas de rede/5xx persistem para replay idempotente.
- `EmitirResult` — discriminated union `{ status: 'ok', nfse } | { status: 'retry_pending', pending }`. Erros permanentes lançam; transientes viram `retry_pending` persistido no `RetryStore`.
- `PendingEvent` agora é union discriminado sobre `kind`: `'emission' | 'cancelamento_por_substituicao' | 'rollback_cancelamento'`. Emissões pendentes guardam `idDps`, `emitenteCnpj`, `serie`, `nDPS` + XML assinado.
- `replayPendingEvents` roteia por `kind`: emissões vão pra `/nfse`, eventos pra `/nfse/{chave}/eventos`. SEFIN deduplica via `infDPS.Id` (emissão) ou `{chave, tipoEvento, nPedReg}` (evento) — replay é sempre idempotente.
- `pendingEmissionId(idDps)` + `isPendingEmission` / `isPendingEventoCancelamento` type guards.
- `ReplayItem` ganha variante `'success_emission'` para replay de emissões bem-sucedidas.
- `NfseClientConfig.dpsCounter` — obrigatório para usar `emitir(params)` (escape hatch `emitirDpsPronta(dps)` preservado).

### Changed — Breaking

- **`NfseClient.emitir` assinatura mudou**: `emitir(dps: DPS)` → `emitir(params: EmitirParams)`. Recebe params de alto nível (estilo `buildDps`), não uma `DPS` pré-montada.
- **Retorno mudou** — `emitir` e `cancelar` agora retornam `{ status: 'ok', ... } | { status: 'retry_pending', ... }`. Rejeições permanentes ainda lançam. Migre:
  ```ts
  // v0.3:
  const r = await cliente.cancelar({...});
  r.evento.infEvento...
  // v0.4:
  const r = await cliente.cancelar({...});
  if (r.status === 'ok') r.evento.evento.infEvento...
  ```
- **Método antigo renomeado**: `emitirDpsPronta(dps)` preserva 100% da semântica anterior para quem já pré-monta a DPS. Migre assim:
  ```ts
  // v0.3:
  await cliente.emitir(dps);
  // v0.4:
  await cliente.emitirDpsPronta(dps);  // mesma semântica
  // ou o novo fluxo:
  await cliente.emitir(params);         // usa DpsCounter + RetryStore
  ```
- **`PendingEvent.xmlPedidoAssinado` → `xmlAssinado`** — renomeado para refletir que agora é compartilhado entre emissões e eventos.
- **`PendingEvent` é union discriminado** — `chaveNfse`/`tipoEvento`/`nPedRegEvento` só existem em itens de evento (não em emissões). Use `isPendingEmission`/`isPendingEventoCancelamento` para narrow.

### Não-breaking

- **`emitirEmLote` inalterado** — ainda recebe `DPS[]` e delega a `emitirDpsPronta`.
- Todos os exemplos em `examples/` seguem funcionando (usam `emitirDpsPronta` internamente via `emitirEmLote`).

### Shipped

- **288 testes** (era 277). Nova cobertura: `DpsCounter` (memória), `emitSeguro` com 10 cenários discriminando cada estado (ok, retry_pending transient, throw permanent, dryRun sem queimar número, counter chamado só após validações).
- Site de docs atualizado (breve — ver PR seguinte).

[Unreleased]: https://github.com/fm-s/open-nfse/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/fm-s/open-nfse/compare/v0.3.0...v0.4.0

## [0.3.0] — 2026-04-17

Eventos (cancelamento + substituição) com compensação automática e persistência pluggable de pendentes. Mais: validações pré-envio (XSD + CPF/CNPJ + CEP), `buildDps` ergonômico, site de documentação (VitePress + TypeDoc) para GitHub Pages.

### Added

- `NfseClient.cancelar(params)` — evento 101101. Constrói `<pedRegEvento>`, assina, gzip+b64, POSTa em `/nfse/{chave}/eventos`, parseia `<evento>` retornado. Lança `ReceitaRejectionError` em rejeição.
- `NfseClient.substituir(params)` — emite a nova DPS (com `<subst>` auto-preenchido) e cancela a original via 105102. Retorna `SubstituirResult` discriminado com 4 estados: `ok`, `retry_pending`, `rolled_back`, `rollback_pending`. Lança apenas na falha do step 1 (emit).
- `NfseClient.replayPendingEvents(store?)` — cron-friendly: itera o `RetryStore`, re-POSTa cada pendente (SEFIN deduplica via `{chave, tipoEvento, nPedRegEvento}`), remove em sucesso, mantém em falha transiente, remove + reporta em falha permanente.
- `RetryStore` interface + `createInMemoryRetryStore()` default. Backend de produção é responsabilidade do consumidor; exemplo PostgreSQL em [`docs/guide/integracao.md`](https://fm-s.github.io/open-nfse/guide/integracao).
- `buildCancelamentoXml`, `buildSubstituicaoXml` — construtores de `<pedRegEvento>` para 101101 e 105102. Expostos para uso standalone.
- `buildEventoPedidoId` — ID do pedido (`PRE[0-9]{59}` per `TSIdPedRefEvt`).
- `signPedRegEventoXml` — assina eventos; compartilha `signXmlElement` (genérico, refatorado de `signDpsXml`) em `src/xml/sign.ts`.
- `parseEventoXml` + `postEvento` — parsing e wiring HTTP para eventos.
- `buildDps(params)` — helper ergonômico que constrói uma `DPS` completa a partir de ~10 campos semânticos (emitente, serie/nDPS, servico, valores, tomador opcional). Preenche todo o boilerplate RTC v1.01 com defaults razoáveis.
- `validateDpsXml(xml)` — validação XSD local (RTC v1.01, via `xmllint-wasm`). Lança `XsdValidationError` com `violations[]` carrying `message` + `line`. `scripts/generate-schemas.mjs` inlina os 10 XSDs em `src/nfse/_rtc-schemas.generated.ts` para empacotamento no npm tarball.
- `validateCpf(cpf)` / `validateCnpj(cnpj)` — dígito verificador (algoritmo oficial da Receita). Typed `InvalidCpfError` / `InvalidCnpjError` com `reason: 'format' | 'check_digit' | 'known_invalid'`.
- `createViaCepValidator({ cache?, timeoutMs?, dispatcher? })` + `CepValidator` interface — lookup de CEP contra ViaCEP por default, com cache em memória e provider pluggable (BrasilAPI, banco local, mock). Typed `InvalidCepError` com `reason: 'format' | 'not_found' | 'api_unavailable'`.
- `collectCepsFromDps` / `collectIdentifiersFromDps` — extratores que caminham pela DPS e retornam todos os CEPs / CNPJ / CPF (para dashboards e pre-checks).
- `EmitOptions.skipValidation` / `skipCepValidation` / `skipCpfCnpjValidation` + `EmitOptions.cepValidator` override. Validações são **opt-out**: ligadas por default, surfam falhas locais antes do round-trip com a Receita.
- `NfseClientConfig.cepValidator` e `NfseClientConfig.retryStore` — defaults no nível do cliente.
- **Novos enums**: `TipoEventoNfse`, `AmbienteGeradorEvento`, `JustificativaCancelamento`.
- **Site de documentação** em [`fm-s.github.io/open-nfse`](https://fm-s.github.io/open-nfse/). VitePress + TypeDoc + GH Actions deploy automático. 10 guias escritos + API reference auto-gerada.

### Changed

- **Mudança de comportamento em `buildDpsXml`**: `dhEmi` agora é emitido em horário de Brasília (`-03:00`) sem milissegundos, conforme `TSDateTimeUTC` pattern. Antes era `Z` com `.000`, o que a RTC rejeita. Descoberto pela nova validação XSD.
- `signDpsXml` agora delega para `signXmlElement` (genérico) em `src/xml/sign.ts`. Comportamento idêntico; `DpsAlreadySignedError` preservado para back-compat. O mesmo signer atende eventos via `signPedRegEventoXml`.
- `ensureState()` do `NfseClient` carrega o certificado mesmo quando dispatcher é injetado — assinatura de DPS/evento precisa do par key/cert independentemente do transporte.
- **Removed**: `ROADMAP.md` — roadmap agora fica no [site de docs](https://fm-s.github.io/open-nfse/) e no CHANGELOG.

### Dependencies

- `+ xmllint-wasm ^5.2.0` (runtime) — validação XSD.
- `+ vitepress ^1.6.4` (dev) — site de docs.
- `+ typedoc ^0.28.19`, `typedoc-plugin-markdown ^4.11.0`, `typedoc-vitepress-theme ^1.1.2` (dev) — API reference.

### Shipped

- **277 testes** (era 192). Nova cobertura: event-id, event XML builder, event parser, RetryStore in-memory, 4-state `substituir` machine (todas as ramificações via MockAgent), CEP validator, CPF/CNPJ DV, XSD validator.
- **9 arquivos novos** em `src/eventos/` (ID, builder, signer, parser, post, retry-store, classify-error, cancelar com substituir, testes).
- **Guias**: `docs/guide/` cobre introdução, getting-started, princípios, consultar, emitir, substituir-cancelar, validações, integração (schema SQL completo), erros, ambientes.
- Exemplo atualizado em `examples/emit-nfse/` usando `buildDps`.

### Not yet implemented (roadmap)

- DANFSe (PDF) local — v0.4
- Parâmetros municipais com cache — v0.5
- `NfseClientFake` em `open-nfse/testing` — v0.6

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

[0.3.0]: https://github.com/fm-s/open-nfse/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fm-s/open-nfse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fm-s/open-nfse/releases/tag/v0.1.0