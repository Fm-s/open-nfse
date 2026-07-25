# Standards watch — NFS-e Padrão Nacional

> **Como usar:** cole no Claude Code: *"Leia `specs/standards-watch.md` e execute a verificação de mudanças no padrão."* Ao final de cada verificação, atualize a seção **Histórico de checagens** deste arquivo (e o "Radar do padrão" no README, se algo mudou).

## Estado da lib na última checagem (2026-07-25, v0.9.1)

- A lib está alinhada ao **leiaute vigente em produção**: XSDs RTC v1.01 (`schemas/1.01/`) = NT 004 + `tpRetPisCofins` (NT 007). Grupos `IBSCBS` completos em domain/parser/builder/ruleset.
- **03/08/2026** — obrigatoriedade do preenchimento dos grupos IBS/CBS com regras de validação ativas, **no leiaute vigente** (não é a NT 009). Simples Nacional: só a partir de 2027. Nenhuma mudança de código foi necessária na lib; a obrigatoriedade é regra de negócio server-side (o XSD mantém `IBSCBS` opcional).
- **NT 009/2026** (publicada 04/06/2026, atualizada 15/07/2026; substitui as NTs 005 e 007) — **adiada**: nada dela vale em agosto/2026. Cronograma e XSDs "serão publicados nas próximas semanas" (promessa em aberto desde junho/2026). Anexos já publicados: Anexo VI Leiautes V1.04.00, Anexo VII IndOp V1.02.00.
- `validateCnpj` já aceita **CNPJ alfanumérico** (IN RFB nº 2.229/2024): DV por ASCII−48. O leiaute da DPS só aceita letras no CNPJ com a NT 009 (campos N → C).
- Fatos geradores de locação (subitens 99.02–99.04) adiados separadamente — locadoras aguardam novo cronograma.
- **NT 008/2026** (v1.02, 14/07/2026) — **API oficial de geração do DANFSe suspensa em 03/08/2026** (prazo prorrogado 2x: 01/07 → 15/07 → 03/08). Emissão manual pelo Portal Nacional continua. Novo leiaute nacional único do DANFSe: multi-tributo com campos IBS/CBS obrigatórios, regras visuais/tipográficas, QR Code e paridade total com o XML — sistemas emissores geram o PDF localmente. **Impacto na lib:** `consultarDanfse` (online-only) morre; `gerarDanfse` `'auto'`/`'online'` perdem o caminho online; o renderer local (pdfkit) precisa ser adequado ao leiaute da NT 008. Pendências: adequar o renderer, trocar default para `'local'`, deprecar/remover o caminho online.

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
4. **Anexo II (eventos SEFIN/ADN) mudou?** A lib está alinhada ao v1.00-20251226 — `Id` de evento `PRE + chave(50) + tipoEvento(6)`, sem `nPedRegEvento`.
5. **Algo relevante sobre a obrigatoriedade de 03/08/2026?** (prorrogação, novas regras de rejeição, FAQ oficial)
6. **CNPJ alfanumérico na DPS**: a NT que libera campos N → C entrou em vigor?

### O que fazer conforme o resultado

- **XSDs novos publicados** → seguir o workflow "Tax-reform timeline" do CLAUDE.md: baixar bundle em `schemas/X.YZ/`, apontar `generate-schemas.mjs`, diffar TCxxx, atualizar `domain.ts`/`enums.ts`/`parse-xml.ts`, capturar sample real em `specs/samples/`, bump MINOR. Atenção aos pontos já mapeados da NT 009: renames (`vCalcDR`→`vCalcAjusteBCISSQN` etc.), `vDedRed`+`gReeRepRes`→`vAjusteBC`, novos grupos `gIBSCBSAjuste`/`gPgtoVinc`/`gLocacao`/`gUnidImob`/`gTribSN`, `finNFSe` com domínios 1 (crédito) e 2 (débito) + `tpNFSeDebito`/`tpNFSeCredito`, CNPJ N→C, corte temporal PIS/COFINS na base (saem em 2027).
- **Só cronograma publicado** → atualizar este arquivo e o "Radar do padrão" no README com as datas; planejar a janela de implementação.
- **Nada mudou** → registrar a checagem no histórico abaixo e sugerir a próxima data.

## Histórico de checagens

| Data | Resultado | Próxima checagem sugerida |
|---|---|---|
| 2026-07-25 | NT 009 adiada, sem cronograma/XSDs. Obrigatoriedade IBS/CBS mantida para 03/08/2026 no leiaute vigente (já coberto). `validateCnpj` ganhou suporte a CNPJ alfanumérico. | **~2026-08-08** (logo após a virada de 03/08, quando o CGNFS-e tende a publicar o cronograma da NT 009); depois, a cada 3–4 semanas até o cronograma sair. |
