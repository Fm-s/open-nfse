> **Fonte:** Anexo I (SEFIN/ADN — DPS/NFS-e, v1.01, `anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx`) + Anexo C (Código Indicador de Operação — IndOp, v1.01 2026-01-22). Dados machine-readable nos JSONs citados; este `.md` é o índice narrativo. Quando este texto e a doc do repo divergirem, **a fonte oficial prevalece**.

# Tributação na NFS-e — ISSQN + IBS/CBS (Reforma Tributária)

## TL;DR

Na NFS-e Padrão Nacional convivem **dois mundos tributários** durante a transição 2026–2033 (LC 214/2025):

1. **ISSQN municipal** (LC 116/2003) — vive em `valores/trib/tribMun`. Local de incidência (LI) determinado pela aba **MUN.INCID** (por `cTribNac`) e pela tabela de **exportação** (por endereços + resposta do emitente).
2. **IBS/CBS federal/RTC** (Reforma Tributária) — vive no bloco **opcional** `infDPS/IBSCBS`. Identifica a operação via **`cIndOp`** (Anexo C) e classifica via **`CST` (3 díg.) + `cClassTrib` (6 díg.)**. Tributos por fora; alíquotas/valores conferidos contra a **Calculadora** do sistema.

Pontos de atenção para um agente:

- O bloco `infDPS/IBSCBS` é **all-or-nothing** entre DPS e NFS-e: se informado na DPS, é obrigatório na NFS-e (**E1515**); se ausente na DPS, é proibido na NFS-e (**E1517**).
- A **maioria** das alíquotas/valores IBS/CBS **não é validada offline** — o sistema recalcula e rejeita se divergir (E1539, E1556, E1568, E1582…). A lib não substitui a Calculadora.
- O LI do ISSQN e a qualificação de exportação são **decisões do servidor**: o emitente declara `tribISSQN` e endereços; o sistema valida contra MUN.INCID e a planilha de exportação (E0529 bloqueia exportação indevida).

Tabelas completas (não duplicadas aqui):
- `specs/ruleset/tributos.indop.json` — 26 indicadores `cIndOp` + 4 notas de rodapé.
- `specs/ruleset/_raw/anexoI.mun-incid-info-serv.json` — ~337 serviços × regra de LI do ISSQN.
- `specs/ruleset/_raw/anexoI.exportacao-emissao.json` — 112 cenários de exportação.
- `specs/ruleset/emissao.campos.json` — leiaute (campos/tipos/ocorrência/tamanho).
- `specs/ruleset/emissao.regras.json` (`negocio`) — regras de negócio por `codErro`.

---

## 1. Modelo tributário na DPS — visão geral

| Tributo | Esfera | Onde vive no leiaute | Status na transição |
|---|---|---|---|
| **ISSQN** | Municipal (LC 116/03) | `infDPS/valores/trib/tribMun` | Vigente; em extinção gradual até 2033 |
| **PIS/COFINS** | Federal | `infDPS/valores/trib/tribFed/piscofins` | Tributos federais "antigos" |
| **IBS/CBS** | UF + Município (IBS) / União (CBS) | `infDPS/IBSCBS/...` (bloco **opcional**) | RTC — novo, convive com ISSQN |
| **Total aproximado** | Lei 12.741/2012 | `infDPS/valores/trib/totTrib` | Sempre presente (`totTrib` occ=1-1) |

O `tribMun` (ISSQN) é **obrigatório** (`occ=1-1`, `LEIAUTE DPS_NFS-e:r300`); `tribFed` é opcional (`occ=0-1`, `:r313`); o bloco `IBSCBS` é opcional e dispara as regras RTC quando presente.

---

## 2. Onde os tributos vivem no leiaute (caminhos reais)

Caminhos confirmados em `emissao.campos.json` (coluna `caminho`). XSD correspondente em `schemas/1.01/tiposComplexos_v1.01.xsd`.

### 2.1 ISSQN + federais + totais — `infDPS/valores/trib`

