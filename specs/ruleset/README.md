# `specs/ruleset/` — ruleset consolidado de emissão, cancelamento e substituição

Destilação **agent-friendly** da documentação técnica oficial da **NFS-e Padrão Nacional**
(nfse.gov.br) para as três operações que esta biblioteca implementa: **emissão**,
**cancelamento** e **substituição**. Material de **referência** — vive sob `specs/`, não vai
no tarball npm (`files: ["dist"]`).

Gerado em 2026-05-29 a partir de `specs/oficial/documentacao-atual/` (+ `rtc/NT-008` para o
DANFSe). Os dados tabulares (leiautes, regras de negócio, códigos de rejeição, matriz de
eventos, IndOp) foram **extraídos deterministicamente célula a célula** — zero paráfrase de
LLM — por `scripts/extract-ruleset.py`. As narrativas `.md` foram escritas e **verificadas
adversarialmente** contra esses extratos.

## Como um agente deve usar isto

1. **Leia o `.md`** da operação (`emissao.md`, `eventos.md`, `tributos.md`, `transporte.md`,
   `danfse.md`) — é um digest navegável com as regras críticas e ponteiros.
2. **Consulte o `.json`** correspondente para o detalhe campo-a-campo / regra-a-regra.
   Use `jq`/`python3` — os arquivos são grandes.
3. **Cheque a procedência** em `_raw/` se precisar do texto exato da célula de origem.

```bash
# todas as regras de rejeição que tocam o campo "cTribNac"
jq '.negocio[] | select(.campo=="cTribNac")' specs/ruleset/emissao.regras.json
# o que é permitido após um "Cancelamento de NFS-e" já existir
jq '.[] | select(.preExistente|test("Cancelamento de NFS-e$")) | {req:.requisitadoCodigo, .marcador}' \
   specs/ruleset/eventos.sequencia.json
```

## Mapa de arquivos e procedência

| Arquivo | Conteúdo | Linhas | Fonte oficial |
|---|---|---:|---|
| `emissao.md` | Narrativa: fluxo DPS→NFS-e, grupos do infDPS, regras críticas | — | Anexo I |
| `emissao.campos.json` | Leiaute de campos DPS/NFS-e | 416 | Anexo I · `LEIAUTE DPS_NFS-e` |
| `emissao.regras.json` | `{ recepcao: 16, negocio: 440 }` regras + códigos (428 distintos) | 456 | Anexo I · `RN DPS_NFS-e` + `RN_RECEPCAO_DPS` |
| `eventos.md` | Narrativa: modelo de eventos, ids, 101101/105102, máquina de estados | — | Anexo II |
| `eventos.tipos.json` | Catálogo dos 16 tipos de evento | 16 | Anexo II · `TIPO EVENTOS DE NFSe` |
| `eventos.campos.json` | Leiaute do evento/pedRegEvento | 85 | Anexo II · `LEIAUTE EVENTO_PED.REG.EVENTO` |
| `eventos.regras.json` | Regras de negócio dos eventos + códigos | 58 | Anexo II · `RN EVENTO_PED.REG.EVENTO` |
| `eventos.sequencia.json` | Matriz evento×evento (células) | 600 | Anexo II · `RN EVENTOSxEVENTOS` |
| `tributos.md` | Narrativa: IBS/CBS/ISSQN, cClassTrib/CST, IndOp, local de incidência | — | Anexo I + C |
| `tributos.indop.json` | Catálogo IndOp IBS/CBS | 30 | Anexo C · `IndOp` |
| `transporte.md` | Narrativa: 2 base URLs, endpoints, envelope, XMLDSig, NSU | — | Manuais contribuinte + OpenAPI |
| `danfse.md` | Narrativa: layout + QR-code do DANFSe | — | RTC · NT-008 |
| `_raw/*.json` | Dumps lossless por planilha (procedência) | — | todas acima |

## Versões das fontes

RTC **v1.01** · Anexo I **v1.01 2026-02-09** · Anexo II **v1.01 2026-01-22** ·
Anexo C **v1.01 2026-01-22** · NT-008 **2026-05-05**.

