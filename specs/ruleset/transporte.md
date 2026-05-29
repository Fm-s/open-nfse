> **Proveniência:** Anexo I (SEFIN_ADN — DPS/NFS-e) v1.01 20260209 + Anexo II (PedRegEvt/Evt) v1.01 20260122 + Manual dos Contribuintes — APIs ADN v1.0 (12/02/2026) + Manual dos Contribuintes — APIs Emissor Público Nacional (Sefin Nacional) v1.0 (17/03/2025) + OpenAPI capturados em Produção Restrita (`specs/sefin-nacional.openapi.json`, `specs/adn-contribuinte.openapi.json`, `specs/adn-danfse.openapi.json`, `specs/adn-parametrizacao.openapi.json`). Regras de rejeição extraídas em `specs/ruleset/emissao.regras.json` e `specs/ruleset/eventos.regras.json`.

# Transporte / protocolo — como enviar e receber (foco no contribuinte)

## TL;DR

- A API NFS-e Padrão Nacional vive em **dois hosts/serviços distintos com contratos de fio diferentes** — nunca os unifique:
  - **SEFIN Nacional** (`endpoints.sefin`) — **escrita e leitura síncronas**: emissão (`POST /nfse`), consulta por chave (`GET /nfse/{chaveAcesso}`), consulta de DPS (`GET`/`HEAD /dps/{id}`), recepção de eventos (`POST /nfse/{chaveAcesso}/eventos`). Wire-format **camelCase** + `tipoAmbiente` **inteiro** (1=Produção, 2=Homologação).
  - **ADN** (Ambiente de Dados Nacional) — **distribuição/consulta histórica e artefatos**: distribuição por NSU (`GET /DFe/{NSU}`), eventos por chave (`GET /NFSe/{ChaveAcesso}/Eventos`), DANFSe (`GET /{chaveAcesso}`), parâmetros municipais. Wire-format **PascalCase** + `TipoAmbiente` **string** (`"PRODUCAO"`/`"HOMOLOGACAO"`).
- Protocolo comum: **mTLS** (níveis de TLS diferem por host — **SEFIN** declara "TLS 1.0, TLS 1.1 e TLS 1.2 com autenticação mútua"; **ADN** declara "TLS 1.2 ou superior com autenticação mútua") com certificado **ICP-Brasil A1/A3 "Autenticação Cliente"**, mensagens **JSON / UTF-8**, documentos fiscais em **XML 1.0** assinados em **XMLDSIG**, e o XML trafega **GZip + base64** (campos `*XmlGZipB64`). Fonte: blocos `info.description` de `specs/sefin-nacional.openapi.json` e `specs/adn-contribuinte.openapi.json`.
- **Force HTTP/1.1 no SEFIN** (rejeita HTTP/2 em paths autenticados) — ver CLAUDE.md "Architecture" e `docs/guide/ambientes.md` §"mTLS e HTTP/1.1".
- **Vários 400/404 carregam corpo de negócio**, não são erros de transporte: a rejeição real vem no corpo (ADN: `StatusProcessamento`; SEFIN POST: `NFSePostResponseErro.erros`). Trate-os com `acceptedStatuses` (a lib usa `[400, 404]` no `fetchByNsu`).

> A digestão das tabelas completas (campos, regras, sequência de eventos) está nos JSON irmãos. Este documento é o mapa de transporte + as regras críticas + ponteiros para o JSON.

---

## 1. Os dois hosts / base URLs

| Serviço | `Ambiente.*` | Host Produção Restrita | Host Produção | Wire-format |
|---|---|---|---|---|
| **SEFIN Nacional** | `endpoints.sefin` | `sefin.producaorestrita.nfse.gov.br/SefinNacional` | `sefin.nfse.gov.br/SefinNacional` | camelCase, `tipoAmbiente:int` |
| **ADN Contribuintes** | `endpoints.adn` | `adn.producaorestrita.nfse.gov.br/contribuintes` | `adn.nfse.gov.br/contribuintes` | PascalCase, `TipoAmbiente:string` |
| **ADN DANFSe** | `endpoints.danfse` | `adn.producaorestrita.nfse.gov.br/danfse` | `adn.nfse.gov.br/danfse` | PascalCase |
| **ADN Parâmetros Municipais** | `endpoints.parametrosMunicipais` | `adn.producaorestrita.nfse.gov.br/parametrizacao` | `adn.nfse.gov.br/parametrizacao` | PascalCase |

