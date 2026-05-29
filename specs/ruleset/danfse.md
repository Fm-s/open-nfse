<!-- Fonte: NT-008 "Especificações Técnicas do DANFSe" — Nota Técnica Nº 008, Versão 1.0, 05/05/2026 (SE/CGNFS-e). PDF: specs/oficial/rtc/nt-008-se-cgnfse-danfse-20260505.pdf. Campos da NFS-e citados são cruzados com specs/ruleset/emissao.campos.json. -->

# DANFSe — Representação em PDF da NFS-e (NT-008 v1.0)

> **TL;DR** — O DANFSe é o **Documento Auxiliar da NFS-e** impresso em papel (NT-008 p.6): consulta resumida da NFS-e + apoio a processos do destinatário não-credenciado. **Não é o documento fiscal** (esse é a NFS-e XML); é só a representação. Layout obrigatório: **A4 retrato, página única**, modelo do **Anexo I** (NT-008 p.12, p.25), título **"DANFSe v2.0"**, com **QR-Code** apontando para a consulta pública nacional. Dois caminhos de obtenção na lib:
> 1. **ADN online** — `GET /{chaveAcesso}` no host DANFSe (`endpoints.danfse`) retorna o PDF oficial pronto. **Atenção: essa API será sobrestada (suspensa) em 1º de julho de 2026** (NT-008 p.6) — depois disso a geração passa a ser responsabilidade do emissor.
> 2. **Render local** — a lib monta o PDF a partir do XML da NFS-e (pdfkit + QR). É esse o caminho que precisa cumprir as regras desta NT.
>
> Esta NT é **só layout/QR**. Não introduz `codErro` de rejeição (rejeições vivem em `specs/ruleset/emissao.regras.json` / `eventos.regras.json`). Não há JSON sidecar exclusivo para o DANFSe — os **caminhos XML** de cada campo do layout estão na coluna "Caminho no XML" da tabela §2.4.5 da NT (pp.16-20) e podem ser cruzados com `specs/ruleset/emissao.campos.json` pelo nome do `campo`.

---

## 1. O que é, quando é exigido, e os modos

| Aspecto | Regra (NT-008) |
|---|---|
| Definição | Documento auxiliar da NFS-e impresso em papel (p.6, §2). |
| Objetivo | (a) consulta resumida dos dados; (b) apoio a processos do destinatário não-credenciado (p.6). |
| Papel | Qualquer tipo, **exceto papel jornal**; deve garantir contraste para leitura do QR (p.6, p.12 §2.2). |
| Vias | **Uma única via**, salvo disposição expressa em contrário (p.6). |
| Conteúdo | Só pode imprimir o que **consta no XML da NFS-e**. Nada que não esteja no arquivo (p.7 §2.1). |
| Ambiente de teste | NFS-e gerada em produção restrita (`tpAmb = 2 / Homologação`) **deve** trazer no cabeçalho **"NFS-e SEM VALIDADE JURÍDICA"** (p.6, p.15 §2.4.3). |

`tpAmb` (path `NFSe/infNFSe/DPS/infDPS/`) é o discriminante de homologação (confirmado em `emissao.campos.json`).

Na lib (`docs/guide/danfse.md`): `gerarDanfse(nfse, options)` com `strategy: 'auto' | 'online' | 'local'`. `auto` = ADN online com fallback para local apenas em falhas transientes; `consultarDanfse(chave)` = online-only. A NT corresponde ao caminho **`local`**.

---

## 2. Blocos / seções obrigatórios do layout

O modelo completo está no **Anexo I** (NT-008 p.25). A ordem e a disposição dos campos são **obrigatórias** (p.12 §2.2.4). Tabela bloco → conteúdo mínimo (NT-008 §2.1, pp.7-11):

