# Emissão de NFS-e (DPS → NFS-e)

> Fonte: **Anexo I do Leiaute e das Regras de Validação da NFS-e Padrão Nacional, v1.01 (2026-02-09)**.
> Dados máquina-legíveis (não paráfrase): `emissao.campos.json` (416 campos), `emissao.regras.json` (`recepcao`: 16 regras de transmissão; `negocio`: 440 regras, 428 codErro únicos `E0001..E1638` + `E9996`). Toda regra abaixo cita seu `codErro` e a `fonte` (`AnexoI!...:rNN`) presente no JSON. Onde o texto oficial é ambíguo, está marcado `(verificar na fonte)`.

## TL;DR

Para emitir, o contribuinte monta o `infDPS` (Declaração de Prestação de Serviços), serializa em XML, **assina com XMLDSig** usando o certificado ICP-Brasil do emitente, comprime/base64 e envia via `POST /nfse` à **Sefin Nacional**. A Sefin valida em duas camadas — **recepção** (certificado de transmissão + integridade da área de dados, códigos `E12xx`) e **negócio** (~440 regras sobre `infDPS`, códigos `E0001..E1268` e correlatos) — e, se aprovada, gera a **NFS-e** autorizada (que *embute* a DPS recebida dentro de `NFSe/infNFSe/DPS/infDPS`). Quase todas as 432 regras de negócio têm efeito **Rej.** (rejeição): falhar qualquer uma significa nenhuma nota gerada. O leiaute do `emissao.campos.json` descreve a NFS-e completa; a DPS é o sub-bloco `NFSe/infNFSe/DPS/infDPS` (seq 100+).

---

## 1. Fluxo de emissão

```
buildDps(params) → infDPS (DTO)
   → buildDpsXml         (serializa; ids = "DPS"+cMun+tpInsc+insc+serie+nDPS, ver §4 E0004)
   → signDpsXml          (XMLDSig com cert do EMITENTE — E0714/E0717/E0718)
   → validate-xml (XSD)  (offline; pega E1235 "Falha no esquema XML" antes de gastar rede/counter)
   → POST /nfse (Sefin)  (gzip + base64; 400 carrega corpo de rejeição, acceptedStatuses:[400])
   → NFS-e autorizada    (chave de 50 dígitos; id de 53 conforme E1263)
```

Na biblioteca isso é `emitir(params)` (ou o escape hatch `emitirDpsPronta(dps)` / `emitirEmLote`). O `DpsCounter` só é consumido **após** as validações offline passarem.

---

## 2. Estrutura do `infDPS` (grupos principais)

Caminho-raiz da DPS dentro da NFS-e: `NFSe/infNFSe/DPS/infDPS/` (abreviado `~/` abaixo). Detalhe campo-a-campo (tipo, tamanho, ocorrência, descrição) está em **`emissao.campos.json`** — não reproduzido aqui.