Hosts conforme `docs/guide/ambientes.md` (conhecimento já validado pelo mantenedor). Os manuais e Swagger UIs de Produção Restrita confirmam o roteamento ADN: o `GET /DANFSe` e o `GET /ParametrosMunicipais` antigos no SEFIN respondem **501 "Este serviço foi movido"** (`specs/sefin-nacional.openapi.json`, operations `DANFSe_Get`, `ParametrosMunicipais_Get`) — DANFSe e parâmetros migraram para o ADN.

> **Invariante:** SEFIN e ADN são contratos genuinamente diferentes. A camada HTTP não conhece semântica NFS-e; cada módulo mantém seu wire-format privado e os DTOs públicos normalizam para uma convenção única (ver CLAUDE.md).

---

## 2. Endpoints (catálogo de transporte)

Legenda cobertura: ✅ embrulhado pela lib · ⏳ backlog · ❌ fora de escopo do contribuinte.

| Método | Caminho | Serviço | O que faz | Cobertura |
|---|---|---|---|---|
| `POST` | `/nfse` | SEFIN | Recepciona a **DPS assinada** e **gera a NFS-e de forma síncrona** | ✅ `emitir`/`emitirDpsPronta`/`emitirEmLote` |
| `GET` | `/nfse/{chaveAcesso}` | SEFIN | Consulta NFS-e pela chave de acesso (50 posições) | ✅ `fetchByChave` |
| `GET` | `/dps/{id}` | SEFIN | Retorna a **chave de acesso** da NFS-e a partir do `Id` da DPS (só se o cert. for Prestador/Tomador/Intermediário da nota) | ✅ `fetchDpsStatus` |
| `HEAD` | `/dps/{id}` | SEFIN | Informa **se** uma NFS-e foi gerada para o `Id` da DPS (qualquer cert. válido) | ✅ `fetchDpsStatus` |
| `POST` | `/nfse/{chaveAcesso}/eventos` | SEFIN | Recepciona o **Pedido de Registro de Evento** (síncrono); gera o evento vinculado à NFS-e | ✅ `cancelar`/`substituir`/`postEvento`/`replayPendingEvents` |
| `GET` | `/nfse/{chaveAcesso}/eventos` | SEFIN | Consulta **todos** os eventos vinculados à chave | ⏳ |
| `GET` | `/nfse/{chaveAcesso}/eventos/{tipoEvento}` | SEFIN | Consulta eventos por chave + tipo | ⏳ |
| `GET` | `/nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}` | SEFIN | Consulta um evento específico (chave+tipo+seq) | ⏳ |
| `GET` | `/DFe/{NSU}` | ADN Contribuintes | Distribuição: retorna o DF-e associado ao NSU (cursor por CPF/CNPJ). Query: `cnpjConsulta`, `lote` | ✅ `fetchByNsu` |
| `GET` | `/NFSe/{ChaveAcesso}/Eventos` | ADN Contribuintes | Retorna os DF-e do tipo Evento vinculados à chave | ⏳ |
| `GET` | `/{chaveAcesso}` (host `/danfse`) | ADN DANFSe | Retorna o **PDF** do DANFSe | ✅ `consultarDanfse`/`gerarDanfse` online |
| `GET` | `/{cMun}/{cServ}/{competencia}/aliquota` (+8) | ADN Parâmetros | Alíquotas, benefícios, convênio, regimes especiais, retenções, históricos | ✅ `consultar*` (6 métodos) |
| `POST` | `/decisao-judicial/nfse` | SEFIN | Recepção de NFS-e por decisão judicial (backs o Emissor Público Web) | ❌ não é API de contribuinte |