| Bloco | Conteúdo mínimo (campos exigidos) | Fonte |
|---|---|---|
| **Cabeçalho** | Logomarca NFS-e (canto esq.); ao centro "DANFSe v2.0" + "Documento Auxiliar da NFS-e"; canto dir.: Município emitente, Ambiente Gerador, Tipo de Ambiente; QR-Code à direita. | p.14-15 §2.4.3 |
| **Dados de Identificação da NFS-e** | Chave de Acesso; Número da NFS-e; Competência; Data/Hora emissão NFS-e; Número da DPS; Série da DPS; Data/Hora emissão DPS; Emitente da NFS-e; Situação da NFS-e; Finalidade. | p.7 §2.1.2 |
| **Prestador / Fornecedor** | CNPJ/CPF/NIF; Indicador Municipal (Inscrição); Telefone; Nome/Nome empresarial; Município/Sigla UF; Código IBGE/CEP; Endereço\*; Email\*; Info Simples Nacional na Data de Competência; Regime de Apuração Tributária pelo SN. | p.7-8 §2.1.3 |
| **Tomador / Adquirente** | CNPJ/CPF/NIF; Indicador Municipal; Telefone; Nome; Município/Sigla UF; Código IBGE/CEP; Endereço\*; Email\*. | p.8 §2.1.4 |
| **Destinatário da Operação** | CNPJ/CPF/NIF; Telefone; Nome; Município/Sigla UF; Código IBGE/CEP; Endereço\*; Email\*. | p.8-9 §2.1.5 |
| **Intermediário da Operação** | CNPJ/CPF/NIF; Indicador Municipal; Telefone; Nome; Município/Sigla UF; Código IBGE/CEP; Endereço\*; Email\*. | p.9 §2.1.6 |
| **Serviço Prestado** | Código de Tributação Nacional/Municipal (`cTribNac`/`cTribMun`); Código da NBS (`cNBS`); Local da Prestação/Sigla UF/País; Descrição do código de tributação; Descrição do Serviço. | p.9 §2.1.7 |
| **Tributação Municipal (ISSQN)** | Tipo de Tributação ISSQN; Município/UF/País de incidência; Regime Especial\*; Tipo de Imunidade\*; Suspensão da Exigibilidade\*; Nº Processo Suspensão\*; Benefício Municipal\*; Cálculo do BM\*; Total Deduções/Reduções\*; Desconto Incondicionado\*; BC ISSQN; Alíquota Aplicada; Retenção do ISSQN; ISSQN Apurado. | p.9-10 §2.1.8 |
| **Tributação Federal (Exceto CBS)** | IRRF; Contribuição Previdenciária Retida; Contribuições Sociais Retidas; PIS — Débito Apuração Própria\*; COFINS — Débito Apuração Própria\*; Descrição das Contribuições Sociais Retidas\*. | p.10 §2.1.9 |
| **Tributação IBS/CBS** | CST/`cClassTrib`; Indicador de Operação/cód. IBGE incidência/Município/UF; Exclusões e Reduções da BC; BC após exclusões; Reduções de alíquota IBS/CBS; Alíquota IBS Estadual/Municipal; Alíquota Efetiva e Valor Apurado IBS Mun./Est.; Valor Total Apurado IBS; Alíquota CBS; Alíquota Efetiva CBS; Valor Total Apurado CBS. | p.10-11 §2.1.10 |
| **Valor Total da NFS-E** | Valor da Operação/Serviço; Desconto Incondicionado; Desconto Condicionado; Total das Retenções (ISSQN/Federais); Valor Líquido da NFS-e; Total do IBS/CBS; Valor Líquido da NFS-e + IBS/CBS. | p.11 §2.1.11 |
| **Informações Complementares** | (quando preenchidos) Dados dos blocos Imóvel, Obra, Evento, Informações Complementares; Informações de uso da Administração Municipal; **Totais Aproximados dos Tributos** (obrigatório — Lei 12.741/2012). | p.11 §2.1.12 |
| **Canhoto (Opcional)** | Data de cientificação; Identificação e Assinatura; Nº da NFS-e / Chave da NFS-e. | p.11 §2.1.13 |

\* Campos marcados podem ter a **linha suprimida** mesmo havendo dado no XML (Nota 1 da §2.4.5, p.20).

A tabela detalhada por campo (caminho XML, alturas/larguras em cm, posição X/Y à margem, tamanhos máximos de caractere, observações de concatenação) está em **NT-008 §2.4.5, pp.16-20** — **não duplicada aqui**; consultar o PDF para medidas. Os campos referenciam tags reais da NFS-e (cruzar com `specs/ruleset/emissao.campos.json` via nome do `campo`).

---

## 3. QR-Code — composição EXATA da URL (NT-008 p.14 §2.4.3)

