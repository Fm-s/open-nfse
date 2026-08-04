# Standards watch — NFS-e Padrão Nacional

> **Como usar:** cole no Claude Code: *"Leia `specs/standards-watch.md` e execute a verificação de mudanças no padrão."* Ao final de cada verificação, atualize a seção **Histórico de checagens** deste arquivo (e o "Radar do padrão" no README, se algo mudou).

## Estado da lib na última checagem (2026-08-03, v0.10.1)

- A lib está alinhada ao **leiaute vigente em produção**: XSDs RTC v1.01 bundle 20260209 (`schemas/1.01/`) = NT 004 + `tpRetPisCofins` (NT 007). Grupos `IBSCBS` completos em domain/parser/builder/ruleset.
- **03/08/2026 (hoje)** — obrigatoriedade dos grupos IBS/CBS com regras de validação ativas, **no leiaute vigente** (não é a NT 009) — **confirmada, sem prorrogação** (notícia de 28/07/2026). Simples Nacional: só a partir de 2027. Nenhuma mudança de código necessária; regra server-side (o XSD mantém `IBSCBS` opcional).
- **CNPJ alfanumérico entra em produção em 10/08/2026 — desacoplado da NT 009.** Em 27/07/2026 o CGNFS-e publicou em Produção Restrita o bundle **`esquemas-nfse-rtc-v1-01-20260727.zip`** (mesma versão 1.01, sem tipos novos; só padrões). Diff mapeado em 03/08/2026 contra `schemas/1.01/` (bundle 20260209):
  - `TSCNPJ`: `[0-9]{14}` → `[0-9A-Z]{14}`.
  - `TSIdDPS`: `DPS[0-9]{42}` → `DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}` (tpInsc 1=CPF numérico, 2=CNPJ alfanumérico).
  - `TSIdNFSe`: `NFS[0-9]{50}` → `NFS[0-9]{9}[0-9A-Z]{14}[0-9]{27}`.
  - `TSChaveNFSe`: `[0-9]{50}` → `[0-9]{6}([0-9A-Z]{14})[0-9]{30}`; `TSChaveNFe`: `[0-9]{44}` → `[0-9]{6}([0-9A-Z]{14})[0-9]{24}`.
  - `TSIdPedRegEvt`: `PRE[0-9]{56}` → `PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}`; `TSIdEvento`: `EVT[0-9]{59}` → `EVT[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{36}` (+ mesmo ajuste no tipo da referência de anulação).
  - `TSSerieDPS`: o oficial **corrigiu** o pattern quebrado `^0{0,4}\d{1,5}$` para `[0-9]{1,4}|[0-8][0-9]{4}` — ao adotar o bundle, **remover a deviation libxml-compat** de `schemas/1.01/tiposSimples_v1.01.xsd` (nota: o novo pattern rejeita séries 90000–99999).
  - Higiene: `TSDateTimeUTC` (classes de char corrigidas), patterns não-em-branco `[\s\S]*[^\s][\s\S]*` em vários tipos string, `xmldsig-core-schema.xsd` sem DOCTYPE.
  - **Ação (janela ~10/08/2026):** adotar o bundle 20260727 em `schemas/1.01/` + `generate-schemas.mjs` quando entrar em produção (não antes — a SEFIN de produção ainda valida com o bundle 20260209); revisar builders/validadores que assumem IDs/chaves 100% numéricos (`dps-id`, `buildEventoPedidoId`, parsing de chave). `validateCnpj` já cobre o DV alfanumérico. Cópia do bundle já baixada em `schemas/1.01-20260727-prodrest/` (fonte: gov.br/nfse → Documentação Técnica → Produção Restrita, `esquemas-nfse-rtc-v1-01-20260727.zip`).