| Caminho | Campo | tipo/tam | Fonte | XSD |
|---|---|---|---|---|
| `.../valores/trib/tribMun/` | `tribISSQN` | N(1) | `LEIAUTE:r301` | `TCTribMunicipal` |
| `.../valores/trib/tribMun/` | `tpRetISSQN` | N(1) | `:r311` | `TCTribMunicipal` |
| `.../valores/trib/tribMun/` | `pAliq` | N(1V2) | `:r312` | `TCTribMunicipal` |
| `.../valores/trib/tribFed/piscofins/` | `CST` | N(2) | `:r315` | `TCTribOutrosPisCofins` |
| `.../valores/trib/totTrib/` | `vTotTrib` (→ `vTotTribFed/Est/Mun`) | grupo | `:r326-329` | `TCTribTotal`/`TCTribTotalMonet` |
| `.../valores/trib/totTrib/` | `pTotTrib` (→ `pTotTribFed/Est/Mun`) | grupo | `:r330-333` | `TCTribTotalPercent` |
| `.../valores/trib/totTrib/` | `indTotTrib` | N(1) | `:r334` | `TCTribTotal` |
| `.../valores/trib/totTrib/` | `pTotTribSN` | N(1-2V2) | `:r335` | `TCTribTotal` |

`tribMun`/`tribFed`/`totTrib` agregam-se em `TCTribTotal` / `TCInfoTributacao`.

### 2.2 IBS/CBS — bloco RTC `infDPS/IBSCBS`

Campos de **cabeçalho** do bloco (`infDPS/IBSCBS/`):

| Campo | tipo/tam | Significado | Fonte |
|---|---|---|---|
| `cIndOp` | N(6) | Código indicador da operação (Anexo C → §4) | `LEIAUTE:r339` |
| `indDest` | N(1) | `0` = destinatário é o próprio tomador/adquirente; `1` = destinatário ≠ adquirente | `:r344` |

Grupo de **valores/tributos** `infDPS/IBSCBS/valores/trib/gIBSCBS/` (`TCRTCInfoTributosIBSCBS`):

| Campo | tipo/tam | Fonte |
|---|---|---|
| `CST` | N(3) — Código de Situação Tributária do IBS/CBS | `LEIAUTE:r406` |
| `cClassTrib` | N(6) — Código de Classificação Tributária do IBS/CBS | `:r407` |
| `cCredPres` | N(2) — crédito presumido | `:r408` |
| `gTribRegular` → `CSTReg` N(3), `cClassTribReg` N(6) | subgrupo opcional | `:r409-411` (`TCRTCInfoTributosTribRegular`) |
| `gDif` → `pDifUF`, `pDifMun`, `pDifCBS` (cada N 1-3V2) | diferimento | `:r412-415` (`TCRTCInfoTributosDif`) |

Outros subgrupos do bloco IBS/CBS (ver `caminho` no JSON): `IBSCBS/dest/` (destinatário, com `end/endNac` ou `end/endExt`), `IBSCBS/imovel/`, `IBSCBS/gRefNFSe/`, `IBSCBS/valores/gReeRepRes/` (reembolso/repasse/ressarcimento, com `documentos/`).

### 2.3 Totais IBS/CBS no nível NFS-e — `infNFSe/IBSCBS`

Preenchido pelo **servidor** (resultado da Calculadora), não pelo emitente:

| Caminho | Campo | tipo/tam | Fonte |
|---|---|---|---|
| `infNFSe/IBSCBS/` | `cLocalidadeIncid` | N(7) — IBGE do local da operação IBS/CBS | `LEIAUTE:r48` |
| `infNFSe/IBSCBS/` | `xLocalidadeIncid` | C(600) | `:r49` |
| `infNFSe/IBSCBS/valores/uf/` | `pIBSUF` | N(1-2V2) | `:r55` |
| `infNFSe/IBSCBS/valores/mun/` | `pIBSMun` | N(1-2V2) | `:r59` |
| `infNFSe/IBSCBS/totCIBS/...` | totais `gIBS`/`gCBS` | grupos | (ver JSON) |

> **Cuidado (separação ISSQN × IBS/CBS):** o **ISSQN** usa `infNFSe/cLocIncid` N(7) + `xLocIncid` C(150) (`LEIAUTE:r9-10`). O **IBS/CBS** usa `infNFSe/IBSCBS/cLocalidadeIncid` N(7) + `xLocalidadeIncid` C(600) (`:r48-49`). São campos distintos — não unificar.

---

## 3. `cClassTrib` / `CST` / `cTribNac` / `cNBS` — papéis e relações