### Regra crítica

O QR-Code codifica uma URL de **consulta pública nacional**, montada por **concatenação literal** do endereço-base com o sinal de igual e a **Chave de Acesso** (50 dígitos):

```
https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=<CHAVE_DE_ACESSO_50_DIGITOS>
```

NT-008 p.14, citação literal: *"…dispor código de barras bidimensional (QR Code), para consulta rápida via dispositivos móveis, indicando o endereço: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=`, adicionando, após o sinal de igual (=), a Chave de Acesso da respectiva NFS-e"*.

| Componente | Valor / origem | Observação |
|---|---|---|
| Base | `https://www.nfse.gov.br/ConsultaPublica/` | Literal, fixo. |
| Param fixo | `tpc=1` | Literal, fixo. |
| Param chave | `chave=<chave>` | Concatenar **após o `=`** a Chave de Acesso. |
| Chave | `NFSe/infNFSe/@Id` **sem o prefixo "NFS"** | 50 dígitos, bloco único (p.7 §2.1.1; tabela p.16: "Informar o id da NFS-e sem o prefixo 'NFS'", tam. 50). |

A Chave de Acesso impressa (campo "CHAVE DE ACESSO DA NFS-E") é o `Id` da NFS-e sem o prefixo `NFS` — **50 dígitos em bloco único** (p.7, p.16). É exatamente a mesma string que vai no parâmetro `chave=`. A lib já valida `/^\d{50}$/` antes de tocar a rede (`docs/guide/danfse.md`).

### Geometria/contraste do QR (NT-008 p.14-15)

| Parâmetro | Valor | Fonte |
|---|---|---|
| Dimensões mínimas | **1,52 cm × 1,52 cm** | p.14 |
| Coordenadas X / Y | X: **17,48 cm**, Y: **1,67 cm** | p.14 (tabela §2.4.5 p.16: "QUADRO DO QR CODE" 1,52×1,52 @ 17,48/1,67) |
| Texto abaixo do QR | *"A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e"* — em **3 linhas, 6 pts**, normal, Microsoft Sans Serif | p.14-15 |
| Contraste | Papel deve garantir contraste para leitura do QR (p.6, p.12 §2.2) | p.6/p.12 |

> **(verificar na fonte — NT-008 p.14)**: a NT especifica apenas a URL e a geometria; **não** define explicitamente nível de correção de erro, módulo size, nem encoding (UTF-8/byte) do QR. Usar default razoável (ECC M, byte mode UTF-8) e validar leitura.

---

## 4. Regras de geração / conformidade impostas pela NT

### 4.1 Formulário (NT-008 §2.2, p.12)

| Regra | Valor | Fonte |
|---|---|---|
| Orientação / tamanho | **Retrato**, mínimo **A4 (210×297 mm)** | p.12 §2.2.1 |
| Páginas | **Uma única página, obrigatoriamente** | p.12 §2.2 |
| Margens (todas as laterais + sup./inf.) | mín. **0,15 cm**, máx. **0,20 cm** | p.12 §2.2.2 |
| Linhas divisórias dos blocos | **0,5 (meio) ponto** de espessura | p.12 §2.2.3 |
| Borda da página | **1 (um) ponto** de espessura | p.12 §2.2.3 |
| Sombreamento (fundo cinza claro **5%**) | cabeçalho, títulos de bloco, campos **"Emitente da NFS-e"** e **"Valor Líquido da NFS-e + IBS/CBS"** | p.12 §2.2.3 |
| Demais campos | fundo branco (0%) | p.12 §2.2.3 |
| Modelo | obrigatoriamente o do **Anexo I** (p.25) | p.12 §2.2.4 |

### 4.2 Fontes (NT-008 §2.4, pp.13-15)