| Grupo | Caminho | Ocorrência | Para que serve |
|---|---|---|---|
| Cabeçalho/identificação | `~/` (`id`, `tpAmb`, `dhEmi`, `verAplic`, `serie`, `nDPS`, `dCompet`, `tpEmit`, `cMotivoEmisTI`, `chNFSeRej`, `cLocEmi`) | campos `1-1` (alguns `0-1`) | Identificador da DPS, ambiente, datas de emissão/competência, tipo de emitente (1=prestador, 2=tomador, 3=intermediário), município emissor. |
| `subst` (substituição) | `~/subst` (`chSubstda`, `cMotivo`, `xMotivo`) | `0-1` | Indica que esta DPS substitui uma NFS-e anterior (chave de 50). |
| `prest` (prestador) | `~/prest/` (`CNPJ`/`CPF`/`NIF`/`cNaoNIF` — choice; `CAEPF`, `IM`, `xNome`, `end`, `regTrib`) | `1-1` | Identificação fiscal do prestador + `regTrib` (`opSimpNac`, `regApTribSN`, `regEspTrib`). |
| `toma` (tomador) | `~/toma/` | `0-1` | Identificação do tomador (mesma estrutura de inscrição + endereço). |
| `interm` (intermediário) | `~/interm/` | `0-1` | Identificação do intermediário do serviço. |
| `serv` (serviço) | `~/serv/` | `1-1` | Contém `locPrest` (`cLocPrestacao`/`cPaisPrestacao`), `cServ` (`cTribNac`, `cTribMun`, `xDescServ`, `cNBS`, `cIntContrib`), e opcionais `comExt`, `obra`, `atvEvento`, `infoCompl`. |
| `valores` | `~/valores/` | `1-1` | `vServPrest` (`vServ`/`vReceb`), `vDescCondIncond`, `vDedRed`, e `trib`. |
| `trib` (tributos) | `~/valores/trib/` | `1-1` | `tribMun` (`tribISSQN`, `pAliq`, `tpRetISSQN`, `tpImunidade`, `exigSusp`, `BM`), `tribFed` (`piscofins`), `totTrib`. |
| `IBSCBS` (Reforma) | `~/IBSCBS/` | `0-1` | Bloco IBS/CBS (`finNFSe`, `cIndOp`, `dest`, `imovel`, `valores/trib/gIBSCBS`). |
| `Signature` | `~/Signature` | `0-1` no leiaute, **obrigatória na recepção** (E0717) | Assinatura XMLDSig da DPS. |

> O `cServ` é o coração tributário: `cTribNac` (6 dígitos, item da lista nacional LC 116) determina quais regras de ISSQN/benefício/alíquota se aplicam. Ver `emissao.campos.json` seq 193-198.

---

## 3. Regras de recepção (camada de transmissão)

Sidecar: `emissao.regras.json → recepcao` (16 entradas; `fonte: AnexoI!RN_RECEPCAO_DPS`). São verificações de **certificado de transmissão** e **integridade da área de dados**, *antes* das regras de negócio. Todas com efeito **Rej.**

| codErro | Condição (resumo fiel) |
|---|---|
| `E1200` | Certificado de Transmissão inválido (inexistente, versão ≠ 3, BasicConstraint não pode ser AC, KeyUsage sem "Autenticação Cliente"). |
| `E1203` | Certificado de Transmissão expirado (data início/fim). |
| `E1205` | Erro na cadeia de certificação (AC não cadastrada na RFB / revogada / assinatura não confere). |
| `E1206` | Erro de acesso à LCR (CRL DistributionPoint ausente / LCR indisponível / inválida). |
| `E1207` | Certificado do transmissor revogado. |
| `E1208` | Certificado raiz difere da ICP-Brasil. |
| `E1209` | Falta extensão de CNPJ/CPF no certificado (OtherName OID=2.16.76.1.3.3). |
| `E1225` | Falha na descompactação da base 64 (msgErro: "Falha na decodificação da base 64 da área de dados"). |
| `E1226` | Estrutura descompactada mal formada. |
| `E1228` | Uso de prefixo de namespace não permitido na área descompactada. |
| `E1229` | XML não está em UTF-8. |
| `E1235` | **Falha no esquema XML do DF-e** (validação XSD — a lib pega isso offline com `validate-xml`). |
| `E1242` | Tipo de DF-e não tratado pelo Sistema Nacional NFS-e. |

> Nota: não confundir o **certificado de transmissão** (mTLS, regras `E12xx`) com o **certificado da assinatura da DPS** (XMLDSig, regras de negócio `E0714..E0718`, ver §4).

---

## 4. Regras de negócio críticas (por tema)

Sidecar completo: `emissao.regras.json → negocio` (440 regras; 432 com efeito `Rej.`, 8 com `Obrig.`). Abaixo só as de **maior impacto de reprovação**; para a lista exaustiva, **consultar `emissao.regras.json`**.

### 4.1 Identificação — `id` / chave / dedup