| Código | Escopo | Onde | Tamanho | O que é |
|---|---|---|---|---|
| **`cTribNac`** | ISSQN | `serv/cServ/cTribNac` | N(6) | Código de tributação nacional do ISSQN (LC 116/03). Subitem da Lista Nacional — chave na aba MUN.INCID. `LEIAUTE:r195` |
| **`cTribMun`** | ISSQN | `serv/cServ/cTribMun` | N(3) | Código de tributação municipal. `LEIAUTE:r196` |
| **`cNBS`** | IBS/CBS | `serv/cServ/cNBS` | N(9) | Código NBS v2.0 (Anexo B). `LEIAUTE:r198` |
| **`CST`** (PIS/COFINS) | Federal | `tribFed/piscofins/CST` | N(2) | Situação tributária PIS/COFINS. `LEIAUTE:r315` |
| **`CST`** (IBS/CBS) | IBS/CBS | `IBSCBS/.../gIBSCBS/CST` | N(3) | Situação tributária do IBS e da CBS. `LEIAUTE:r406` |
| **`cClassTrib`** | IBS/CBS | `IBSCBS/.../gIBSCBS/cClassTrib` | N(6) | Classificação tributária do IBS/CBS — define indicadores como `exigeGrupoTributacaoRegular`, redutores, crédito presumido. `LEIAUTE:r407` |

**Relação:** `cTribNac` (ISSQN) ↔ `cNBS` (IBS/CBS) descrevem o mesmo serviço sob duas óticas. O par **`CST`+`cClassTrib`** governa todo o cálculo RTC: o `cClassTrib` carrega flags consultados nos parâmetros que ditam quais subgrupos são obrigatórios.

**Regras de validação por `codErro`** (de `emissao.regras.json` → `negocio`; fonte em `AnexoI!RN DPS_NFS-e`):

| codErro | Campo | Regra (resumo fiel) | nível |
|---|---|---|---|
| **E0310** | `cTribNac` | Código não existe na Lista Nacional de Serviços. | 1 |
| **E0312** | `cTribNac` | Código não administrado pelo município de incidência na competência (exceto MEI). | 3 |
| **E0314** | `cTribMun` | Código municipal inexistente/não administrado na competência (exceto MEI). | 3 |
| **E0315** | `cTribMun` | Proibido informar `000`. | 1 |
| **E0316** | `cNBS` | NBS inexistente na tabela (Anexo B). | 2 |
| **E0322** | `cNBS` | Se bloco `IBSCBS` informado → `cNBS` **obrigatório**. | 2 |
| **E0318 / E0320** | `cNBS` | Permissão de campos NBS condicionada a `tpEmit` (prestador vs tomador/intermediário). | — |
| **E1583** | `gTribRegular` | Não informar se `exigeGrupoTributacaoRegular` do `cClassTrib` = `false`. | 1 |
| **E1584** | `gTribRegular` | Informar se `exigeGrupoTributacaoRegular` do `cClassTrib` = `true`. | 1 |
| **E1600 / E1601** | `gTribCompraGov` | Presença condicionada a `tpEnteGov` (compras governamentais). | 1 |

> A enum literal de valores de `CST`/`cClassTrib` não está expandida em `notas` no JSON (`notas: "-"`); a lista vinculante é a tabela oficial de CST/cClassTrib do IBS/CBS — **(verificar na fonte)** antes de hard-codear valores.

---

## 4. `cIndOp` — Indicador do Local da Operação (Anexo C)

`cIndOp` (`infDPS/IBSCBS/cIndOp`, N(6), `LEIAUTE:r339`) identifica **a operação de fornecimento** e, por consequência, **qual campo do leiaute carrega o local da operação** do IBS/CBS. O sistema valida o `cLocalidadeIncid` (nível NFS-e) contra o `cIndOp` declarado: **E1521** — "código da localidade de incidência deve estar de acordo com o código de indicador da operação (Anexo B); endereço no exterior → `999999`".

Estrutura de cada linha em `tributos.indop.json`: `codIndOp`, `grupo`, `seq`, `tipoOperacao`, `localOperacao`, `localFornecimentoIdentificar`, `campoLeiaute` (caminho que carrega o local), `fonte` (`AnexoC!IndOp:rN`). Dos 30 registros, **26 são códigos reais** e **4 são notas de rodapé** (entradas cujo `codIndOp` é texto explicativo "(1)…(6)" — filtrar por `codIndOp[0].isdigit()`).

### Tabela-resumo dos 26 `cIndOp`

