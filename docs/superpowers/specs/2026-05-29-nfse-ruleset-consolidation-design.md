# Design — Consolidated emission/cancel/substitution ruleset (`specs/ruleset/`)

**Date:** 2026-05-29
**Status:** Approved
**Goal:** Distill the official NFS-e Padrão Nacional documentation (`specs/oficial/documentacao-atual/` + `rtc/NT-008`) into a single, agent-friendly, source-traced ruleset covering the three operations this library exists for: **emissão**, **cancelamento**, **substituição**.

## Why

The XSDs in `schemas/1.01/` give structure but cannot express the *business rules* (regras de negócio) and rejection codes that decide whether SEFIN/ADN accept a DPS or event. Those live in the Anexo spreadsheets (`RN DPS_NFS-e` = 655 rows, `RN EVENTO` = 111 rows, `RN EVENTOSxEVENTOS` = 29-row state matrix) and the contribuinte manuals. Consolidating them into a queryable ruleset streamlines all future library work (domain types, parser branches, `buildDps` guards, event sequencing).

## Deliverable

`specs/ruleset/` — non-shipped reference (like the rest of `specs/`, excluded from the npm tarball by `files: ["dist"]`). Markdown narratives (read) + JSON sidecars (query/diff):

| File | Source | Content |
|---|---|---|
| `README.md` | — | How to use, source-provenance table, version stamps, V/X legend, error-code conventions, glossary, scope fences |
| `emissao.md` | Anexo I + manuals | DPS→NFS-e lifecycle, field groups, top rejection gotchas |
| `emissao.campos.json` | Anexo I `LEIAUTE DPS_NFS-e` (417) | DPS/NFS-e field layout |
| `emissao.regras.json` | Anexo I `RN DPS_NFS-e` (655) + `RN_RECEPCAO_DPS` (17) | Business rules + rejection codes |
| `eventos.md` | Anexo II | Event model, id format, 101101 cancel, 105102 substitute, sequencing |
| `eventos.tipos.json` | Anexo II `TIPO EVENTOS DE NFSe` (18) | Event catalog |
| `eventos.campos.json` | Anexo II `LEIAUTE EVENTO_PED.REG.EVENTO` (86) | pedRegEvento field layout |
| `eventos.regras.json` | Anexo II `RN EVENTO_PED.REG.EVENTO` (111) | Event business rules |
| `eventos.sequencia.json` | Anexo II `RN EVENTOSxEVENTOS` (29) | Event×event allow/deny state matrix |
| `tributos.md` | Anexo I + Anexo C | IBS/CBS/ISS model, cClassTrib/CST/IndOp, field gating |
| `tributos.indop.json` | Anexo C | IndOp IBS/CBS catalog |
| `transporte.md` | contribuinte manuals + repo OpenAPI | 2 base URLs, endpoints, envelopes, XMLDSig, sync/async, 400/404-with-body, headers |
| `danfse.md` | `rtc/NT-008` | DANFSe layout blocks + QR composition |
| `_raw/*.json` | all sheets | Lossless per-sheet dumps backing every clean row |

NBS list (Anexo B), IBGE municípios & ISO-2 países (Anexo A) are referenced by pointer, not inlined (huge enumerations).

## JSON schemas (grounded in real sheet columns)

**Fields** (`*.campos.json`): `seq, caminho, campo, ele, tipo, ocorrencia, tamanho, descricao, notas, fonte`.

**Rules** (`*.regras.json`): `seq, caminho, campo, regra, aplic, efeito, codErro, msgErro, nivel, execSefin, execAdn, obs, fonte` (`exec*` derive from the V markers indicating which engine runs the rule).

**Sequencing** (`eventos.sequencia.json`): `{ preExistente, permite: {<codigo>: bool}, fonte }`.

`fonte` on every row = `Anexo!SHEET:rowN` (or PDF page) — full provenance.

## Scope fences (recorded explicitly in README)

Out of scope, consistent with `CLAUDE.md`: municipality manuals + Anexo III/IV/V (CNC, painel admin municipal), `guia-emissorpubliconacionalweb` (web UI), `manual-contribuintes-…-decisao-administrativa-e-judicial` (judicial endpoint, fenced in CLAUDE.md).

## Version stamps

RTC v1.01 · Anexo I v1.01 2026-02-09 · Anexo II v1.01 2026-01-22 · Anexo C v1.01 2026-01-22 · NT-008 2026-05-05.

## Build & verification method

1. **Deterministic extraction** — `scripts/extract-ruleset.py` dumps every relevant sheet to `_raw/` losslessly, then derives the clean `*.json` sidecars (merge multi-row headers, map columns→keys, drop structural/empty rows, stamp `fonte`). Tabular fiscal data is mechanically extracted, never LLM-paraphrased → zero fabrication risk, re-runnable on Receita updates.
2. **Agent synthesis (Workflow, parallel)** — write `.md` narratives on top of the clean JSON; read PDFs for `transporte.md` / `danfse.md`.
3. **Adversarial verification (Workflow)** — independent agent per artifact cross-checks against `_raw/` (row counts, every `codErro` present, no invented rules, matrix V/X fidelity) + a completeness critic confirming nothing dropped.

## Out of scope for this task

No library code changes. This produces reference material only; applying it to `src/` is follow-up work.