| codErro | Campo | Resumo |
|---|---|---|
| `E0004` | `id` (DPS) | `id` deve = concatenação `"DPS"` + Cód.Mun.Emi. + Tipo Insc. Federal + Inscrição Federal + Série + Núm. DPS. `tpInsc=1`→CPF, `tpInsc=2`→CNPJ do emitente. (`AnexoI!RN DPS_NFS-e:r142`) |
| `E1263` | `id` (NFS-e) | `id` da NFS-e (53 chars) = `"NFS"` + cMun(7) + AmbGer(1) + tpInsc(1) + Insc(14, CPF preenche com `000` à esquerda) + nNFSe(13) + AnoMês(4) + Cód.Num(9) + DV(1). (`AnexoI!RN DPS_NFS-e:r7`) |
| `E1268` | `id` (NFS-e) | Chave de acesso da NFS-e enviada já existe no ADN. |
| `E0014` | `serie`/`nDPS` | Conjunto (Série + Número + cMun Emissor + CNPJ/CPF) já existe em NFS-e gerada de DPS anterior — **dedup de emissão**. (`AnexoI!RN DPS_NFS-e:r148`) |
| `E0010` | `serie` | Série não pertence à faixa definida para o `tpEmit` usado. |
| `E0034`/`E0035` | `chNFSeRej` | Só preenchível se emitente for tomador/intermediário (`tpEmit` 2 ou 3) e houver evento de Manifestação de Rejeição correspondente. |

### 4.2 Ambiente, versão, competência e datas

| codErro | Campo | Resumo |
|---|---|---|
| `E0006` | `tpAmb` | Ambiente informado diverge do ambiente de recepção. |
| `E0008` | `dhEmi` | `dhEmi` deve ser ≤ `dhProc` (processamento). |
| `E0015` | `dCompet` | `dCompet` deve ser ≤ `dhEmi`. |
| `E0016`/`E1270` | `dCompet` | `dCompet` ≥ data de ativação do convênio do município emissor. |
| `E0018`/`E0020` | `dCompet` | `dCompet` ≥ data de inscrição do CNPJ (`E0018`) / CPF (`E0020`) do emitente. |
| `E1294` | `dhEmi` | Compartilhamento do DF-e não pode ser > 6 anos após a emissão. |
| `E0037`/`E0038`/`E1272` | `cLocEmi` | Município emissor deve existir e estar "ATIVO" no cadastro de convênio municipal na data de processamento. |

### 4.3 Prestador (`prest`) e regime tributário

| codErro | Campo | Resumo |
|---|---|---|
| `E0080`/`E0096` | `CNPJ`/`CPF` | DV inválido. |
| `E0082`/`E0098` | `CNPJ`/`CPF` | Não existe no cadastro na data de competência. |
| `E0112`/`E0114` | `NIF`/`cNaoNIF` | Se `tpEmit=1` (prestador), NIF/cNaoNIF do prestador não podem ser informados. |
| `E0115` | `cNaoNIF` | `cNaoNIF=0` → rejeita. |
| `E0121`/`E0122` | `xNome` | Se `tpEmit=1`, `xNome` NÃO deve ser informado; se `tpEmit=2/3`, deve ser. |
| `E0128`/`E0129` | `end` | Endereço do prestador presente/ausente conforme `tpEmit`. |
| `E0160` | `opSimpNac` | Opção do Simples Nacional do prestador deve bater com o cadastro Simples Nacional na data de competência. |
| `E0162`/`E0166` | `regApTribSN` | `regApTribSN` proibido quando não-ME/EPP; **obrigatório** quando ME/EPP (a lib já faz fail-fast — ver §5). |
| `E0174`/`E0175` | `regEspTrib` | `regEspTrib` deve ser `0` (Nenhum) quando prestador é MEI (`opSimpNac=2`) ou optante SN. |

### 4.4 Tomador (`toma`) e intermediário (`interm`)