| cIndOp | Operação | Local da operação → campo do leiaute |
|---|---|---|
| 020101 | Operação com bem imóvel/imaterial relacionado a imóvel | Localidade do imóvel → `serv/locPrest/cLocPrestacao` |
| 020201 | Serviço prestado fisicamente sobre bem imóvel | Localidade do imóvel → `serv/locPrest/cLocPrestacao` |
| 020301 | Administração/intermediação de bem imóvel | Localidade do imóvel → `serv/locPrest/cLocPrestacao` |
| 030101 | Serviço físico sobre a pessoa / fruído presencialmente | Estabelecimento do fornecedor → `prest/end/` |
| 030102 | idem | Endereço do adquirente → `toma/end/` ou `IBSCBS/dest/end/` (cond. `indDest`) |
| 030103 | idem | Endereço do destinatário → `IBSCBS/dest/` (incondicional, sem branch `indDest`) |
| 030104 | idem | Endereço diverso → `serv/locPrest/cLocPrestacao` |
| 040101 | Planejamento/organização/administração de feiras, eventos | Local do Evento → `serv/atvEvento/` |
| 050101 | Serviço físico sobre bem móvel material | Estabelecimento do fornecedor → `prest/end/` |
| 050102 | idem | Endereço do adquirente (cond. `indDest`) |
| 050103 | idem | Endereço do destinatário (cond. `indDest`) |
| 050104 | idem | Endereço diverso → `serv/locPrest/cLocPrestacao` |
| 050201 | Serviços portuários | Local da prestação → `serv/locPrest/cLocPrestacao` |
| 060101 | Transporte de passageiros | Local de início do transporte |
| 070101 | Transporte de carga | Endereço fornecido para entrega |
| 070102 | Transporte de carga | Local da retirada |
| 080101 | Exploração de via | Local da prestação (extensão da via, proporcional ao território) — **EXCLUSIVO NFS-e Via** |
| 100101 | Cessão de espaço p/ serviços publicitários (onerosa) | Domicílio principal do adquirente |
| 100102 | idem | Domicílio do destinatário (adquirente no exterior, §8) |
| 100201 | Cessão de espaço publicitário (não onerosa) | Domicílio principal do destinatário |
| 100301 | Demais serviços, operações onerosas | Domicílio principal do adquirente |
| 100302 | idem | Domicílio do destinatário (adquirente no exterior) |
| 100401 | Demais serviços, operações não onerosas | Domicílio principal do destinatário |
| 100501 | Demais bens móveis imateriais/direitos (onerosa) | Domicílio principal do adquirente |
| 100502 | idem | Domicílio do destinatário (adquirente no exterior) |
| 100601 | Demais bens móveis imateriais/direitos (não onerosa) | Domicílio principal do destinatário |

> Vários `campoLeiaute` são **condicionais a `indDest`**: quando `indDest=0` o local é o do tomador (`toma/end…`), quando `indDest=1` é o do destinatário (`IBSCBS/dest/end…`) — o JSON traz esse texto bifurcado no campo `campoLeiaute`. Endereços no exterior usam `…/end/endExt/`. As 4 notas de rodapé (`§2º` imóvel em mais de um município, `§4º` serviço à distância, `§8` adquirente no exterior, `§3º` caracterização do domicílio) detalham os casos limítrofes — ler direto em `tributos.indop.json`.

---

## 5. Local de incidência do ISSQN por serviço — aba MUN.INCID

`_raw/anexoI.mun-incid-info-serv.json` (sheet `MUN.INCID_INFO.SERV.`, ~337 linhas de serviço). Estrutura: `rows[].cells[]` (8 colunas). Chave = **`cTribNac`** (coluna 0).

**Significado das colunas** (cabeçalho nas linhas 1–4):

| col | Cabeçalho | Significado |
|---|---|---|
| 0 | CÓDIGO DE TRIBUTAÇÃO NACIONAL | `cTribNac` (subitem da Lista Nacional) |
| 1 | DESCRIÇÃO DO DESDOBRO NACIONAL | Texto do serviço (LC 116/03) |
| 2 | **EP** | Estabelecimento/Domicílio do **Prestador** (regra geral) |
| 3 | **LP** | **Local da Prestação** |
| 4 | **ET** | Estabelecimento/Domicílio do **Tomador** |
| 5 | **EDEmit** | Estab./Domicílio do **Emitente** — `LI = EDEmit (T\|I)`, usado em **importação** (emitente = tomador/intermediário com país exterior) |
| 6 | OBRIGATORIEDADE DOS GRUPOS | Grupos específicos por subitem (`obra`, `atvEvento`; `comExt` definido na planilha de exportação) |
| 7 | INFORMAÇÕES COMPLEMENTARES | `infoComplem` |

