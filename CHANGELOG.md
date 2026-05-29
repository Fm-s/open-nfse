# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Não lançado]

Consolidação da documentação técnica oficial em `specs/ruleset/` (ruleset agent-friendly, rastreável à fonte) e auditoria de conformidade do `src/` contra ela. Correções derivadas:

### Changed (breaking)

- **`substituir()` agora emite apenas a DPS com `<subst>`.** O evento **105102 (Cancelamento por Substituição)** é gerado pelo **Sistema Nacional NFS-e** (`autor=MEmis`), de forma atômica com a emissão, ao receber a DPS substituta via `POST /nfse`. A lib **não** registra mais um pedRegEvento 105102 pelo contribuinte — era redundante (evento único → E0845) e com autor/assinante inválidos (E0813/E2032). Ref.: Manual dos Contribuintes — API Sistema Nacional NFS-e v1.2 §1.3.2.
  - `SubstituirResult` deixa de ser a união de 5 estados (`ok`/`retry_pending`/`rolled_back`/`rollback_pending`/`rollback_failed`) e passa a ser **`{ novaNfse: NfseEmitResult }`** — a chamada retorna a nota substituta ou lança (na falha da emissão, nada foi alterado no SEFIN).
  - `SubstituirParams` perde `autor`/`tpAmb`/`verAplic`/`dhEvento`/`retryStore`/`isTransient` (não há mais evento, retry nem rollback) e ganha as opções de emissão (`skipValidation`/`skipCepValidation`/`skipCpfCnpjValidation`/`cepValidator`). A free function `substituir` perde o parâmetro `retryPolicy`.
  - `buildSubstituicaoXml` marcado `@deprecated` — mantido como representação de baixo nível do evento (leitura/inspeção/XSD), não para envio pelo contribuinte.
  - ⚠️ **Pendente de validação em Produção Restrita** antes do release.

### Added — guardas fail-fast de emissão (`buildDps`)

Pré-checagem local de regras de rejeição fechadas que o XSD não expressa (evita consumir `nDPS` num round-trip que a SEFIN rejeitaria): **E0595** (aliqIss > 5%), **E0600** (aliqIss para MEI), **E0162** (regApTribSN para Não Optante/MEI), **E0315** (cTribMun `'000'`), **E1402** (cTribNac 200101 + cLocPrestacao `'0000000'`), **E0602** (aliqIss com tribISSQN imune/exportação/não-incidência) e **E0580** (retenção de ISSQN com tribISSQN 2/3/4).

## [0.9.1] — 2026-05-29

### Segunda auditoria de conformidade contra `schemas/1.01/` (sem mudança de schema)

O bundle oficial não mudou desde a v0.9.0 (`nfse-esquemas_xsd-v1-01-20260209`, idêntico byte-a-byte ao que já está em `schemas/1.01/`, salvo a deviation documentada do `TSSerieDPS`). Esta release é uma varredura multi-agente campo-a-campo que **confirmou a lib conformante** — sem nenhum desvio que gere XML inválido ou rejeição da SEFIN — e corrigiu os desvios remanescentes de precisão de tipo e da documentação. Cada achado foi verificado contra o XSD **e** o código.

### Added

- **`RegimeEspecialTributacao.Outros = '9'`** — valor de `TSRegEspTrib` (0–6 mais 9) que faltava no enum. Como `regEspTrib` é obrigatório no prestador da DPS, um contribuinte sob regime "Outros" não conseguia informar o valor válido pela API tipada. (única correção com impacto de emissão.)
- **Novos enums para campos antes `string`:** `SituacaoNfse` (`InfNFSe.cStat`, `TStat`: 100/102/103/107), `IndicadorDestinatario` (`indDest`, `TSRTCIndDest`: 0/1), `MecanismoApoioComExPrestador` (`mecAFComexP`, `TSMecAFComExPrest`: 00–08) e `MecanismoApoioComExTomador` (`mecAFComexT`, `TSMecAFComExToma`: 00–26). Membros e valores derivados das `<xs:documentation>` oficiais. Exportados na raiz.
- **`IdentificadorEmitente`** (`{ CNPJ } | { CPF }`) — `TCEmitente` admite apenas CNPJ/CPF, ao contrário de `IdentificadorPessoa` (4 variantes, com `NIF`/`cNaoNIF`). Exportado.
- **`enums-conformance.test.ts`** — trava os valores de fio dos enums acima contra `tiposSimples_v1.01.xsd`.

### Changed

- **`Emitente.identificador`: `IdentificadorPessoa` → `IdentificadorEmitente`** — afina o tipo (caminho de leitura) ao `<xs:choice>` de `TCEmitente`. Parser dedicado `parseIdentificadorEmitente` (rejeita `NIF`/`cNaoNIF` sob `<emit>`).
- **`InfNFSe.cStat`, `RtcInfoIbsCbs.indDest`, `ComExterior.mecAFComexP`/`mecAFComexT`: `string` → enums** correspondentes. Tightening de tipo, runtime-compatível (os enums são string); quem **monta** `indDest`/`mecAFComex*` com string crua passa a usar o membro do enum.
- **`InfEvento.verAplic` agora obrigatório** — `TCInfEvento` exige `verAplic` (sem `minOccurs`); o parser passa a usar `requireText`, consistente com o `InfPedRegEvento.verAplic` interno que já era obrigatório.
- **Ordem dos campos de `e305102`** (`DetalheEvento`) alinhada à sequência `TE305102` (`codEvento` antes de `xMotivo`). Cosmético — o parse é por nome de elemento.