Fontes: `specs/sefin-nacional.openapi.json` (paths e operationIds), `specs/adn-contribuinte.openapi.json`, `specs/adn-danfse.openapi.json`, `specs/adn-parametrizacao.openapi.json`; descrições funcionais no Manual Emissor Público §1.3–1.5 e Manual ADN §1.1.1. **Ressalva:** das três consultas de evento no SEFIN, o `specs/sefin-nacional.openapi.json` traz **apenas** a variante de 3 parâmetros `GET /nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}` (op `Eventos_Get`); as formas de 1 e 2 parâmetros constam só no Manual Emissor Público §1.5.2 b/c, não no OpenAPI.

### O `Id` da DPS (parâmetro de `/dps/{id}`)

Concatenação de **42 dígitos** após o literal `"DPS"` (45 caracteres no total; pattern `DPS[0-9]{42}`, `maxLength=45` em `schemas/1.01/tiposSimples_v1.01.xsd` → `TSIdDPS`) — Manual Emissor Público §1.4.1; regra **E0004**, fonte `AnexoI!RN DPS_NFS-e:r142`:

```
"DPS" + Cód.Mun.Emi.(7) + Tipo Inscr. Federal(1) + Inscr. Federal(14, CPF completado com 000 à esquerda) + Série DPS(5) + Núm. DPS(15)
```

Por sigilo fiscal, o `GET /dps/{id}` **só devolve a chave** se o cert. da conexão for um ator (Prestador/Tomador/Intermediário) que conste na NFS-e; senão a solicitação é negada. O `HEAD` apenas confirma existência e atende qualquer cert. válido.

---

## 3. Envelope / serialização

### Padrões de fio (ambos os hosts)
- **Mensagens**: JSON, UTF-8.
- **Documentos fiscais**: XML 1.0 assinado em XMLDSIG.
- **Compactação do XML dentro do JSON**: **GZip → base64binary**. Os campos terminam em `XmlGZipB64` / `GZipB64`.

### SEFIN — emissão `POST /nfse` (síncrono)
Schemas em `specs/sefin-nacional.openapi.json`:

| Sentido | Schema | Campos relevantes |
|---|---|---|
| **Request** | `NFSePostRequest` | `dpsXmlGZipB64` — a DPS **assinada** (XMLDSig em `infDPS`), gzip+base64. **Não há "lote" no POST /nfse**: é 1 DPS por requisição. |
| **201 sucesso** | `NFSePostResponseSucesso` | `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `idDps`, `chaveAcesso`, `nfseXmlGZipB64` (a NFS-e gerada), `alertas[]` |
| **400 rejeição** | `NFSePostResponseErro` | `idDPS`, `erros[]` (cada item ≈ `MensagemProcessamento`: `codigo`/`descricao`/`complemento`) |

> **"Lote" no contexto desta lib é orquestração do cliente**, não do servidor: `emitirEmLote` faz N chamadas concorrentes a `POST /nfse`. O servidor SEFIN é estritamente síncrono e 1-DPS-por-request.

### SEFIN — eventos `POST /nfse/{chaveAcesso}/eventos`
- **Request** `EventosPostRequest`: `pedidoRegistroEventoXmlGZipB64` — o `pedRegEvento` **assinado**, gzip+base64.
- **201** `EventosPostResponseSucesso`: cabeçalho + `eventoXmlGZipB64` (o evento gerado).
- Erro segue o mesmo padrão `MensagemProcessamento` (`ResponseErro.erro`).

### ADN — distribuição `GET /DFe/{NSU}`
Resposta `LoteDistribuicaoNSUResponse` (PascalCase) em `specs/adn-contribuinte.openapi.json`:
`StatusProcessamento` (enum), `LoteDFe[]` (itens `DistribuicaoNSU`: `NSU`, `ChaveAcesso`, `TipoDocumento`, `TipoEvento`, `ArquivoXml`, `DataHoraGeracao`), `Alertas[]`, `Erros[]`, `TipoAmbiente`, `VersaoAplicativo`, `DataHoraProcessamento`.

### Caso crítico: **4xx que carregam corpo de negócio**
- **ADN `/DFe/{NSU}`** responde **400** (rejeição) e **404** ("nenhum documento localizado") **com o corpo completo** `LoteDistribuicaoNSUResponse`. O status verdadeiro está em `body.StatusProcessamento` ∈ {`REJEICAO`, `NENHUM_DOCUMENTO_LOCALIZADO`, `DOCUMENTOS_LOCALIZADOS`}. **Não são erros HTTP.** A lib passa `acceptedStatuses: [400, 404]` para bypassar `mapStatusError` e parsear normalmente (CLAUDE.md; `specs/adn-contribuinte.openapi.json` responses 400/404 → `LoteDistribuicaoNSUResponse`).
- **SEFIN `POST /nfse`** responde **400** com `NFSePostResponseErro` quando a DPS viola regra de negócio — mesmo padrão, use `acceptedStatuses: [400]`. **403** = certificado de transmissão inválido; **500** = falha no processamento (`specs/sefin-nacional.openapi.json`, op `NFSe_Post`).

---

## 4. Assinatura XMLDSIG

O padrão é **XMLDSIG** (`https://www.w3.org/TR/xmldsig-core/`), declarado nos blocos `info.description` de ambos os OpenAPI. A assinatura faz parte do XML do documento (envelope `enveloped`), não do JSON.