Cada serviço marca com **`X`** a regra de LI aplicável. Distribuição observada nas 337 linhas:

| Combinação (EP, LP, ET, EDEmit) | Qtde | Leitura |
|---|---|---|
| `X · · X` | 277 | LI = **EP** (regra geral); EDEmit para importação |
| `· X · X` | 57 | LI = **LP** (exceção: serviço prestado no local); EDEmit p/ importação |
| `· · X X` | 1 | LI = **ET** |
| `· · · X` | 1 | só importação |
| `· · · ·` | 1 | linha sem marca (verificar na fonte) |

Observações na fonte (col 2/3, nota `*`): exceto o subitem **`200101`**, todos os serviços podem ser prestados em "Águas Marítimas" (`cLocPrestacao = 0000000`) → LI = **EDP**. Para `200101`, LP não pode ser Águas Marítimas e LI = município informado em LP (Art. 3º, §3º LC 116/03) — espelhado em **E1402** (cTribNac `200101` proíbe `cLocPrestacao=0000000`) e na nota de `cTribNac` ("serviço em Águas Marítimas nunca pode ser 20.01").

> Tabela completa serviço-a-serviço em `_raw/anexoI.mun-incid-info-serv.json`. **Não** transcrever aqui — é a fonte das 337 regras de LI.

---

## 6. Exportação de serviços — tabela de decisão

`_raw/anexoI.exportacao-emissao.json` (sheet `EXPORTACAO_EMISSÃO_NFS-e`, **112 cenários** numerados). Cruza os 3 locais declarados × subitem × resposta do emitente → conceito de exportação (ISSQN e RFB) + LI final + mensagem + obrigatoriedade do grupo `comExt`.

**Colunas** (cabeçalho linhas 1–5):

| col | Conteúdo |
|---|---|
| 0 | Nº do cenário |
| 1 / 2 / 3 | **Endereço Tomador / Intermediário / Local da Prestação (LP)** — cada um `Brasil` ou `Ext` |
| 4 | LI conforme subitem (`EP` / `LP` / `ET`) |
| 5 | Resposta do emitente: o serviço é caso de imunidade/exportação/não incidência? (`Sim`) |
| 6 | **`tribISSQN`** declarado: `Operação Tributável` / `Imunidade` / `Exportação de Serviço` / `Não Incidência` |
| 7 | É exportação **para o ISSQN**? (`SIM`/`NÃO`/`-`) |
| 8 | É exportação **para a RFB**? (≥1 dos 3 locais no exterior → `SIM`/`NÃO`) |
| 9 | **Mensagem**: `-`, `MENSAGEM ERRO 1/2/3`, `MENSAGEM AVISO 1` |
| 10 | LI final (município) ou `X` (rejeita) |
| 11 | `NBS` — obrigatoriedade |
| 12 | País Resultado (Exportação) |
| 13 | Grupo Comex (`comExt`) — obrigatoriedade |

**Como ler** (`tribISSQN` valores: `1`=Tributável, `2`=Imunidade, `3`=Exportação, `4`=Não Incidência, `LEIAUTE:r301`):

- **Exportação reconhecida** (`col7=SIM`, `col8=SIM`): geralmente exige LP no exterior. Ex.: cenário 16 (Tom/Int=Brasil, LP=Ext, subitem-LI=EP, resp=Exportação) → exportação OK, LI final `-`, `NBS/País/Comex` obrigatórios.
- **Exportação indevida → ERRO** (`col9=MENSAGEM ERRO 1`, `col10=X`): emitente declarou `tribISSQN=3` num cenário todo-Brasil. São exatamente os **cenários 6, 10, 34, 38, 66, 80** — bloqueados por **E0529** (campo `regra`: "Não é permitido ao emitente informar se tratar de uma situação de exportação de serviço (tribISSQN = 3) para os cenários 6, 10, 34, 38, 66, 80, conforme a planilha \"EXPORTACAO_EMISSÃO_NFS-e\"."; `msgErro`: "O sistema considera este cenário para a prestação de serviço informada na DPS uma operação tributável. Não é permitido ao emitente da DPS informar que a prestação de serviço se trata de uma exportação de serviço."; nível 2, `RN DPS_NFS-e:r463`).
- **Imunidade** (`col6=Imunidade`): ex. cenários 1, 5, 9 (tudo Brasil) → sem mensagem, LI final `-`.
- **Não Incidência declarada onde o sistema vê tributável** → `MENSAGEM ERRO 3` (24 cenários), rejeita.