| Elemento | Fonte | Tamanho | Estilo | Fonte (pág.) |
|---|---|---|---|---|
| Cor / espaçamento geral | preto sólido (K100), espaçamento normal | — | — | p.13 §2.4 |
| Títulos (labels) dos **blocos** | **Arial** | **7 pts** | negrito, **caixa alta** | p.14 §2.4.1 |
| Títulos (labels) dos **campos** | Arial | **6 pts** | negrito, 1ª letra maiúscula | p.14 §2.4.2 |
| Labels do bloco Identificação (§2.1.2) | Arial | **7 pts** | negrito, **caixa alta** | p.14 §2.4.2 |
| Conteúdo dos campos (geral) | **Microsoft Sans Serif** | **7 pts** | normal | p.14 §2.4.3 / §2.4.4 |
| "DANFSe v2.0" + "Documento Auxiliar da NFS-e" (centro cabeçalho) | Arial | **9 pts** | negrito | p.14 §2.4.3 |
| Município / Ambiente Gerador / Tipo Ambiente (canto dir.) | Microsoft Sans Serif | Município **8 pts**, ambiente/tipo **6 pts** | normal | p.14 §2.4.3 |
| Texto sob o QR | Microsoft Sans Serif | **6 pts** | normal, 3 linhas | p.14-15 §2.4.3 |
| **"NFS-e SEM VALIDADE JURÍDICA"** (só `tpAmb=2`) | Arial | **9 pts** | negrito, **vermelho sólido (M100/Y100)**, abaixo de "Documento Auxiliar da NFS-e" | p.15 §2.4.3 |

> **Importante**: a NT diz "Microsoft **Sans Serif**" (não "Sans"). O guia da lib (`docs/guide/danfse.md`) admite usar Helvetica built-in do PDF como aproximação — isso é uma **divergência consciente** da NT (a NT pede Arial + Microsoft Sans Serif). Anotar como trade-off de conformidade visual, não funcional.

### 4.3 Marca d'água por situação da NFS-e (NT-008 §2.5, p.23)