### Onde a assinatura entra (por documento)

| Documento | Elemento assinado (`Reference URI = #<Id>`) | XSD raiz | Schema da assinatura |
|---|---|---|---|
| **DPS** | `infDPS` (atributo `Id`) | `schemas/1.01/DPS_v1.01.xsd` → `TCDPS` | importa `xmldsig-core-schema.xsd` via `tiposComplexos_v1.01.xsd` (`<xs:element ref="ds:Signature"/>`) |
| **NFS-e** (lado município/Sefin) | `NFSe`/`infNFSe` | `schemas/1.01/NFSe_v1.01.xsd` | idem |
| **Pedido de Registro de Evento** | `infPedReg` | `schemas/1.01/pedRegEvento_v1.01.xsd` → `TCPedRegEvt` | idem |
| **Evento** (gerado) | `infEvento` | `schemas/1.01/evento_v1.01.xsd` | `tiposEventos_v1.01.xsd` |

### Requisitos de algoritmo
Os XSDs apenas **importam** o `ds:Signature` genérico (`xmldsig-core-schema.xsd` traz `CanonicalizationMethod`, `SignatureMethod`, `Transform`, `DigestMethod` sem fixar valores). Os manuais de contribuinte lidos remetem ao spec XMLDSIG sem cravar os algoritmos. **Os algoritmos concretos não estão pinados no manual — (verificar na fonte / NT).**

A **implementação da lib** (`src/xml/sign.ts`, validada pelo mantenedor) usa, e é o que o SEFIN aceita em Produção Restrita:
- `SignatureMethod` = `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` (RSA-SHA256)
- `CanonicalizationMethod` = `http://www.w3.org/2001/10/xml-exc-c14n#` (exclusive C14N)
- `DigestMethod` = `http://www.w3.org/2001/04/xmlenc#sha256` (SHA-256)
- `Transforms` = enveloped-signature + exc-c14n
- `Reference URI` = `#<Id do elemento assinado>`; `<Signature>` adicionado como **último filho** do elemento raiz.

### Regras de rejeição de assinatura (faithful ao JSON)
Da `specs/ruleset/emissao.regras.json` (bloco `negocio`) e `specs/ruleset/eventos.regras.json`:

| codErro | Documento / caminho | Regra | Fonte |
|---|---|---|---|
| **E0714** | DPS `/Signature` | A assinatura da DPS deve ser válida | `AnexoI!RN DPS_NFS-e:r645` |
| **E0715** | DPS `/Signature` | Certificado da assinatura inválido (validade/cadeia/revogação/LCR) | `…:r646` |
| **E0716** | DPS `/Signature` | Cert. fora do padrão (versão≠3, BasicConstraint, KeyUsage 'Assinatura Digital'+'Não Recusa', OID CNPJ 2.16.76.1.3.3 / CPF 2.16.76.1.3.1, raiz ICP-Brasil) | `…:r647` |
| **E0717** | DPS `/Signature` | Assinatura obrigatória ao enviar para o Web Service | `…:r648` |
| **E0718** | DPS `/Signature` | A assinatura deve ser feita com o cert. do **emitente da DPS** | `…:r649` |
| **E1630/E1632/E1634/E1636/E1638** | NFS-e `/Signature` | Equivalentes para a NFS-e (E1638: cert. do **município emissor**) | `…:r650–r654` |
| **E1980/E1983/E1986/E1989/E1991** | `pedRegEvento/Signature` | Assinatura do PRE válida / cert. válido / padrão / obrigatória / cert. do **emitente do PRE** | `AnexoII!RN EVENTO_PED.REG.EVENTO:r102–r106` |
| **E2020/E2023/E2026/E2029/E2032** | `evento/Signature` | Equivalentes para o Evento gerado (cert. do município emissor) | `…:r107–r111` |

