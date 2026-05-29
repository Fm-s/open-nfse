> **Fonte:** Anexo II do Padrão Nacional NFS-e — leiaute `evento`/`pedRegEvento`, tipos de eventos e matriz EVENTOS×EVENTOS — **v1.01, 2026-01-22**. Dados linha-a-linha em `eventos.tipos.json`, `eventos.campos.json`, `eventos.regras.json`, `eventos.sequencia.json` (sidecars neste diretório). Schemas: `schemas/1.01/{evento,pedRegEvento,tiposEventos}_v1.01.xsd`.

# Eventos de NFS-e

**TL;DR.** A lib `open-nfse` cobre apenas **dois** dos 16 tipos de evento do catálogo: **101101 – Cancelamento** (via `cancelar`) e **105102 – Cancelamento por Substituição** (efeito da operação `substituir`). Os demais 14 tipos — manifestações (prestador/tomador/intermediário, confirmação tácita, anulação de rejeição), solicitação/deferimento/indeferimento de análise fiscal e ofícios (cancelamento/bloqueio/desbloqueio) — são emitidos pelo **tomador/intermediário, pelo Módulo Emissor (`MEmis`) ou pelo Município de Incidência (`MIncid`)**, e estão **fora do escopo** desta biblioteca (ver Catálogo abaixo).

Pontos críticos antes de codar:

- O **contribuinte só monta e assina o `pedRegEvento`** (identificador `PRE` + 56 dígitos = 59 chars). Quem monta o **envelope `evento`** (identificador `EVT` + 59 dígitos = 62 chars) e atribui o `nSeqEvento` é o **sistema receptor**, não a lib.
- **101101** é assinado e enviado diretamente pelo contribuinte (`autor = Emite`, `assinaturaObrigatoria = true`). **105102** tem `autor = MEmis` e `assinaturaObrigatoria = null` — é **gerado como consequência da substituição**, não um `pedRegEvento` avulso (ver §"Como funciona a substituição").
- **`nPedRegEvento` NÃO existe** neste leiaute. Confirmado: não é nem um campo nem um tipo simples — não aparece em nenhum dos quatro JSON nem no leiaute do `pedRegEvento`, e **não há** nenhum `xs:simpleType` com esse nome. (O token `nPedRegEvento` sobrevive apenas como **resíduo de documentação**: aparece dentro do texto de `xs:documentation` dos tipos `TSIdPedRegEvt` e `TSIdEvento` em `schemas/1.01/tiposSimples_v1.01.xsd`, descrevendo a composição legada do id; nenhum elemento/atributo o referencia.) Não reintroduza esse campo.
- Após **qualquer** cancelamento (101101 ou 105102), a NFS-e fica em estado terminal: **nenhum** outro evento é aceito (ver §Máquina de estados).

---

## 1. Catálogo de eventos

Tabela completa em `eventos.tipos.json` (16 linhas, chaves `codigo,nome,grupoEnvelope,categoria,autor,assinaturaObrigatoria,ambienteReceptor,precisaExistirNoAdn,eventoUnico,visibilidade,fonte`). Resumo abaixo. **Coluna "lib"**: ✅ = coberto; ⛔ = fora de escopo.