| Situação | Marca d'água | Estilo | Fonte |
|---|---|---|---|
| NFS-e **cancelada** | **"CANCELADA"** | diagonal, normal, mín. **50 pts**, Arial, cinza **K35** | p.23 §2.5.1 |
| NFS-e **substituída** | **"SUBSTITUÍDA"** | diagonal, normal, mín. **50 pts**, Arial, cinza **K35** | p.23 §2.5.2 |
| Teste (produção restrita, `tpAmb=2`) | **"NFS-e SEM VALIDADE JURÍDICA"** (no cabeçalho, **não** é marca d'água diagonal) | ver §4.2 | p.6, p.15 |

### 4.4 Supressões e modificações permitidas (NT-008 §2.3, pp.12-13 + Notas 2-4, pp.20-21)

| Caso | Ação permitida | Texto fixo a imprimir | Fonte |
|---|---|---|---|
| Tomador/Adquirente, Destinatário, Intermediário e/ou ISSQN não preenchidos/não aplicáveis | suprimir campos do bloco e imprimir só o texto fixo; aumentar altura de "Descrição do Serviço" e/ou "Informações Complementares" pelo mesmo valor | `"TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"`, `"DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"`, `"INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"`, `"TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN"` | p.12-13 §2.3.1; Notas 2 e 4 p.20-21 |
| Destinatário = próprio Tomador/Adquirente | suprimir bloco Destinatário; imprimir texto fixo | `"O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO"` | p.13 §2.3.2; Nota 3 p.21 |
| Bloco de Canhoto não usado | suprimir e deslocar campos seguintes para cima pelo mesmo valor | — | p.13 §2.3.3 |
| Limitação de impressora (margem maior) | reduzir **somente** a altura do bloco "Informações Complementares", deslocando o resto para baixo | — | p.24 §2.5.3 |

Para blocos suprimidos: **altura mínima 0,32 cm e largura mínima 20,40 cm**; coordenadas X/Y ajustadas conforme dados preenchidos (Notas 2, 3, 4, p.20-21).

### 4.5 Regras de conteúdo condicional (Notas da §2.4.5, pp.20-21)

| Nota | Regra | Fonte |
|---|---|---|
| 1 | Linha pode ser suprimida mesmo havendo dado no XML (Endereço, Email). | p.20 |
| 5 | Linha pode ser suprimida se **não existirem dados em todos os campos da mesma linha** no XML (campos ISSQN/BM/deduções). | p.21 |
| 6 | Linha de Tributação Federal só impressa para NFS-e com competência **até o fim do ano-calendário de 2026**. | p.21 |
| 12 | Campos sem informação no XML devem ser preenchidos com **traço (`-`)**. | p.22 |

---

## 5. Notas de implementação para a lib (renderer local)

Para o caminho `strategy: 'local'` ser conforme à NT-008, o renderer precisa garantir:

1. **Página única A4 retrato** (p.12). Se o conteúdo estourar, comprimir **apenas** "Informações Complementares" / "Descrição do Serviço" — nunca quebrar em 2ª página.
2. **Título exato "DANFSe v2.0"** + "Documento Auxiliar da NFS-e" no centro do cabeçalho (p.14). O guia atual da lib usa "DANFS-e" no cabeçalho — **divergência da NT** (a NT pede "DANFSe v2.0"); alinhar.
3. **QR-Code** = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=<chave 50 dígitos>` (p.14). O `urlConsultaPublica` override do guia da lib **não pode** substituir esse endereço se o objetivo é conformidade nacional — o QR oficial é fixo no domínio `nfse.gov.br`. Override só é aceitável para link textual de prefeitura, não para o QR de autenticidade.
4. **Watermark por situação**: "CANCELADA" / "SUBSTITUÍDA" diagonal, 50 pts mín., Arial, cinza K35 (p.23). O guia da lib só menciona watermark de HOMOLOGAÇÃO — **faltam** CANCELADA/SUBSTITUÍDA; precisam ser lidos de `cStat` da NFS-e.
5. **"NFS-e SEM VALIDADE JURÍDICA"** quando `tpAmb=2` (path `NFSe/infNFSe/DPS/infDPS/tpAmb`): no cabeçalho, vermelho M100/Y100, 9 pts, Arial (p.15) — **não** confundir com a opção `ambiente: Ambiente.ProducaoRestrita` do guia; o discriminante correto é o `tpAmb` do próprio XML.
6. **Totais Aproximados dos Tributos obrigatórios** em "Informações Complementares" (p.11, Nota 10 p.21): formato literal `"Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ ou % ; Estaduais: R$ ou % ; Municipais: R$ ou %"`. Fonte dos valores: `vTotTribFed` / `vTotTribEst` / `vTotTribMun` (path `.../valores/trib/totTrib/vTotTrib/`, confirmados em `emissao.campos.json`).
7. **Substituição** (Nota 7, p.21): imprimir em Informações Complementares `"NFS-e Subst.: " + chave da NFS-e substituída`. A NT nomeia o campo como **`chSubstda`** tanto na coluna de concatenação (p.20, onde o token aparece quebrado em duas linhas — `chSubstd` + `a` — pela largura estreita da coluna) quanto no texto da Nota 7 (p.21) — o leiaute real (`emissao.campos.json`) tem **`chSubstda`** em `NFSe/infNFSe/DPS/infDPS/subst`. **Usar `chSubstda`** (a grafia `chSubst` é apenas artefato de extração da coluna estreita, não um token do schema).
8. **Obra/Imóvel** (Nota 8, p.21): `"Cod. Obra: " + cObra` e `"Insc. Imob.: " + inscImobFisc` (paths `.../serv/obra/`, confirmados). **Evento** (Nota 9): `"Cod. Evt.: " + idAtvEvt` (path `.../serv/atvEvento/`, confirmado).
9. **Separador de Informações Complementares**: campos separados por **pipes (`|`)** (tabela p.20). Tamanho máx. da união: **2000** caracteres (truncar com reticências `...`, preservando a linha fixa de Totais).
10. **Campos vazios → traço `-`** (Nota 12, p.22). Reticências `(...)` quando texto excede o tamanho máximo do campo (várias notas da tabela §2.4.5).
11. **Fontes**: NT pede Arial (labels) + Microsoft Sans Serif (conteúdo). Helvetica built-in é aproximação aceitável funcionalmente, mas **não pixel-perfect** — documentar como o guia já faz.
12. **Não imprimir nada fora do XML** (p.7) e **não imprimir os asteriscos** do modelo (são marcadores de nota — OBS do Anexo I, p.25).

### Ponto de atenção de roadmap

A **API ADN de geração do DANFSe será sobrestada em 1º/07/2026** (p.6). Após essa data, `strategy: 'online'` / `consultarDanfse` deixarão de funcionar para geração — o `auto` cairá sempre no render local. A lib deve tratar a indisponibilidade do endpoint ADN como transiente (já cai no local) mas convém documentar a data-limite para os consumidores.