> **Invariante da lib (não reintroduzir bug v0.7.2):** todo `PendingEvent.xmlAssinado` deve estar **assinado antes de persistir**. `cancelar`/`substituir` assinam up-front e passam `xmlJaAssinado: true` ao `postEvento`. Replay de dados legados não-assinados re-assina antes do POST (CLAUDE.md).

---

## 5. Fluxo síncrono de emissão e tratamento de status

`POST /nfse` é **síncrono**: a API valida a DPS (recepção → negócio), e ou **rejeita** (mensagem com motivo) ou **gera a NFS-e** e devolve o XML (Manual Emissor Público §1.3.2 a).

**Pipeline de validação (ordem)** — a camada de **recepção/transporte** roda antes das regras de negócio. `specs/ruleset/emissao.regras.json` → `recepcao` (16 linhas, fonte `AnexoI!RN_RECEPCAO_DPS`):

| codErro | Falha de transporte | Fonte |
|---|---|---|
| **E1200** | Certificado de Transmissor inválido (inexistente / versão≠3 / BasicConstraint / KeyUsage sem "Autenticação Cliente") | `…RN_RECEPCAO_DPS:r3` |
| **E1203** | Certificado de Transmissão expirado | `…:r4` |
| **E1205** | Erro na cadeia de certificação (AC não cadastrada/revogada) | `…:r5` |
| **E1206** | Erro de acesso à LCR (CRL DistributionPoint ausente/indisponível/inválida) | `…:r6` |
| **E1207** | Certificado do Transmissor revogado | `…:r7` |
| **E1208** | Cert. raiz difere de ICP-Brasil | `…:r8` |
| **E1209** | Falta extensão CNPJ/CPF no cert. (OtherName OID 2.16.76.1.3.3) | `…:r9` |
| **E1225** | Falha na decodificação base64 da área de dados | `…:r11` |
| **E1226** | Estrutura descompactada (gzip) mal formada | `…:r12` |
| **E1242** | Tipo de DF-e não tratado pelo Sistema Nacional | `…:r14` |
| **E1228** | Prefixo de namespace não permitido na área descompactada | `…:r15` |
| **E1229** | XML não está em UTF-8 | `…:r16` |
| **E1235** | Falha no esquema XML (XSD) do DF-e | `…:r17` |

Em seguida vêm as **440 regras de negócio** (`emissao.regras.json` → `negocio`). Críticas de transporte/identidade:

| codErro | Campo | Regra | Fonte |
|---|---|---|---|
| **E0001** | `versao` (DPS) | Prazo da versão do leiaute da DPS expirou | `AnexoI!RN DPS_NFS-e:r140` |
| **E1260** | `versao` (NFS-e) | Prazo da versão do leiaute da NFS-e expirou | `…:r5` |
| **E0004** | `Id` (infDPS) | `Id` difere da concatenação `"DPS"+cMun+tpInsc+inscr+série+núm` | `…:r142` |
| **E1263** | `Id` (infNFSe) | `Id` da NFS-e difere de `"NFS"+cMun(7)+ambGer(1)+tpInsc(1)+inscr(14)+nNFSe(13)+anoMês(4)+cNum(9)+DV(1)` | `…:r7` |
| **E1268** | `Id` (infNFSe) | Chave de acesso já compartilhada no ADN (duplicidade) | `…:r8` |
| **E9996** | `tpEmit` | Nesta versão **não** é permitida emissão pelo tomador/intermediário (tpEmit=2/3) | `…:r157` |