| codErro | Campo | Resumo |
|---|---|---|
| `E0188`/`E0206` | `CNPJ`/`CPF` | DV inválido (tomador). |
| `E0190`/`E0207` | `CNPJ`/`CPF` | Não existe no cadastro na data de competência (tomador). |
| `E0202` | `CNPJ` | CNPJ do tomador = CNPJ do prestador (comparar CNPJ completo) → rejeita. |
| `E0204` | `CNPJ`/`CPF` | Se há retenção pelo tomador (`tpRetISSQN=2`), o tomador deve ser identificado por CNPJ ou CPF. |
| `E0222` | `NIF` | Se `tpEmit=2`, NIF do tomador não pode ser informado. |

### 4.5 Serviço (`serv`) e local de incidência

| codErro | Campo | Resumo |
|---|---|---|
| `E0310` | `cTribNac` | Código de tributação nacional deve existir na lista de serviços nacional. |
| `E0312` | `cTribNac` | `cTribNac` deve estar administrado pelo município de incidência do ISSQN. |
| `E0314`/`E0315` | `cTribMun` | Deve existir/estar administrado pelo município; `000` não é permitido. |
| `E0316` | `cNBS` | Código NBS deve existir (ANEXO_B-NBS2). |
| `E0322` | `cNBS` | Se o bloco `IBSCBS` foi informado, `cNBS` é obrigatório. |
| `E0302` | `cLocPrestacao` | Se informado, município deve existir na tabela IBGE. |
| `E0304` | `cPaisPrestacao` | Se informado, país deve existir (ISO2) e ser ≠ Brasil (BR). |

### 4.6 Valores e tributos (ISSQN)

| codErro | Campo | Resumo |
|---|---|---|
| `E0595` | `pAliq` | Alíquota não pode ser superior a **5%**. |
| `E0600`/`E0604` | `pAliq` | `pAliq` proibido quando prestador é MEI ou tem regime especial de tributação. |
| `E0602` | `pAliq` | `pAliq` proibido quando serviço é imune, exportação ou não-incidente. |
| `E0619`/`E0621`/`E0628`/`E0640` | `pAliq` | `pAliq` **obrigatório** em conjuntos de condições específicas (ver texto integral no JSON). |
| `E0529`/`E0530`/`E0532` | `tribISSQN` | Coerência de `tribISSQN` (1=tributável, 2=imune, 3=exportação, 4=não-incidência) com tipo de serviço/local. `E0532`: `tribISSQN=4` obrigatório quando o serviço prestado for 99.01.01. |
| `E0580` | `tpRetISSQN` | Sem retenção (`tpRetISSQN=2/3`) quando serviço é imune/exportação/não-incidente. |
| `E0592`/`E0593` | `tpImunidade` | Obrigatório só quando `tribISSQN=2`; valor `0` não permitido em certos contextos. |
| `E0425` | `vReceb` | `vReceb` não pode ser menor que `vServ`. |
| `E0427`/`E0444`/`E0447` | `vServ`/`pDR`/`vDR` | Dedução/redução (`vDR`/`pDR`/`vCalcDR`) não pode resultar BC negativa (`E0427`); `E0444`/`E0447` impedem que a dedução/redução reduza a alíquota efetiva de ISSQN abaixo de 2% (salvo subitens listados). |
| `E0453` | `pDR` | Se informado, o valor percentual de dedução/redução deve ser maior que 0 e menor ou igual a 100%. |
| `E0533`–`E0537` | `BM` | Benefício municipal proibido quando serviço imune/exportação/não-incidente, regime especial, ou município não ativo (efeito `Obrig.`). |

### 4.7 Substituição (`subst`)

| codErro | Campo | Resumo |
|---|---|---|
| `E0042` | `chSubstda` | Chave a substituir inválida: verificar DV **e** correspondência exata (cMun/tpInsc/Insc) com o `id` desta DPS. (`AnexoI!RN DPS_NFS-e:r170`) |
| `E0044` | `chSubstda` | NFS-e a substituir inexistente. |
| `E0046` | `chSubstda` | NFS-e cancelada não pode ser substituída. |
| `E0050` | `chSubstda` | Substituição fora do prazo parametrizado pelo município. |