### Fixed (documentação — `api-cheatsheet.md`)

- **`TipoAmbiente`** estava listado com `Producao='1'`/`Homologacao='2'` (que pertencem a `TipoAmbienteDps`); os valores reais são `'PRODUCAO'`/`'HOMOLOGACAO'`.
- **`cancelar`/`substituir` (funções livres)** documentadas sem o 3º argumento `retryPolicy: RetryPolicy` — seguir a assinatura antiga passaria o `params` onde se espera a policy.
- **`StatusDistribuicao`** citava o membro `DocumentosLocalizados`; o nome real é `DocumentosEncontrados` (valor `'DOCUMENTOS_LOCALIZADOS'`).
- **`SubstituirResult`** listava 4 estados; são 5 (faltava `'rollback_failed'`); nota do método ajustada de "4 estados" para "5 estados".
- **`fetchDpsStatus`/`existsDpsStatus`** ausentes da tabela de Leitura, apesar de públicos no cliente, no fake e como funções livres.

## [0.9.0] — 2026-05-28

### Auditoria campo-a-campo contra o XSD oficial `schemas/1.01/`

Correções de divergências entre os tipos/serialização/parsing da lib e o schema oficial:

- **Eventos de rejeição/anulação (parser):** `parse-event.ts` esperava wrappers `<infRej>` (202205/203206/204207) e `<infAnRej>` (205208) que **não existem** no XSD — `cMotivo`/`xMotivo`/`CPFAgTrib`/`idEvManifRej` são filhos diretos. O parser lançava `InvalidXmlError` em **todo** evento de rejeição/anulação real. Achatado para casar com o schema; tipos `DetalheEvento` correspondentes achatados.
- **`<lsadppu>` e `<explRod>` removidos:** não existem no RTC v1.01 (resíduo do layout v1.00). `buildServ` os emitia → XML inválido. Removidas as interfaces `LocacaoSublocacao`/`ExploracaoRodoviaria`, os campos `Serv.lsadppu`/`Serv.explRod`, a serialização e o parsing. **Breaking.**
- **Campos `minOccurs="0"` que eram lidos como obrigatórios** (lançavam em NFS-e válida): `RtcIbsCbs.pRedutor` (o mais comum — só existe em compra governamental), `RtcTotalIbsUF.vDifUF`, `RtcTotalIbsMun.vDifMun`, `RtcTotalCbs.vDifCBS`, `RtcInfoIbsCbs.indFinal`. Agora opcionais no domínio, parseados com `optionalNumber`/`optionalText`, e `indFinal` emitido condicionalmente.
- **`xOutInf` movido de `ValoresNFSe` para `InfNFSe`:** no XSD é filho direto de `TCInfNFSe` (após `valores`), não de `TCValoresNFSe` — antes nunca era lido. **Breaking** (acesso passa de `nfse.valores.xOutInf` para `nfse.xOutInf`).
- **Enums incompletos:** `VinculoPrestacao` ganhou `9` (Desconhecido); `TipoDedRed` ganhou `3` (Produção Externa), `4` (Reembolso de despesas), `9` (Profissional parceiro) — valores válidos no XSD que eram rejeitados pela tipagem.
- **`nDPS` sem zero à esquerda:** `REGEX_NDPS` aceitava `0` inicial, mas `TSNumDPS` (`<nDPS>`) exige primeiro dígito 1-9 — apertado para falhar localmente com mensagem clara em vez de rejeição da SEFIN.
- **Novos enums (type-safety) para campos antes `string`:** `TipoEnteGovernamental` (`tpEnteGov`, `TSRTCTpEnteGov`), `TipoReembolsoRepasse` (`tpReeRepRes`, `TSRTCTpReeRepRes`), `TipoChaveDFe` (`tipoChaveDFe`, `TSRTCTipoChaveDFe`) — domínios fechados do XSD agora tipados. **Breaking** para quem atribuía strings arbitrárias a esses campos.
- **`formatDecimal` endurecido:** rejeita `NaN`/`Infinity`, negativos e valores ≥ 1e21 (que `toString()` emitiria em notação científica) com `RuleViolationError` claro, em vez de gerar XML que viola os patterns `TSDec*V2` (não-negativos, sem notação científica).
- **`verAplic` valida o pattern `TSString`:** além do comprimento (1–20), agora rejeita espaço/controle nas pontas e caracteres não-imprimíveis (`[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ]`), batendo com `TSVerAplic`.

### Schema oficial + PIS/COFINS (NT SE/CGNFS-e nº 007, em produção desde 2026-02-09)