- **NT 009/2026** (pdf atual v1.0.1; substitui as NTs 005 e 007) — **segue adiada**: comunicado oficial de que "não estará disponível nos ambientes de Produção e Produção Restrita em agosto/2026"; cronograma continua sem data. Anexos publicados: Anexo VI Leiautes V1.04.00, Anexo VII IndOp V1.02.00.
- **Cronograma de implantação divulgado em 28/07/2026** (funcionalidades da plataforma, não NT 009): 03/08 — Consulta Pública exibe grupos IBS/CBS; DANFSe conforme NT 008 na Consulta Pública/Portal do Contribuinte/Painel Municipal. 10/08 — CNPJ alfanumérico; Emissor Web completo com IBS/CBS; Emissor Web de Decisões Adm./Judiciais (bypass) com IBS/CBS; ajuste de enquadramento do Simples Nacional na Substituição de notas.
- Fatos geradores de locação (subitens 99.02–99.04) adiados separadamente — locadoras aguardam novo cronograma.
- **NT 008/2026** (v1.02, 14/07/2026) — **API oficial de geração do DANFSe suspensa em 03/08/2026** (prazo prorrogado 2x: 01/07 → 15/07 → 03/08). Emissão manual pelo Portal Nacional continua. Novo leiaute nacional único do DANFSe: multi-tributo com campos IBS/CBS obrigatórios, regras visuais/tipográficas, QR Code e paridade total com o XML — sistemas emissores geram o PDF localmente. **Impacto na lib:** desde a v0.10.1 o default de `gerarDanfse` é `'local'` e o caminho online (`'auto'`/`'online'`/`consultarDanfse`) está deprecated com log `danfse.online.deprecated`. **Pendência:** adequar o renderer local ao leiaute nacional único **"DANFSe v2.0"** da NT 008 (baixar os anexos oficiais — leiaute, regras visuais, QR Code — e conformar o pdfkit); remover o caminho online após 03/08/2026. **Gaps concretos do renderer vs v2.0** (mapeados em 25/07/2026 contra a referência MIT https://github.com/wedigibrasil/notaas-danfse — validar contra os anexos oficiais antes de implementar): blocos ausentes de destinatário e intermediário; tributação municipal detalhada (imunidade, suspensão, benefício municipal, deduções, desconto incondicionado); tributação federal (IRRF, contribuições retidas, PIS/COFINS); IBS/CBS detalhado (CST/cClassTrib, indOp, vBC ajustada, alíquotas efetivas mun/UF, vIBSMun/vIBSUF/vIBSTot, pCBS/vCBS); bloco de identificação completo (dCompet, nº/série DPS, finalidade, situação) com QR Code de 15,2×15,2 mm; totais com "líquido + IBS/CBS"; textos de supressão com redação oficial; watermarks CANCELADA/SUBSTITUÍDA; canhoto opcional; logo oficial; tipografia/margens da spec (labels 6pt bold, valores 7pt, margens 6/10 mm, cabeçalhos #f2f2f2).

## Tarefa de verificação

Pesquise na web (WebSearch/WebFetch) e responda cada pergunta abaixo. Fontes primárias primeiro:

- Notícias oficiais: https://www.gov.br/nfse/pt-br/noticias
- Documentação técnica: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica (seções "Documentação Atual", "RTC", "Atualizações e Implantações")
- Secundárias úteis: blog.tecnospeed.com.br, totvs.com/blog/fiscal-clientes, fenacon.org.br
- Buscas sugeridas: `NFS-e Padrão Nacional nota técnica <ano> cronograma NT 009`, `NFS-e Nacional XSD nova versão leiaute`, `gov.br NFS-e notícias <mês/ano>`

### Perguntas a responder

1. **Cronograma da NT 009 foi publicado?** Datas para Produção Restrita e Produção?
2. **XSDs novos (versão > 1.01) foram publicados?** Onde baixar o bundle?
3. **Saíram NTs novas (010+) ou novas versões das existentes?** O que mudam?
4. **Anexo II (eventos SEFIN/ADN) mudou?** A lib está alinhada ao v1.01-20260122 (proveniência em `specs/ruleset/transporte.md`) — `Id` de evento `PRE + chave(50) + tipoEvento(6)`, sem `nPedRegEvento`.
5. **Algo relevante sobre a obrigatoriedade de 03/08/2026?** (prorrogação, novas regras de rejeição, FAQ oficial)
6. **CNPJ alfanumérico na DPS**: o bundle XSD 20260727 (campos N → C) já entrou em produção (previsto 10/08/2026)? O bundle de produção em "Documentação Atual" foi atualizado?

### O que fazer conforme o resultado

- **XSDs novos publicados** → seguir o workflow "Tax-reform timeline" do CLAUDE.md: baixar bundle em `schemas/X.YZ/`, apontar `generate-schemas.mjs`, diffar TCxxx, atualizar `domain.ts`/`enums.ts`/`parse-xml.ts`, capturar sample real em `specs/samples/`, bump MINOR. Atenção aos pontos já mapeados da NT 009: renames (`vCalcDR`→`vCalcAjusteBCISSQN` etc.), `vDedRed`+`gReeRepRes`→`vAjusteBC`, novos grupos `gIBSCBSAjuste`/`gPgtoVinc`/`gLocacao`/`gUnidImob`/`gTribSN`, `finNFSe` com domínios 1 (crédito) e 2 (débito) + `tpNFSeDebito`/`tpNFSeCredito`, CNPJ N→C, corte temporal PIS/COFINS na base (saem em 2027).
- **Só cronograma publicado** → atualizar este arquivo e o "Radar do padrão" no README com as datas; planejar a janela de implementação.
- **Nada mudou** → registrar a checagem no histórico abaixo e sugerir a próxima data.

## Histórico de checagens

| Data | Resultado | Próxima checagem sugerida |
|---|---|---|
| 2026-07-25 | NT 009 adiada, sem cronograma/XSDs. Obrigatoriedade IBS/CBS mantida para 03/08/2026 no leiaute vigente (já coberto). `validateCnpj` ganhou suporte a CNPJ alfanumérico. | **~2026-08-08** (logo após a virada de 03/08, quando o CGNFS-e tende a publicar o cronograma da NT 009); depois, a cada 3–4 semanas até o cronograma sair. |
| 2026-08-03 | **CNPJ alfanumérico na DPS chega em 10/08/2026, sem NT 009**: bundle `esquemas-nfse-rtc-v1-01-20260727.zip` em Produção Restrita (diff mapeado acima — só padrões, sem tipos novos; inclui correção oficial do `TSSerieDPS`). NT 009 oficialmente fora de agosto/2026, cronograma segue sem data. Obrigatoriedade IBS/CBS de 03/08 confirmada sem prorrogação. Anexo II segue v1.01-20260122 (lib alinhada). Sem NT 010+. NT 008: DANFSe pelo Portal/Consulta Pública a partir de 03/08. | **2026-08-10/11** (entrada do CNPJ alfanumérico em produção → adotar o bundle 20260727 em `schemas/1.01/`, remover a deviation do `TSSerieDPS`, revisar builders de Id/chave). |