**Mapeamento de status HTTP (SEFIN `POST /nfse`)** — `specs/sefin-nacional.openapi.json`:
- **201** = NFS-e criada (`NFSePostResponseSucesso`).
- **400** = rejeição de negócio **com corpo** `NFSePostResponseErro` (use `acceptedStatuses:[400]`; **não** é erro de transporte).
- **403** = certificado de transmissão inválido/fora do padrão.
- **500** = falha no processamento do DPS.

### Retry-After / 429
**Os manuais de contribuinte lidos e os OpenAPI capturados não documentam 429 nem `Retry-After`. (verificar na fonte.)** A lib trata 429 defensivamente assim mesmo (v0.8.0): `TooManyRequestsError` é classificado como transiente, persistido em `RetryStore` com `notBefore` derivado de `Retry-After` (delta-seconds ou HTTP-date, decimais via `Math.ceil`, sinais rejeitados; clamp em `maxRetryAfterMs`). Ver CLAUDE.md "v0.8.0" e §"Retry-After parsing".

---

## 6. Distribuição por NSU (`GET /DFe/{NSU}`)

Cursor **incremental por CPF/CNPJ**: o contribuinte consulta documentos em que figure como **emitente, tomador ou intermediário** (Manual ADN §1.1). O NSU (Número Sequencial Único) é monotônico por contribuinte.

**Avanço do cursor:** informe o `{NSU}` no path (o último já processado) e o sistema retorna o(s) DF-e seguinte(s). Cada item de `LoteDFe[]` (`DistribuicaoNSU`) traz seu próprio `NSU`; o consumidor avança para o **maior `NSU` retornado** e repete até esgotar. (Persistência do cursor é responsabilidade do consumidor — a lib não guarda estado.)

**Parâmetros de query** (`specs/adn-contribuinte.openapi.json`):
- `cnpjConsulta` (opcional) — permite consultar com um certificado cujo **CNPJ Raiz** seja o mesmo do contribuinte-alvo; o ADN valida o CNPJ Raiz entre o parâmetro e o cert. (Manual ADN §1.1).
- `lote` (boolean, opcional) — solicita retorno em lote.

**`StatusProcessamento`** (`StatusProcessamentoDistribuicao`):
- `DOCUMENTOS_LOCALIZADOS` (geralmente 200) — há DF-e.
- `NENHUM_DOCUMENTO_LOCALIZADO` — chega com **HTTP 404 + corpo completo**; significa "fim da fila", não erro.
- `REJEICAO` — chega com **HTTP 400 + corpo completo**; o motivo está em `Erros[]`.

`fetchByNsu` usa `acceptedStatuses: [400, 404]` para que esses casos sejam parseados, e nunca lançados como erro HTTP.

**Tipos nos itens** (`DistribuicaoNSU`): `TipoDocumento` ∈ {`NENHUM`, `DPS`, `PEDIDO_REGISTRO_EVENTO`, `NFSE`, `EVENTO`, `CNC`}; `TipoEvento` ∈ enum de 18 valores (`CANCELAMENTO`, `CONFIRMACAO_PRESTADOR`, …) — ver `specs/adn-contribuinte.openapi.json`.

---

## 7. Tabela de provas