| código | nome | autor | assina | único | precisaNoAdn | visibilidade | lib |
|---|---|---|---|---|---|---|:--:|
| **101101** | Cancelamento de NFS-e | `Emite` | **true** | sim | sim | EM/NE/CP/AT | ✅ |
| **105102** | Cancelamento de NFS-e por Substituição | `MEmis` | null (`-`) | sim | sim | EM/NE/CP/AT | ✅ (via `substituir`) |
| 101103 | Solicitação de Análise Fiscal p/ Cancelamento | `Emite` | true | sim | sim | EM/NE/AT | ⛔ |
| 105104 | Cancelamento Deferido por Análise Fiscal | `MEmis` | null | sim | sim | EM/NE/AT | ⛔ |
| 105105 | Cancelamento Indeferido por Análise Fiscal | `MEmis` | null | sim | sim | EM/NE/AT | ⛔ |
| 202201 | Manifestação — Confirmação do Prestador | `Emite (Prestador)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 203202 | Manifestação — Confirmação do Tomador | `Emite (Tomador)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 204203 | Manifestação — Confirmação do Intermediário | `Emite (Intermediário)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 205204 | Manifestação — Confirmação Tácita | `MIncid` | null | sim | sim | EM/NE/CP/AT | ⛔ |
| 202205 | Manifestação — Rejeição do Prestador | `Emite (Prestador)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 203206 | Manifestação — Rejeição do Tomador | `Emite (Tomador)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 204207 | Manifestação — Rejeição do Intermediário | `Emite (Intermediário)` | false | sim | sim | EM/NE/CP/AT | ⛔ |
| 205208 | Manifestação — Anulação da Rejeição | `MIncid` | null | sim | sim | EM/NE/CP/AT | ⛔ |
| 305101 | Cancelamento de NFS-e por Ofício | `MEmis` | null | sim | sim | EM/NE/CP/AT | ⛔ |
| 305102 | Bloqueio de NFS-e por Ofício | `MEmis` | null | **não** | sim | EM/AT | ⛔ |
| 305103 | Desbloqueio de NFS-e por Ofício | `MEmis` | null | **não** | sim | EM/AT | ⛔ |

Notas:
- **`autor`**: `Emite` = contribuinte emitente da NFS-e; `Emite (Prestador/Tomador/Intermediário)` = parte manifestante; `MEmis` = Módulo Emissor (sistema que gerou a NFS-e); `MIncid` = Módulo do Município de Incidência. **Só os `Emite`/`Emite(...)` partem de um `pedRegEvento` assinado por contribuinte.**
- **`ambienteReceptor`**: cancelamentos/ofícios → "1 – Sistema que gerou a NFS-e (Sistema próprio do município ou Sefin Nacional NFS-e)"; manifestações → "2 – ADN". Isto é, **eventos de cancelamento vão para o Sefin Nacional** (a NFS-e da lib é emitida lá), enquanto manifestações vão para o **ADN**. (fonte: coluna `ambienteReceptor` em `eventos.tipos.json`.)
- **`eventoUnico = false`** apenas para 305102/305103 (bloqueio/desbloqueio podem repetir). Todos os demais são únicos.
- **`105102` com `autor = MEmis` e `assinaturaObrigatoria = null`** é a evidência documental de que o 105102 **não é um `pedRegEvento` avulso assinado pelo contribuinte** — ver §3.

---

## 2. Como funciona a substituição (105102) — e o contraste com a lib

**Fonte oficial.** No Anexo II o evento **105102 tem `autor = MEmis`** (Módulo Emissor) e **`assinaturaObrigatoria = null`** (`eventos.tipos.json:r3`). A substituição de uma NFS-e ocorre **emitindo uma nova DPS que referencia a NFS-e a substituir** (grupo `DPS/infDPS/subst` — ver `emissao.campos.json`); o cancelamento por substituição (105102) é **registrado pelo sistema emissor como efeito** dessa emissão. Os próprios campos do `e105102` derivam da DPS substituta: `cMotivo` é "Obtido do campo da DPS `DPS/infDPS/subst/cMotivo`" e `xMotivo` "Obtido do campo da DPS `DPS/infDPS/subst/xMotivo`" (descrições em `eventos.campos.json`, seq 26/27). O `chSubstituta` (seq 28) é a chave da NFS-e substituta.

**Como a lib modela isso (contraste documentado).** O `CLAUDE.md` e `docs/guide/substituir-cancelar.md` descrevem `substituir` como **"emite nova DPS + cancela a original com 105102"**, governado por uma **máquina de 5 estados** (`ok` / `retry_pending` / `rolled_back` / `rollback_pending` / `rollback_failed`) implementada em `src/eventos/cancelar.ts`. Na prática a lib **monta e assina um `pedRegEvento` do tipo 105102** (grupo `e105102` com `chSubstituta`) e o envia ao Sefin Nacional, espelhando o caminho do 101101.

**Conflito a sinalizar.** A fonte oficial classifica o 105102 como evento **gerado pelo MEmis sem assinatura obrigatória do contribuinte**, enquanto a lib o trata como `pedRegEvento` assinado e enviado pelo emitente. Isso é uma divergência de modelo: o leiaute do `pedRegEvento` **possui** o grupo `e105102` com seus campos (logo o XSD aceita um `pedRegEvento` 105102), mas o catálogo de tipos indica que, no fluxo canônico, é o **sistema** que materializa o 105102 a partir da DPS substituta. **Tratar como ponto em aberto / verificar na fonte (Manual de Integração + comportamento de Produção Restrita)** antes de afirmar que o envio direto de `pedRegEvento` 105102 pelo contribuinte é o caminho suportado pelo Sefin. A fonte oficial manda; a implementação atual da lib é uma aproximação pragmática.

---

## 3. Identificadores — DOIS ids distintos (não confundir)

Há **dois** identificadores no leiaute, em níveis diferentes. **A lib só monta o primeiro (`PRE`).**

### (a) `pedRegEvento/infPedReg/id` — o que o CONTRIBUINTE monta (`PRE` + 56 dígitos = **59 chars**)

- Leiaute: `eventos.campos.json` seq 13, `tamanho = 59`, ocorrência `1-1`.
- Composição (fonte E1827, `eventos.regras.json:r18`):
  `"PRE"` + **Chave de acesso da NFS-e (50)** + **Código do evento (6)** = 3 + 56 = 59 chars.
- Regex efetivo: **`PRE[0-9]{56}`** (confirmado em `src/eventos/event-id.ts` — `PRE${chaveAcesso(50)}${tipoEvento(6)}`).
- **Validação:** **`E1827`** — *"Conteúdo do identificador informado no identificador do Pedido de Registro de Evento difere da concatenação dos campos correspondentes."* (`Rej.`, nível 1, executa em Sefin e ADN).

### (b) `evento/infEvento/id` — o id do EVENTO autorizado, gerado pelo SISTEMA (`EVT` + 59 dígitos = **62 chars**)

- Leiaute: `eventos.campos.json` seq 4, `tamanho = 62`, ocorrência `1-1`.
- Composição (fonte E1802, `eventos.regras.json:r7`; descrição do campo, `eventos.campos.json:r5`):
  `"EVT"` + **id do Pedido de Registro de Evento sem o literal "PRE" (56)** + **nSeqEvento (3)** = 3 + 59 = 62 chars.
- Nota do leiaute: *"Para a formação do id do Evento, considerar o id do Pedido de Registro de Evento sem o literal `PRE`."* — ou seja, reaproveitam-se os **mesmos 56 dígitos** do `PRE` e acrescenta-se o `nSeqEvento`. **A lib não monta isto** (é o envelope gerado pelo receptor).
- **Validação:** **`E1802`** — *"Conteúdo do identificador informado no identificador do evento difere da concatenação dos campos correspondentes."* (`Rej.`, nível 1).

### Colisão de id (evento já existe)

| codErro | regra | execSefin | execAdn | fonte |
|---|---|---|---|---|
| **E1805** | "O id do evento **compartilhado** já existe no ADN." | X | V (ADN) | `RN EVENTO_PED.REG.EVENTO:r8` |
| **E0802** | "O id do evento **gerado** já existe no ADN." | V (Sefin) | X | `RN EVENTO_PED.REG.EVENTO:r9` |

Como o id deriva determinísticamente de `(chave, tipoEvento)` (sem `nPedRegEvento`), **um retry do mesmo evento cai no dedup `(chave, tipoEvento)`** em vez de criar duplicata — comportamento que a lib explora intencionalmente (ver `docs/guide/substituir-cancelar.md`). E1805/E0802 são a manifestação server-side desse dedup.

---

## 4. Leiaute do `pedRegEvento`

Estrutura completa (85 campos) em **`eventos.campos.json`** (chaves `seq,caminho,campo,ele,tipo,ocorrencia,tamanho,descricao,notas,fonte`). Esqueleto:

```
evento (raiz)
├── versao                      A   1-1  1-4V2   (versão do leiaute do EVENTO)
├── infEvento
│   ├── id                      ID  1-1  62      ("EVT"+59) — gerado pelo sistema
│   ├── verAplic, ...
│   └── pedRegEvento  (G)               <-- o que o contribuinte monta + assina
│       ├── versao              A   1-1  1-4V2
│       ├── infPedReg  (Id=...)
│       │   ├── id              ID  1-1  59      ("PRE"+56) — E1827
│       │   ├── tpAmb           N   1-1  1       — E1845
│       │   ├── verAplic        C   1-1  1-20
│       │   ├── dhEvento        D   1-1  -       — E1843
│       │   ├── CNPJAutor | CPFAutor (choice CE) 14 | 11  — E0812/E0813 | E0815/E0816
│       │   ├── chNFSe          N   1-1  50      — E1831/E0822/E0823/E0824/E0827/E0831
│       │   ├── e101101 (CG)    ← Cancelamento
│       │   │   ├── xDesc       C   1-1  5-60
│       │   │   ├── cMotivo     N   1-1  1       (1 Erro na Emissão | 2 Serviço não Prestado | 9 Outros)
│       │   │   └── xMotivo     C   1-1  15-255
│       │   ├── e105102 (CG)    ← Cancelamento por Substituição
│       │   │   ├── xDesc       C   1-1  5-60
│       │   │   ├── cMotivo     N   1-1  2       (01..05, 99 — ver enum abaixo)
│       │   │   ├── xMotivo     C   0-1  15-255  (opcional; ← DPS/infDPS/subst/xMotivo)
│       │   │   └── chSubstituta N  1-1  50      (chave da NFS-e substituta)
│       │   ├── e101103 / e105104 / e105105   ← análise fiscal (fora de escopo)
│       │   ├── e202201 ... e205208           ← manifestações (fora de escopo)
│       │   └── e305101 / e305102 / e305103   ← ofícios (fora de escopo)
│       └── Signature  (G)      0-1           ← XMLDSig do pedRegEvento
```

**Cada tipo de evento é um grupo `eNNNNNN` distinto sob `infPedReg`** (todos com `ocorrencia 1-1` no XSD, escolhidos conforme o `tipoEvento` que compõe o id — `xs:choice` na prática). Os tipos do contribuinte preenchem só o grupo do seu código.

`cMotivo` do **e105102** (`eventos.campos.json` seq 26, `tamanho = 2`):
`01` Desenquadramento do Simples Nacional · `02` Enquadramento no Simples Nacional · `03` Inclusão Retroativa de Imunidade/Isenção · `04` Exclusão Retroativa de Imunidade/Isenção · `05` Rejeição pelo tomador/intermediário responsável pelo recolhimento · `99` Outros. (Obtido de `DPS/infDPS/subst/cMotivo`.)

`cMotivo` do **e101101** (`tamanho = 1`): `1` Erro na Emissão · `2` Serviço não Prestado · `9` Outros.

---

## 5. Regras de negócio dos eventos (críticas)

Tabela completa: **`eventos.regras.json`** (58 regras, chaves `seq,caminho,campo,regra,aplic,efeito,codErro,msgErro,nivel,execSefin,sefinDecisao,execAdn,adnDecisao,obs,fonte`). Todas as listadas têm `efeito = Rej.` (rejeição). Destaques que tocam o escopo da lib (101101/105102 e cabeçalho comum):

| codErro | campo | resumo (faithful) | fonte |
|---|---|---|---|
| **E1827** | `pedRegEvento/infPedReg/id` | id do PRE difere da concatenação `"PRE"+chave(50)+codEvento(6)` | r18 |
| **E1802** | `infEvento/id` | id do EVENTO (`"EVT"+id_PRE_sem_PRE(56)+nSeqEvento(3)`) divergente | r7 |
| **E1805** | `infEvento/id` | id do evento **compartilhado** já existe no ADN | r8 |
| **E0802** | `infEvento/id` | id do evento **gerado** já existe no ADN | r9 |
| **E1260** | `evento/versao` | prazo de aceitação da versão do leiaute do DF-e expirou | r5 |
| **E1825** | `pedRegEvento/versao` | prazo de aceitação da versão do leiaute do PRE ultrapassado | r16 |
| **E1845** | `tpAmb` | tipo de ambiente informado difere do ambiente utilizado | r20 |
| **E1843** | `dhEvento` | `dhEvento` não pode ser posterior à data de recebimento do lote pelo Sistema Nacional | r22 |
| **E0812 / E0813** | `CNPJAutor` | CNPJ autor deve = CNPJ do certificado da assinatura / deve corresponder ao "AUTOR" da planilha Tipo Eventos | r23 / r24 |
| **E0815 / E0816** | `CPFAutor` | idem para CPF | r25 / r26 |
| **E1831** | `chNFSe` | a NFS-e indicada não existe no ADN NFS-e | r27 |
| **E0822** | `chNFSe` | cancelamento **fora do prazo limite** (parametrização do município emissor) | r28 |
| **E0823** | `chNFSe` | cancelamento **acima do valor permitido** pelo município emissor | r29 |
| **E0824** | `chNFSe` | cancelamento de NFS-e **sem tomador identificado** (conforme parametrização) | r30 |
| **E0827** | `chNFSe` | NFS-e com **Evento de Tributos Recolhidos vinculado** não pode ser cancelada (parametrização do município de incidência) | r31 |
| **E0831** | `chNFSe` | o pedido deve ser enviado **ao ambiente que gerou a NFS-e** referenciada | r32 |
| **E1833** | `chNFSe` | único evento de Manifestação (Confirmação/Rejeição) por autor (CNPJAutor/CPFAutor) | r33 |
| **E0840** | `e101101` | o Sistema deve responder à recepção do EVENTO DE CANCELAMENTO conforme a matriz RN EVENTOSxEVENTOS | r35 |
| **E0845** | `e105102` | idem para o EVENTO DE CANCELAMENTO POR SUBSTITUIÇÃO | r39 |

> Regras `E0822/E0823/E0824/E0827` dependem de **parametrização municipal** — cruzar com `parametros-municipais` (limites de prazo/valor/tomador). São rejeições **permanentes** do ponto de vista de retry, mas dependem de regra municipal: trate como `ReceitaRejectionError` e **não** reenfileire.
>
> Os grupos `e202205/e203206/e204207` têm a regra "se `cMotivo = 9 (Outros)` então `xMotivo` é obrigatório" (E1944/E1949/E1954) — relevante só se a lib um dia cobrir manifestações. Demais 30+ códigos (E0848…E2032) são de manifestação/ofício/análise fiscal — ver `eventos.regras.json`.

---

## 6. Máquina de estados — matriz EVENTOS×EVENTOS

Matriz completa (600 células) em **`eventos.sequencia.json`** (chaves `preExistenteSeq,preExistente,preExistenteSub,bloco,requisitado,requisitadoCodigo,condicaoOficio,marcador,permitido,fonte`). Lê-se: **dado o evento pré-existente na NFS-e (linha), o evento requisitado (coluna) é permitido?**

Marcadores:
- **`V`** → permitido (`permitido: true`).
- **`X`** → proibido (`permitido: false`).
- **`X/V`** → **condicional** (`permitido: "condicional"`): permitido conforme a condição da coluna `condicaoOficio` (ex.: depende de já existir/inexistir um cancelamento/ofício específico). Ocorre nas linhas de **manifestação** (`preExistenteSeq` 7–14) e de **Bloqueio de NFS-e por Ofício** (`preExistenteSeq` 16–20). O que importa para a lib: as linhas de **cancelamento** (101101/105102, `preExistenteSeq` 2–3) **não têm** `X/V` — são todas `X`.

### Sub-matriz do escopo da lib

Linhas relevantes (`preExistente`) × colunas `101101`/`105102`:

| pré-existente \ requisitado | 101101 | 105102 | fonte |
|---|:--:|:--:|---|
| **NENHUM EVENTO PRÉ-EXISTENTE** | **V** | **V** | r5c5 / r5c6 |
| **Cancelamento de NFS-e** (101101) | X | X | r6c5 / r6c6 |
| **Cancelamento de NFS-e por Substituição** (105102) | X | X | r7c5 / r7c6 |

Verificado nos dados: para `preExistente ∈ {Cancelamento de NFS-e, Cancelamento de NFS-e por Substituição}`, **todas as 24 colunas de cada linha são `X`** — nenhum evento é permitido após um cancelamento. Ou seja, **101101 e 105102 são estados terminais**.

Regra prática para a lib:
1. NFS-e **sem evento terminal** aceita **101101 OU 105102** (mas não ambos — são mutuamente exclusivos e únicos).
2. Após **qualquer** cancelamento, qualquer novo evento será rejeitado server-side (refletido em E0840/E0845 + a matriz RN EVENTOSxEVENTOS).

> A matriz completa (incluindo análise fiscal 101103/105104/105105, manifestações 2xxxxx e ofícios 305xxx, e as células `X/V` condicionais) está em `eventos.sequencia.json` — consulte-a antes de afirmar qualquer transição fora das duas linhas acima.

---

## 7. Notas de implementação para a lib

- **Só monte o `PRE`.** `buildEventoPedidoId({chaveAcesso, tipoEvento})` → `PRE${chave(50)}${tipoEvento(6)}` (`src/eventos/event-id.ts`), regex `PRE[0-9]{56}`. O `EVT…` (62 chars) é responsabilidade do receptor — não tente gerá-lo nem o `nSeqEvento`.
- **Nunca reintroduza `nSeqEvento`/`nPedRegEvento` no corpo do `pedRegEvento`** que a lib envia — eles não pertencem ao que o contribuinte monta. (`nSeqEvento` só aparece como insumo do `EVT…` gerado pelo sistema; `nPedRegEvento` não existe no leiaute ativo.)
- **101101 — assine sempre antes de persistir.** `cMotivo ∈ {1,2,9}` (1 char) + `xMotivo` 15–255 obrigatório. `autor` casa com `CNPJAutor`/`CPFAutor` e com o certificado (E0812/E0815). Já implementado em `cancelar` (assina up-front, `xmlJaAssinado: true` ao `postEvento`).
- **105102 — verificar modelo na fonte (ver §2).** A lib hoje monta/assina um `pedRegEvento` 105102 com `chSubstituta`, dentro da máquina de 5 estados de `substituir` (em `src/eventos/cancelar.ts`). A fonte oficial trata 105102 como evento de `MEmis` derivado da DPS substituta (`DPS/infDPS/subst`). **Antes de mudar o contrato público, confirmar em Produção Restrita / Manual de Integração** se o Sefin aceita `pedRegEvento` 105102 enviado diretamente pelo contribuinte ou se a substituição é puramente um efeito da nova emissão.
- **Dedup determinístico.** Como o id deriva de `(chave, tipoEvento)`, retries reincidem no dedup do servidor (E1805/E0802) em vez de duplicar — alinhado ao `RetryStore`/`replayPendingEvents`. Trate E1805/E0802 como "já registrado" (idempotente), não como falha transiente.
- **Roteamento de ambiente.** Eventos de cancelamento (101101/105102) têm `ambienteReceptor = "1 - Sistema que gerou a NFS-e"` → vão ao **Sefin Nacional** (`endpoints.sefin`, `/nfse/{chave}/eventos`), coerente com E0831. Manifestações iriam ao **ADN** — outro contrato; não unificar.
- **Rejeições municipais (E0822/E0823/E0824/E0827)** são permanentes mas dependentes de parametrização do município — classifique como `ReceitaRejectionError` (não-transiente) e cruze com `parametros-municipais` para antecipar a falha quando possível.