## Esquemas JSON

**Campos** (`*.campos.json`) — uma entrada por linha do leiaute:
`seq, caminho, campo, ele, tipo, ocorrencia, tamanho, descricao, notas, fonte`.
`ele`: `Raiz` · `G` (grupo) · `E` (elemento) · `A` (atributo) · `ID` · `CE`/`CG` (escolha).

**Regras** (`*.regras.json`) — uma entrada por regra de negócio:
`seq, caminho, campo, regra, aplic, efeito, codErro, msgErro, nivel, execSefin, execAdn, sefinDecisao, adnDecisao, obs, fonte`.
`efeito`: `Rej.` (rejeita) · `Alerta` · `-`. `execSefin`/`execAdn` (bool): qual motor roda a
regra (marcador `V` na planilha). `emissao.regras.json` agrupa `{ recepcao, negocio }`; as
linhas de `recepcao` sem `codErro` são títulos de seção (campo `secao`).

**Sequência** (`eventos.sequencia.json`) — uma entrada por célula da matriz:
`preExistenteSeq, preExistente, preExistenteSub, bloco, requisitado, requisitadoCodigo,
condicaoOficio, marcador, permitido, fonte`.
`bloco`: `pedido` (14 eventos requisitáveis) · `bloqueio-oficio` · `desbloqueio-oficio`.
Legenda do `marcador`: **`V`** = permitido (`permitido: true`) · **`X`** = proibido
(`false`) · **`X/V`** = condicional (`permitido: "condicional"` — depende do autor/condições).

**IndOp** (`tributos.indop.json`):
`codIndOp, artigo, tipoOperacao, localOperacao, caracteristicaFornecimento, grupo, seq,
localFornecimentoIdentificar, campoLeiaute, fonte`.

### Campo `fonte`

Toda linha rastreia sua origem: `Anexo!PLANILHA:rN` (linha `N` da planilha) — ou
`...:rNcM` para células da matriz evento×evento. Ex.: `AnexoI!RN DPS_NFS-e:r5`.

## Convenção de códigos de erro

Códigos `E####` (ex.: `E1263`, `E1827`). Famílias observadas: `E0xxx`/`E1xxx` (recepção e
negócio da DPS), `E18xx`/`E08xx` (eventos), `E12xx` (certificado de transmissão e área de
dados). A lista completa e fiel está nos `*.regras.json` — não há lista canônica separada
porque ela **é** o JSON.

## Escopo — fora (alinhado ao `CLAUDE.md`)

Esta biblioteca é cliente do **contribuinte** para emissão/cancelamento/substituição.
Deliberadamente **não** consolidamos, embora estejam em `specs/oficial/`:

- Manuais de **municípios** + Anexos III/IV/V (CNC, painel administrativo municipal).
- `guia-emissorpubliconacionalweb` (UI web do Emissor Público).
- `manual-contribuintes-...-decisao-administrativa-e-judicial` (endpoint `/decisao-judicial`,
  fora de escopo no `CLAUDE.md`).

Listas-referência grandes ficam por ponteiro (não inline): **NBS** (Anexo B), **municípios
IBGE / países ISO-2** (Anexo A).

## Regenerar

```bash
python3 scripts/extract-ruleset.py      # re-extrai _raw/ + *.json a partir dos Anexos XLSX
```

Rode após a Receita atualizar qualquer Anexo (e atualize as versões acima). O script
imprime as contagens — confira contra a tabela deste README.

## Glossário rápido

**DPS** Declaração de Prestação de Serviços (o que o emitente envia) · **NFS-e** documento
autorizado · **DF-e** documentos fiscais eletrônicos (distribuição por NSU) · **pedRegEvento**
pedido de registro de evento · **cTribNac** código de tributação nacional do serviço ·
**cClassTrib** classificação tributária (RTC) · **IndOp** indicador do local da operação
(IBS/CBS) · **Sefin Nacional** host de emissão · **ADN** Ambiente de Dados Nacional
(distribuição/DANFSe/parâmetros).