### 4.8 Assinatura XMLDSig da DPS

| codErro | Campo | Resumo |
|---|---|---|
| `E0714` | `Signature` | Assinatura da DPS deve ser válida. |
| `E0715`/`E0716` | `Signature` | Certificado da assinatura inválido / fora do padrão NFS-e. |
| `E0717` | `Signature` | Assinatura **obrigatória** ao enviar para o Web Service. |
| `E0718` | `Signature` | Assinatura deve ser feita com o certificado do **emitente da DPS**. |

> As regras `E1630`–`E1638` são o espelho na NFS-e (assinatura do município emissor) — não aplicáveis ao contribuinte emissor, mas presentes no JSON.

---

## 5. Notas de implementação para a lib

- **Validar offline antes de consumir o `DpsCounter`.** A ordem barata→cara: (a) montar `infDPS` e checar guards de `buildDps`; (b) `validate-xml` (XSD WASM) pega `E1235` sem rede; (c) só então assinar, gastar counter e fazer `POST`.
- **Guards de `buildDps` que já existem** (`src/nfse/build-dps.ts`, todos `RuleViolationError`): `regApTribSN` obrigatório quando `opSimpNac=MeEpp` (antecipa `E0166`); `aliqIss` na faixa percentual — rejeita `0 < x < 0.5` por suspeita de fração-vs-percentual (relaciona-se a `E0595` ≤5%); `verAplic` 1-20 chars `TSVerAplic`. Considerar guards adicionais para os campeões de rejeição: DV de CNPJ/CPF (`E0080`/`E0096`/`E0188`/`E0206`), `xNome` presença/ausência por `tpEmit` (`E0121`/`E0122`), `pAliq > 5` (`E0595`).
- **A assinatura usa o certificado do EMITENTE**, não o de transmissão (`E0718`). O `PendingEvent.xmlAssinado` deve sempre já vir assinado antes de persistir no `RetryStore` (ver invariantes do CLAUDE.md).
- **`POST /nfse` retorna 400 com corpo de rejeição** (`NFSePostResponseErro`) — usar `acceptedStatuses:[400]` e mapear o `codErro` do corpo para o erro tipado; não tratar como `HttpStatusError`.
- **Muitas regras dependem de cadastro/parametrização municipal** (ex.: `E0016`/`E0038`/`E0160`/`E0314`/`E0537`) — não validáveis offline; só a Sefin decide. Consultar `parametros-municipais` ajuda a antecipar, mas o veredito é do servidor.
- **`id` da DPS** é variável (depende de série/número), embora `emissao.campos.json` (seq 101) registre `tamanho=45`; gerar via `buildDpsId` seguindo a fórmula de `E0004`.

---

## 6. Como consultar os JSONs

```bash
# Contagens (sanidade)
python3 -c "import json;d=json.load(open('specs/ruleset/emissao.campos.json'));print(len(d))"            # 416
python3 -c "import json;d=json.load(open('specs/ruleset/emissao.regras.json'));print(len(d['recepcao']),len(d['negocio']))"  # 16 440

# Texto integral de uma regra por codErro
jq '.negocio[] | select(.codErro=="E0004")' specs/ruleset/emissao.regras.json

# Todas as regras que tocam um campo
jq -r '.negocio[] | select(.campo=="pAliq") | "\(.codErro)\t\(.regra[0:80])"' specs/ruleset/emissao.regras.json

# Detalhe de um campo do leiaute (tipo/tamanho/ocorrência)
jq '.[] | select(.campo=="cTribNac")' specs/ruleset/emissao.campos.json

# Campos de um grupo (ex.: tributos municipais)
jq -r '.[] | select(.caminho | test("valores/trib/tribMun")) | "\(.seq)\t\(.campo)\t\(.ocorrencia)"' specs/ruleset/emissao.campos.json
```