| Afirmação | Prova |
|---|---|
| Dois hosts + camelCase/PascalCase + tipoAmbiente int vs string | CLAUDE.md "Architecture — actual shipped shape"; `docs/guide/ambientes.md` (hosts nas linhas 18–21, nota de wire-format na linha 24) |
| Hosts Produção/Produção Restrita exatos | `docs/guide/ambientes.md` linhas 18–21 |
| Níveis de TLS por host (SEFIN: "TLS 1.0, TLS 1.1 e TLS 1.2 com autenticação mútua"; ADN: "TLS 1.2 ou superior com autenticação mútua"), JSON/UTF-8, XML 1.0, XMLDSIG, GZip+base64, cert A1/A3 ICP-Brasil | `specs/sefin-nacional.openapi.json` e `specs/adn-contribuinte.openapi.json` → `info.description` |
| HTTP/1.1 obrigatório no SEFIN | CLAUDE.md "Force HTTP/1.1"; `docs/guide/ambientes.md` §"mTLS e HTTP/1.1" |
| `POST /nfse` síncrono, request `dpsXmlGZipB64`, sucesso `NFSePostResponseSucesso`, erro `NFSePostResponseErro` | `specs/sefin-nacional.openapi.json` op `NFSe_Post` + schemas; Manual Emissor Público §1.3.2 a |
| `GET`/`HEAD /dps/{id}` e composição do `Id` da DPS | `specs/sefin-nacional.openapi.json` ops `Dps_Get`/`Dps_Head`; Manual Emissor Público §1.4.1; regra **E0004** (`emissao.regras.json`, `AnexoI!RN DPS_NFS-e:r142`) |
| Sequência de transação de evento (4 passos) e `POST .../eventos` request `pedidoRegistroEventoXmlGZipB64` | Manual Emissor Público §1.5; `specs/sefin-nacional.openapi.json` op `Eventos_Post` + `EventosPostRequest` |
| `GET .../eventos/{tipoEvento}/{numSeqEvento}` (consulta de um evento específico no SEFIN) | `specs/sefin-nacional.openapi.json` op `Eventos_Get` (única variante de consulta no spec: as formas de 1 e 2 parâmetros descritas no Manual Emissor Público §1.5.2 b/c **não** constam no OpenAPI) |
| DANFSe e Parâmetros migraram do SEFIN para o ADN (501) | `specs/sefin-nacional.openapi.json` ops `DANFSe_Get`/`ParametrosMunicipais_Get` resp. 501; `specs/adn-danfse.openapi.json`; `specs/adn-parametrizacao.openapi.json` |
| Distribuição por NSU, escopo (emitente/tomador/intermediário), `cnpjConsulta` valida CNPJ Raiz | Manual ADN §1.1 e §1.1.1; `specs/adn-contribuinte.openapi.json` op `GET /DFe/{NSU}` (params `cnpjConsulta`, `lote`) |
| `LoteDistribuicaoNSUResponse` / `DistribuicaoNSU` / enums Status·TipoDocumento·TipoEvento | `specs/adn-contribuinte.openapi.json` `components.schemas` |
| 400/404 carregam corpo (`StatusProcessamento`); `acceptedStatuses:[400,404]` | CLAUDE.md "Some Receita endpoints return 4xx with meaningful bodies"; `specs/adn-contribuinte.openapi.json` responses 400/404 → `LoteDistribuicaoNSUResponse` |
| Regras de recepção/transporte (E1200…E1235) | `specs/ruleset/emissao.regras.json` → `recepcao`; fonte `AnexoI!RN_RECEPCAO_DPS:r3–r17` |
| Regras de assinatura DPS/NFS-e/evento (E0714–E0718, E1630–E1638, E1980–E1991, E2020–E2032) | `specs/ruleset/emissao.regras.json` `negocio` (`AnexoI!RN DPS_NFS-e:r645–r654`); `specs/ruleset/eventos.regras.json` (`AnexoII!RN EVENTO_PED.REG.EVENTO:r102–r111`) |
| `Id` da NFS-e (E1263) e duplicidade (E1268) | `specs/ruleset/emissao.regras.json` `AnexoI!RN DPS_NFS-e:r7`, `:r8` |
| `Id` do PRE = `"PRE"+chave(50)+codEvento(6)`; `Id` do EVT = `"EVT"+idPRE(56)+nSeqEvento(3)` | `specs/ruleset/eventos.regras.json` **E1827** (`AnexoII!…:r18`), **E1802** (`…:r7`) |
| Algoritmos XMLDSIG concretos (RSA-SHA256 / exc-c14n / SHA-256) | **Não pinados pelo manual (verificar na fonte/NT)** — implementação da lib em `src/xml/sign.ts` / `src/nfse/sign-xml.ts` |
| 429 / `Retry-After` | **Não documentado nos manuais/OpenAPI lidos (verificar na fonte)** — tratamento defensivo da lib em CLAUDE.md "v0.8.0" |