Distribuição agregada das 112 linhas: `tribISSQN` → Imunidade 24, Exportação 24, Não Incidência 40, Tributável 24. Mensagens → ERRO 3 (24×), ERRO 1 (6×), ERRO 2 (6×), AVISO 1 (2×), sem mensagem 74×.

Obrigatoriedade do grupo `comExt` (`serv/comExt`, `LEIAUTE:r200`) é cruzada por **E0330** (exportação: se `tpEmit=1` e país do tomador/intermediário no exterior, ou `cPaisPrestacao` informado, ou `tribISSQN=3` → `comExt` obrigatório) e **E0331** (importação: `tpEmit=2|3` com país do prestador no exterior ou `cPaisPrestacao` → `comExt` obrigatório). Subcampos de `comExt` têm guardas próprias: E0333 (`mdPrestacao`), E0341/E0343 (`mecAFComexP/T`), E0345 (`movTempBens`), E0352/E0354/E0356 (`nDI`/`nRE`).

> Os 112 cenários completos estão em `_raw/anexoI.exportacao-emissao.json`. O texto-legenda de `MENSAGEM ERRO 1/2/3` e `MENSAGEM AVISO 1` **não consta** neste extrato da planilha — **(verificar na fonte)** o rodapé do Anexo I para o enunciado exato de cada mensagem.

---

## 7. Notas de implementação para a lib

**O que a lib pode/deve validar offline (determinístico):**

- Presença/ausência condicional do bloco `IBSCBS` entre DPS e NFS-e (espelha **E1515/E1517**) — quando construir/conferir o par.
- Formato/tamanho dos códigos: `cTribNac` N(6), `cTribMun` N(3) (≠ `000`, E0315), `cNBS` N(9), `CST` IBS/CBS N(3), `cClassTrib` N(6), `cIndOp` N(6) — tipos em `domain.ts`. Manter como **`string`** (preservam zeros à esquerda).
- Coerência `cNBS` obrigatório quando há bloco IBS/CBS (E0322) — checagem barata pré-envio.
- Guarda `cTribNac=200101` × `cLocPrestacao=0000000` (E1402) — regra fechada, sem consulta externa.
- `tribISSQN ∈ {1,2,3,4}`, `tpRetISSQN ∈ {1,2,3}`, `indDest ∈ {0,1}` — enums fixos.

**O que NÃO é responsabilidade da lib (decisão fiscal/servidor — não duplicar a Calculadora):**

- **Existência/administração** de `cTribNac`/`cTribMun` por município e competência (E0310/E0312/E0314) — depende das tabelas municipais (use os `consultar*` de parâmetros).
- **LI do ISSQN** (aba MUN.INCID) e **qualificação de exportação** (planilha de exportação, E0529) — o servidor decide; a lib só transmite `tribISSQN` + endereços + `comExt`.
- **Alíquotas e valores IBS/CBS** (`pIBSUF`, `pIBSMun`, `pCBS`, `pRedAliq*`, `vBC`, `vIBS*`, `vCBS`, `vDif*`, `gTribRegular`, `gTribCompraGov`, crédito presumido): o sistema recalcula via Calculadora e **rejeita** se divergir (E1530, E1539, E1556, E1568, E1582, E1585–E1607…). A lib **não** deve recomputar nem "corrigir" esses valores — apenas serializar o que o emitente/integrador informou e propagar a rejeição como `ReceitaRejectionError`.
- Indicadores derivados de `cClassTrib` (`exigeGrupoTributacaoRegular` etc., E1583/E1584): vêm da parametrização — fora do escopo offline.

**Tradeoff de precisão:** decimais tributários (`pAliq`, `vBC`, `vISSQN`, `vIBS*`…) mapeiam para `number`; consumidores com matemática fiscal exata devem envolver em Decimal.js. Identificadores tributários permanecem `string`.

**Regra de divergência doc × fonte:** se a doc do repo (guides) descrever a tributação de forma diferente do Anexo I/C oficial, **a fonte oficial prevalece** — abrir issue para alinhar a doc.