- **Migração para os schemas oficiais `schemas/1.01/`** — o conjunto curado `schemas/rtc-v1.01/` (≈NT-004) foi removido; o validador WASM passa a ser gerado dos XSDs oficiais. Única deviation: `TSSerieDPS` tinha pattern com `^`/`$` literais (`^0{0,4}\d{1,5}$`), inválido como âncora em XSD 1.0 e rejeitado pelo libxml — corrigido para `0{0,4}\d{1,5}`.
- **`CST` (PIS/COFINS) completo** — antes só `00`–`09` (e `07` rotulado errado como "Tributável da Contribuição"); agora o domínio completo da NT-007 (`00`–`09`, `49`, `50`–`56`, `60`–`67`, `70`–`75`, `98`, `99`), com `07 = Isenta`. **Breaking:** `CST.TributavelDaContribuicao` → `CST.IsentaDaContribuicao`.
- **`TipoRetPisCofins` expandido** — antes só `1`/`2` (`Retido`/`NaoRetido`); agora `0`–`9` com semântica de CSLL. **Breaking:** `TipoRetPisCofins.Retido`/`.NaoRetido` → `.PisCofinsRetidos`/`.PisCofinsNaoRetidos` (+ novos membros).
- **`xDesc` do evento 105102 corrigido** — emitia `"Cancelamento de NFS-e por Substituicao"` (sem acento), rejeitado pela enumeração oficial; agora `"Cancelamento de NFS-e por Substituição"`.

### Consistência da API (relatório de auditoria interno)

Inclui breaking renames pré-1.0 — quem usa os nomes antigos recebe erro de TypeScript apontando o call site.

### Changed (breaking)

- **`cliente.fetchDanfse` → `cliente.consultarDanfse`** (e a função livre `fetchDanfse` → `consultarDanfse`). Unifica as operações de DANFSe em verbos PT (`gerarDanfse` + `consultarDanfse`); remove o conflito PT/EN sobre o mesmo substantivo.
- **`EmitManyOptions` → `EmitLoteOptions`** — unifica o stem `EmitLote*` (método `emitirEmLote`, `EmitLoteResult`, `EmitLoteItem`, `EmitLoteOptions`).
- **`InvalidIdDpsError` → `InvalidDpsIdError`** — corrige a ordem `DpsId` (consistente com `buildDpsId` e os erros `Invalid*ParamError`).
- **`Aliquota.dataInicio`/`dataFim` → `dataInicioVigencia`/`dataFimVigencia`** e **`RegimeEspecial.dataInicio`/`dataFim` → `dataInicioVigencia`/`dataFimVigencia`** — padroniza a nomenclatura de janela de vigência com os outros structs de parâmetros municipais.
- **`Beneficio.tipoBeneficio: string` → `TipoBeneficioMunicipal`** — passa a usar o enum existente (design principle #4).
- **`ServicoInput.cNBS` agora é opcional** e `CServ.cNBS` deixa de ser serializado quando ausente. O XSD local foi ajustado para `minOccurs="0"`: a NT04 declara o elemento sem `minOccurs`, mas a SEFIN não rejeita DPS sem `cNBS`. Alinha o tipo, o builder e o validador (antes contradiziam-se).

### Added

- **Estado terminal `'rollback_failed'` em `substituir`** — quando o rollback automático (101101) falha **permanentemente**, o resultado é `rollback_failed` e nada é persistido no `RetryStore` (modelo "RetryStore = só transientes"). Antes o pendente era gravado mesmo em erro permanente. A máquina passa de 4 para 5 estados.
- **`AMBIENTE_ENDPOINTS` e `parsePfx` exportados** no barrel (`open-nfse`) — antes eram referenciados em exemplos da doc mas não exportados.

### Fixed

- **`pendingEventId` inclui `kind` na chave** (`chave:tipoEvento:kind`) — um cancelamento manual e um rollback de substituição da mesma NFS-e (ambos `101101`) deixam de colidir no `RetryStore` (last-writer-wins descartava um deles silenciosamente).
- **Parsing da resposta de `POST /nfse` centralizado** em `parsePostResponseOrThrow` — elimina três cópias divergentes (mensagem de erro inconsistente entre `emitDpsPronta` / `emitSeguro` / `replayEmission`).
- **Documentação alinhada ao código 0.8.6** — varredura de `nPedRegEvento` (dedup de eventos é `(chave, tipoEvento)`), versão nos cabeçalhos de README/CLAUDE, exemplos que não compilavam (`AMBIENTE_ENDPOINTS`, `parsePfx`, casing de `TipoDocumento`), JSDoc de `getRetryAfterMs` (`Math.ceil`), e hierarquia de erros (subárvore HTTP de 4 níveis).
- **Fidelidade do `NfseClientFake`** — `replayPendingEvents(override?)` retorna `ReplayItem[]`, `consultarDanfse`/`gerarDanfse` com `options`/`strategy`, `fetchByNsu` usa `FetchByNsuParams`.

## [0.8.6] — 2026-05-28

Compatibilidade com **Anexo II SEFIN_ADN v1.00-20251226** (publicado 2025-12-27) — cancelamento e substituição emitiam o `Id` e o corpo de `infPedReg` no formato antigo, que a SEFIN passou a rejeitar em produção com `E1235: Falha no esquema XML do DF-e — The Pattern constraint failed`. O erro vinha disfarçado como `[UNKNOWN]: Corpo de erro sem mensagens reconhecíveis` porque o parser de erro também estava desalinhado com o shape real do envelope.

### Fixed

- **`PRE` Id do `infPedReg` agora tem 59 chars (sem `nPedRegEvento`)** — antes era `PRE` + chave(50) + tipoEvento(6) + nPedRegEvento(3) = 62 chars (`PRE[0-9]{59}`); agora é `PRE` + chave(50) + tipoEvento(6) = 59 chars (`PRE[0-9]{56}`). Cancelamentos em produção pararam de funcionar quando a SEFIN ativou o novo schema.
- **Elemento `<nPedRegEvento>` removido do corpo do `infPedReg`** — o `TCInfPedReg` atualizado não aceita mais o elemento na sequência. Mantê-lo causava a mesma rejeição.
- **`receitaRejectionFromResponseErro` aceita `erro` como array** — o Swagger oficial declara `erro` como objeto único (`MensagemProcessamento`), mas o SEFIN devolve eventos rejeitados com `erro` como array. Sem isso, qualquer rejeição de evento caía no fallback `[UNKNOWN]`. A forma de objeto continua sendo aceita (GETs de NFS-e usam o shape antigo).

### Removed

- **`nPedRegEvento`** removido de `CancelarParams`, `SubstituirParams`, `BuildCancelamentoXmlParams`, `BuildSubstituicaoXmlParams`, `BuildEventoPedidoIdParams`, `PendingEventoCancelamento`, `InfPedRegEvento`. Quem passava esse campo recebe um erro de TypeScript apontando o call site. Pre-1.0 breaking change.
- **`pendingEventId(chaveNfse, tipoEvento, nPedRegEvento)` virou `pendingEventId(chaveNfse, tipoEvento)`** — SEFIN agora deduplica por `(chave + tipoEvento)`.

### Changed

- **`LIB_VERSION` lido em runtime do `package.json`** via `import.meta.url` + `node:fs` — antes era hardcoded e dessincronizava a cada release (bug histórico já chamado em 0.8.3, regredido em 0.8.4/0.8.5). Sem mais drift; `verAplic` no XML reflete a versão real instalada.
- **`schemas/rtc-v1.01/`** atualizado: `TSIdPedRefEvt` agora tem `maxLength=59` e pattern `PRE[0-9]{56}`; `TCInfPedReg` não tem mais `nPedRegEvento` na sequência. `_rtc-schemas.generated.ts` regenerado a partir dos XSDs atualizados.

### Migration

- Chamadas a `cliente.cancelar({ ... nPedRegEvento, ... })` ou `cliente.substituir({ ... nPedRegEvento, ... })`: remova o parâmetro. TS aponta o call site.
- Chamadas a `buildEventoPedidoId({ chaveAcesso, tipoEvento, nPedRegEvento })`: remova o terceiro campo.
- **Pendentes no `RetryStore` salvos antes da 0.8.6**: o XML persistido usa o `Id` de 62 chars e será rejeitado em produção como `E1235`. Limpe esses pendentes antes do upgrade ou aceite a perda — `replayPendingEvents` os marcará como falha permanente.

## [0.8.5] — 2026-05-28

Endurecimento de footguns no builder de DPS. Três regras fiscais que antes só apareciam como rejeição da SEFIN viram erros locais de tempo de build.

### Fixed

- **`buildDps` enviava `xNome` do prestador** quando `EmitenteInput.nome` era preenchido — SEFIN rejeita com "O nome ou razão social do prestador não deve ser informado quando o emitente da DPS for o próprio prestador" (a lib sempre usa `tpEmit='1'`, e nesse cenário a SEFIN preenche `xNome`/endereço a partir do cadastro do CNPJ). O comentário em `buildInfoPrestador` já cobria `end`, mas `xNome` continuava sendo inserido. Agora o builder nunca emite `prest.xNome` nem `prest.end`.

### Added

- **`RuleViolationError('TCRegTrib')` quando `opSimpNac=MeEpp` sem `regApTribSN`** — XSD trata `regApTribSN` como opcional, mas a SEFIN rejeita após round-trip. Fail-fast em `buildDps` evita queimar `nDPS` do counter por uma regra fiscal que dá pra checar offline.
- **`RuleViolationError('aliqIss')` quando `aliqIss` está em `(0, 0.5)`** — quase sempre erro de fração-vs-percentual (`0.025` em vez de `2.5`). Sem a guarda, `(0.025).toFixed(2) === '0.03'` seria aceito pelo XSD (matches `TSDec1V2`) e pela SEFIN — a nota sairia válida com **0,03%** de ISS em vez dos 2,5% pretendidos. `aliqIss === 0` (alíquota zero legítima) continua aceito.

### Removed

- **`EmitenteInput.nome` e `EmitenteInput.endereco`** — campos só servem quando `tpEmit ≠ '1'`, mas a lib sempre usa `tpEmit='1'`. Eram footguns: o type signature sugeria que tinham efeito, e `nome` causava a rejeição descrita acima. Quem preenchia esses campos deve removê-los do call site (o TypeScript apontará). Os dados aparecem no `NFSe` retornado, populados pela SEFIN a partir do cadastro.

### Changed

- **JSDoc de `BuildDpsParams.nDPS` e `EmitirParams.nDPS`**: alerta explícito contra zeros à esquerda (`'1'` e `'00001'` geram `Id`s distintos para o mesmo sequencial).
- **JSDoc de `BuildDpsParams.dCompet`**: removido "truncada em UTC" (default é `new Date()` — hoje — e callers que backdatam `dhEmi` precisam informar `dCompet` explicitamente).
- **JSDoc de `ValoresInput.aliqIss`**: ênfase em "percentual" com exemplo negativo (`NÃO 0.025`) e referência à nova guarda.

### Migration

- Se você passava `nome` ou `endereco` em `emitente`: remova. A SEFIN já preenchia esses dados a partir do cadastro; a única diferença é que agora a tentativa de informá-los falha em compile-time em vez de virar rejeição em runtime.
- Se você usava `opSimpNac=MeEpp`: confirme que `regApTribSN` está preenchido com um valor de `RegimeApuracaoSimplesNacional` (`'1'` Federal+Municipal pelo SN, `'2'` Federal pelo SN + Municipal fora, `'3'` Federal e Municipal fora). Sem ele, `buildDps` agora lança antes da emissão.
- Se você passava `aliqIss` em fração (ex: `0.05` querendo 5%): troque para percentual (`5`). Use `aliqIss=0` para alíquota zero explícita.

## [0.8.4] — 2026-05-27

Correções de conformidade XSD. Auditoria completa dos tipos, enums e serialização contra os schemas RTC v1.01.

### Fixed

- **`buildDps` incluía endereço nacional do prestador** quando `tpEmit='1'` (prestador é o emitente) — SEFIN rejeita esse campo nesse cenário. O builder agora omite `prest.end` (somente via `buildDps`; construção manual de `InfDPS` não é afetada).
- **`ModoPrestacao` labels `'3'` e `'4'` estavam trocados** — `'3'` era `MovimentoTemporarioPF` mas o XSD diz "Presença Comercial no Exterior"; `'4'` era `ConsumoNoExterior` mas é "Movimento Temporário de PF". Corrigido para `PresencaComercialExterior = '3'` e `MovimentoTemporarioPF = '4'`.
- **`TipoEmissao` tinha valor inválido `'3'`** e label errado em `'2'` (`ContingenciaOffline`). O XSD `TSTipoEmissao` só define `'1'` (Normal) e `'2'` (Transcrição de leiaute municipal). Removido `'3'`, renomeado `'2'` para `TranscricaoLeiauteMunicipal`.
- **`AmbienteGerador.Outros = '3'` inválido** para contexto de NFS-e — `TSAmbGeradorNFSe` só aceita `'1'` e `'2'`. Removido. (`'3'` é válido apenas para `TSAmbGeradorEvt`, que já tem enum próprio `AmbienteGeradorEvento`.)
- **`EnderecoSimples` / `EnderObraEvento` modelavam `xs:choice` como dois opcionais** — permitia `CEP` e `endExt` simultaneamente, ou nenhum dos dois. Agora são discriminated unions (`EnderecoSimplesLocalidade`, `EnderObraEventoLocalidade`).
- **`EnderecoSimples` emitia `cPais` dentro de `endExt`** — `TCEnderExtSimples` não tem esse campo (só `TCEnderExt` tem). Novo tipo `EnderecoExteriorSimples` sem `cPais`.
- **`BeneficioMunicipal` modelava `vRedBCBM` / `pRedBCBM` como opcionais independentes** — XSD é `xs:choice` (no máximo um). Agora é union type.
- **`formatDate` usava UTC enquanto `formatDateTime` usava BRT** — `dCompet` podia sair como o dia seguinte quando emitido após 21h BRT (00h+ UTC). Ambos agora usam BRT via helper compartilhado `toBrt`.

### Changed

- **Novos tipos exportados**: `EnderecoSimplesLocalidade`, `EnderObraEventoLocalidade`, `EnderecoExteriorSimples`.

## [0.8.3] — 2026-05-27

### Fixed

- **`buildDpsId` usava dígito de tipo de inscrição invertido** — CNPJ gerava `1` e CPF gerava `2`, quando o correto (confirmado por XMLs reais da Produção Restrita) é CNPJ = `2`, CPF = `1`. Causava rejeição E0004 ("Conteúdo do identificador informado na DPS difere da concatenação dos campos correspondentes") em toda emissão via `buildDps`.
- **Parsing de erros SEFIN ignorava PascalCase** — o SEFIN Nacional retorna `Codigo`/`Descricao` (PascalCase) em itens de `erros`, mas `receitaRejectionFromPostError`, `receitaRejectionFromResponseErro` e `normalizeAlerta` só liam `codigo`/`descricao` (camelCase). Resultado: rejeições legítimas caíam no fallback genérico "Corpo de erro sem mensagens reconhecíveis" em vez de produzir `ReceitaRejectionError` tipado com código e descrição corretos.
- **`version.ts` desatualizado** — `LIB_VERSION` estava preso em `0.7.3` desde a v0.8.0, fazendo `verAplic` no XML da DPS sair como `open-nfse/0.7.3` em vez da versão real.

## [0.8.2] — 2026-05-27

### Fixed

- **Fallback de erro agora inclui o corpo original do SEFIN** no `JSON.stringify` quando nenhuma mensagem é reconhecida — facilita diagnóstico de formatos inesperados.

## [0.8.1] — 2026-05-27

### Fixed

- **`buildDps` agora aceita `pTotTribSN`** em `ValoresInput`. Contribuintes do Simples Nacional não conseguiam informar a alíquota aproximada via builder — o campo era ignorado e `indTotTrib: '0'` era sempre aplicado. Agora `valores: { vServ: 1500, pTotTribSN: 6 }` gera `{ pTotTribSN: 6 }` no `totTrib` da DPS.

## [0.8.0] — 2026-05-12

429-aware retry pipeline com `RetryPolicy` pluggable. Emissões e eventos que recebem rate-limit agora persistem no `RetryStore` e são retentados automaticamente, respeitando o cabeçalho `Retry-After` e máximos defensivos. Nenhuma quebra de API pública.

### Added

- **`TooManyRequestsError` (HTTP 429)** tipado, com `getRetryAfterMs()` na classe pai `HttpStatusError` que lê o cabeçalho `Retry-After` em ambas as formas RFC 7231 (delta-seconds ou HTTP-date). Aceita também segundos decimais (`12.5` → 12s) como tolerância a desvios comuns de servidores.
- **`RetryPolicy`** — interface pluggable que decide *quando* um erro transiente deve ser retentado. Default `createDefaultRetryPolicy()` respeita `Retry-After`, com fallback de 60s para 429/503 sem header e cap de 1h para valores absurdos. Recebe opcionalmente um `RetryContext` com `attempt` e `firstAttemptAt` — permite policies customizadas implementarem backoff exponencial / linear / com jitter baseado em histórico.
- **`RetryContext`** — interface com `attempt: number` (tentativas até agora, ≥1) e `firstAttemptAt: Date` (primeira persistência). Passada ao `computeNotBefore` em todos os caminhos internos.
- **Campos opcionais `notBefore?: Date` e `attempts?: number`** em `PendingBase`. `replayPendingEvents` pula entradas com `notBefore > now`, incrementa `attempts` a cada replay transiente, e passa o contador ao `RetryPolicy`.
- **`retryPolicy?: RetryPolicy`** em `NfseClientConfig` para customização global do cliente. Sempre embrulhada por um wrapper defensivo internamente — exceções em `computeNotBefore` são capturadas, logadas como `warn`, e o `notBefore` cai para `undefined`. Garante que uma policy customizada com bug não mascare o erro fiscal original.

### Changed

- **`defaultIsTransient` agora classifica `TooManyRequestsError` como transiente** — emissões e eventos que recebem 429 viram `status: 'retry_pending'` em vez de lançar erro.
- **Arquivos movidos**: `src/eventos/retry-store.ts` → `src/retry/store.ts` e `src/eventos/classify-error.ts` → `src/retry/transient.ts`. Re-exports públicos preservados em `open-nfse`.

### Fixed

- **Eventos persistidos no `RetryStore` agora carregam XML assinado** (bug pré-existente desde 0.7.2). `cancelar()` / `substituir()` antes guardavam o XML pré-assinatura como `xmlAssinado` quando o POST falhava transitoriamente; o `replayPendingEvents` então enviava XML sem `<Signature>` ao SEFIN com `xmlJaAssinado: true`, levando à rejeição imediata e à perda do evento (entrada deletada como falha permanente). O fluxo de emissão (`emitir`) sempre persistiu assinado e não foi afetado. Tornou-se urgente em 0.8.0 porque 429 agora roteia pelo mesmo pipeline.
- **`replayPendingEvents` resgata entradas legadas sem `<Signature>`** — detecta XML não-assinado de eventos persistidos por 0.7.2/0.7.3 (pré-fix), re-assina com o certificado configurado antes de fazer o POST, e emite um `logger.warn` com a `id` da entrada para que o consumidor saiba que tinha dado legado. Sem isso, usuários atualizando de 0.7.x perderiam eventos pendentes silenciosamente no primeiro replay pós-upgrade.
- **`getRetryAfterMs()` arredonda decimais para cima** (Math.ceil) em vez de truncar. Servidores que enviam `Retry-After: 1.5` provavelmente querem dizer "no mínimo 1,5s"; arredondar para cima (2s) é mais conservador do que truncar para 1s, e em uma API fiscal a chance de re-trigger 429 por sub-wait é pior do que esperar 500ms a mais.

### Migration

- Consumidores usando `createInMemoryRetryStore()` ou a interface `RetryStore` em código próprio: nenhuma mudança necessária. O novo campo `notBefore` é opcional.
- Consumidores com store em banco: adicione coluna `not_before TIMESTAMP NULL` (ou equivalente). Linhas existentes ficam com `NULL` → elegíveis imediatamente no próximo sweep, comportamento idêntico ao anterior.
- **Configure um `retryStore` se ainda não tiver feito.** Antes desta versão, um 429 lançava `HttpStatusError(429)` direto pro caller. Agora 429 é classificado como transiente: se não houver `retryStore` configurado, a lib lança `MissingRetryStoreError` em vez de devolver `retry_pending`. Sem `retryStore` o `nDPS` ainda é consumido — então rodar emissão em produção sem store deixou de ser uma opção segura.
- **Remova retry loops próprios em volta de `emitir()` para 429 / 5xx.** Cada `emitir()` consome um `nDPS` antes do POST; um wrapper externo que recapta e retenta queima números da série e cria buracos permanentes no sequencial. A lib já persiste o pendente no `RetryStore` e dedupica server-side via `infDPS.Id` — use `replayPendingEvents()` (tipicamente num cron a cada 1–5 min) para retomar.

## [0.7.3] — 2026-04-20

Hardening pós-review. Tipagem mais precisa para eventos, enforcement local de regras que só apareciam no servidor. Nenhuma quebra de API pública.

### Added

- **`TipoEventoNfse`** ganhou `EventoSistemico467201` e `EventoSistemico907201` — dois códigos declarados no enum OpenAPI de `GET /nfse/{chave}/eventos/{tipoEvento}/{numSeqEvento}` mas não presentes no `TSTipoEvento` da XSD. Parser cai no fallback `unknown` ao recebê-los (shape interno não publicada).
- **Enums para justificativas e motivos de evento** — antes tratados como `string` livre no parser:
  - `JustificativaAnaliseFiscalCancelamento` (evento 101103: `1`/`2`/`9`)
  - `JustificativaAnaliseFiscalCancelamentoDeferido` (evento 105104: `1`)
  - `JustificativaAnaliseFiscalCancelamentoIndeferido` (evento 105105: `1`/`2`)
  - `MotivoRejeicaoNfse` (eventos 202205/203206/204207, em `infRej.cMotivo`: `1`..`5`/`9`)
- **`src/version.ts`** — exporta `LIB_VERSION` e `DEFAULT_VER_APLIC`, usados pelos builders. Bumpado junto com `package.json` no release.

### Changed

- **`verAplic` default dinâmico** — `buildDps` e `buildCancelamentoXml`/`buildSubstituicaoXml` agora emitem `open-nfse/<versão-corrente>` ao invés do legacy hardcoded `open-nfse/0.2`. Builders também enforçam `TSVerAplic` maxLength=20 localmente, lançando `RuleViolationError` com rule `TSVerAplic` antes do wire.
- **`TSMotivo` minLength=15 enforçado localmente** em `cancelar` e `substituir`. `xMotivo` com menos de 15 caracteres agora lança `RuleViolationError` com rule `TSMotivo` — evita round-trip + rejeição server-side. Anteriormente só o check E0078 (não-vazio) rodava.
- **`parseEventoXml` typing**: campos `cMotivo` agora retornam tipos enum específicos ao invés de `string` livre. Consumidores que narrow via `detalhe.e202205.infRej.cMotivo` ganham exhaustividade em switch statements.

### Removed

- **Dead code path em `parse-event.ts`** — o primeiro fallback loop que iterava `EVENTO_ELEMENT_TO_TIPO` era unreachable (todos os 16 tipos já são capturados por `if` blocks tipados acima). O verdadeiro fallback (pattern `/^e\d{6}$/`) continua em vigor para variantes futuras.

### Docs

- **Scope fence** — `CLAUDE.md` e `README.md` agora marcam `POST /decisao-judicial/nfse` como out-of-scope (backs the Emissor Público Web UI per Guia v1.2 §4.3, não é uma API de contribuinte). README ganhou seção "Backlog" para os dois endpoints ainda worth-wrapping antes de 1.0.

### Tests

- Regression para `TSMotivo` minLength=15 em `cancelar`/`substituir`.
- Regression para os novos enums em `parse-event.test.ts` (confirmação/rejeição/ofício).
- Existing tests com `xMotivo` curtos (< 15 chars) atualizados para passar o novo gate.

## [0.7.2] — 2026-04-20

Correções guiadas pela auditoria v1.2 contra o Manual do Contribuinte + XSDs RTC v1.01. Cobertura de eventos completa, classificação de erros mais precisa, dois endpoints novos para reconciliação, sem quebra de API pública.

### Added

- **Cobertura completa de tipos de evento no parser.** `TipoEventoNfse` agora tem as 16 entradas do `TSTipoEvento` (era só 5). `parseEventoXml` parseia todos os tipos definidos em `tiposEventos_v1.01.xsd`: cancelamento (101101, 105102), análise fiscal (101103, 105104, 105105), confirmações P/T/I e tácita (202201, 203202, 204203, 205204), rejeições P/T/I (202205, 203206, 204207), anulação de rejeição (205208), e eventos por ofício (305101, 305102, 305103). `DetalheEvento` ganhou uma variante fallback `{ unknown: { elementName, tipoEvento, raw } }` para tipos futuros. **Antes:** `fetchByNsu` quebraria ao distribuir qualquer evento fora de 101101/105102 — a nota do prestador ficava invisível quando o tomador confirmava.
- **`NfseClient.fetchDpsStatus(idDps)`** e **`NfseClient.existsDpsStatus(idDps)`** — wrappers para `GET /dps/{id}` e `HEAD /dps/{id}`. Uso primário: reconciliação pós-timeout. Quando um `emitir()` não retornou e você persistiu o `idDps`, essas chamadas revelam se a Receita chegou a gerar a NFS-e — evita reemissão duplicada.
- **`validatePedRegEventoXml(xml)`** e **`validateEventoXml(xml)`** — valida pedRegEvento / evento contra os XSDs correspondentes. Paridade com `validateDpsXml`.
- **`RuleViolationError`** — classe concreta para violações de regra de negócio locais (Manual v1.2 / Anexo I), com campo `rule` opcional (e.g., `'E0078'`). Herda de `ValidationError`.
- **`InvalidIdDpsError`** — separado de `InvalidDpsIdParamError` (que cobre params do `buildDpsId`). Usado quando o `idDps` completo está fora do pattern `DPS\d{42}`.
- **`InfoEventoRejeicao` e `InfoEventoAnulacaoRejeicao`** — types exportados para narrow dos eventos de rejeição (202205/203206/204207/205208).
- **`HttpClient.head(path)`** — método para requests HEAD, usado por `existsDpsStatus`.

### Changed

- **`defaultIsTransient` agora classifica `E1217` e `E1206` como transientes.** Per Anexo I: `E1217` ("Serviço paralisado para manutenção") e `E1206` ("Certificado de Transmissão — Erro de acesso a LCR") são os únicos dois códigos de rejeição que são genuinamente intermitentes — antes iam para o caller como falha dura, agora vão para o `RetryStore` e são retentados pelo cron.
- **Pré-check de `cMotivo=99` em `cancelar()` e `substituir()`** (rule E0078). Se `cMotivo=99` com `xMotivo` ausente ou whitespace-only, lança `RuleViolationError` antes de ir para a rede — evita queima de `nDPS` num emit que seria rejeitado pelo SEFIN.

### Fixed

- `parseEventoXml` lançava `InvalidXmlError('evento sem detalhe reconhecido')` em qualquer tipo de evento diferente de 101101/105102, quebrando `fetchByNsu` para NFS-e onde o tomador confirmou ou rejeitou a nota.

### Tests

- Testes para cada novo tipo de evento parseado (confirmação, rejeição, ofício, fallback unknown).
- Testes para classificação transiente de `E1217`/`E1206`.
- Testes para pré-check E0078 em `cancelar` e `substituir`.
- Testes validando XSD contra DPS assinada (regression guard para xml-crypto) e contra pedRegEvento assinado (101101 e 105102).
- Testes para `fetchDpsStatus` (happy path + validação de formato do idDps).

### Docs

- `docs/guide/consultar.md` — nota sobre **NSU ser por município-ator** (Anexo IV): a mesma NFS-e gera múltiplos NSUs, CNPJ matriz não vê eventos roteados para filial.
- `docs/guide/substituir-cancelar.md` — regras de prazo municipal (E0050/E0822), precheck E0078, seção sobre transient codes E1217/E1206.
- `docs/guide/parametros.md` — avisos de cache curta para município suspenso (E2003/E2004) e IM potencialmente revogada (E0023/E0025).
- `docs/guide/emitir.md` — nota sobre IBS/CBS só a partir de `dCompet ≥ 2026-01-01` (E0850); seção "Reconciliação pós-timeout" com `fetchDpsStatus` e `existsDpsStatus`.
- `docs/guide/erros.md` — hierarquia atualizada com `InvalidIdDpsError` + `RuleViolationError`; seção explícita sobre o classificador transiente/permanente.
- `README.md` — seção "Escopo explícito" listando o que é suportado, o que é out-of-scope (CNC, decisão judicial, emissão de eventos não-cancelamento, POSTs admin de parâmetros).

## [0.7.1] — 2026-04-17

Endurecimento pós-auditoria interna (race conditions, validação de input, caps defensivos) + reescrita completa da documentação. Nenhuma quebra de API pública.

### Added

- `ClientClosedError` exportado da raiz — lançado quando qualquer método é chamado em um `NfseClient` após `close()`. Cliente é single-shot; instancie um novo para reconectar.
- `NfseClient` agora é **race-safe** na primeira chamada: `ensureState()` cacheia o promise em voo, evitando que chamadas concorrentes construam dois `Agent` mTLS e vazem o primeiro.
- `close()` agora é **idempotente** e **mid-flight-safe**: chamar durante um `ensureState()` em voo dispara `ClientClosedError` e libera o dispatcher recém-construído sem vazar.
- **Reescrita completa da documentação**: nova landing `docs/index.md` sem hero, novo `api-cheatsheet.md` (1 linha por API pública, 222 linhas), sidebar com seção "Referência". Guides compactados: `principios.md` −68%, `erros.md` −50%, `substituir-cancelar.md` −53%, `emitir.md` −43%, `integracao.md` −42%. README cortado de 312 → 137 linhas.

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