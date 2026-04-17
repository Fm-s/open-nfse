# Roadmap — open-nfse

Plano de desenvolvimento por versão. Datas são estimativas; prioridade é estabilidade sobre velocidade.

## Princípios

1. **Consultar antes de emitir.** Começamos pelas operações de leitura porque o risco é menor — se falhar, só refaz. Emissão exige validação mais rigorosa.
2. **Entregar valor cedo.** A v0.1 já resolve o caso de uso "relatório mensal pro contador", mesmo sem emissão.
3. **API pública imutável após v1.0.** Mudanças de breaking change seguem semver estrito.
4. **Nenhuma feature entra sem cobertura de testes automatizados.**

---

## v0.1 — MVP: Consulta e Distribuição (DF-e)

**Objetivo:** permitir que qualquer dev com certificado consulte e baixe NFS-e emitidas ou recebidas pelo CNPJ.

**Entregas:**
- [ ] Cliente HTTP com autenticação mTLS
- [ ] Carregamento de certificado A1 a partir de Buffer/arquivo
- [ ] Consulta por NSU (`GET /DFe/{ultimoNSU}`) com paginação
- [ ] Parser dos DF-e retornados (XML → objetos tipados)
- [ ] Consulta de NFS-e por chave de acesso
- [ ] Tratamento de descompactação GZip + decode Base64
- [ ] Erros tipados para códigos de retorno comuns (401, 403, 404, 5xx)
- [ ] Configuração de ambiente (Produção Restrita vs Produção)
- [ ] Logging estruturado com hooks configuráveis
- [ ] Cobertura de testes ≥ 80%

**Fora do escopo:** emissão, eventos, DANFSe.

**Critério de release:** integração real com Produção Restrita funcionando em pelo menos 2 CNPJs diferentes.

---

## v0.2 — Emissão Síncrona

**Objetivo:** emitir uma NFS-e válida a partir de um DTO limpo.

**Entregas:**
- [ ] Builder de DPS a partir de DTO tipado
- [ ] Geração do ID da DPS conforme regra oficial (prefixo + IBGE + tipo inscrição + CNPJ + série + número)
- [ ] Assinatura XML (XMLDSig) com:
  - Algoritmo RSA-SHA256
  - Canonicalization `xml-exc-c14n`
  - Transform `enveloped-signature`
- [ ] Validação XSD local antes do envio
- [ ] Compactação GZip + Base64 do payload
- [ ] `POST /nfse` síncrono
- [ ] Parser da resposta (sucesso, rejeição)
- [ ] Mapeamento completo dos códigos de rejeição `E****` em erros tipados
- [ ] Suporte inicial aos principais campos:
  - Regimes tributários (Simples Nacional, Lucro Presumido, Lucro Real, MEI)
  - Tomador Brasil / Exterior / Não Identificado
  - NBS e cClassTrib IBS/CBS
  - Retenções federais (IRRF, CSLL, CP)
  - Retenção de ISS
- [ ] Modo dry-run (valida e gera XML sem enviar)
- [ ] Exemplo funcional no repo

**Critério de release:** emitir nota real em Produção Restrita para um regime Simples Nacional completo (emissor + tomador + retenções).

---

## v0.3 — Eventos e Ciclo de Vida

**Objetivo:** cobrir todas as operações pós-emissão.

**Entregas:**
- [ ] Evento de cancelamento (`POST /nfse/{chave}/eventos`)
- [ ] Evento de substituição (cancelamento + emissão nova atômicos)
- [ ] Consulta de eventos por chave
- [ ] Consulta de eventos por chave + tipo
- [ ] Manifestação do tomador (quando aplicável)
- [ ] Validação de prazos municipais antes de tentar cancelar
- [ ] Códigos de justificativa enumerados

**Critério de release:** ciclo completo emitir → cancelar → substituir funcionando em Produção Restrita.

---

## v0.4 — DANFSe (PDF) Local

**Objetivo:** gerar a representação gráfica da NFS-e sem depender da API.

**Entregas:**
- [ ] Template oficial do DANFSe em HTML/CSS ou via biblioteca PDF
- [ ] Renderização a partir do XML autorizado
- [ ] QR Code de verificação
- [ ] Suporte a versão simplificada (MEI)
- [ ] Fallback: `GET /danfse/{chave}` se preferir o PDF oficial

**Critério de release:** PDF gerado localmente passa em validador visual comparado ao oficial.

---

## v0.5 — Parâmetros Municipais

**Objetivo:** consultar regras e alíquotas de cada município.

**Entregas:**
- [ ] `GET /parametros_municipais/...` wrappers tipados
- [ ] Cache em memória com TTL configurável
- [ ] Interface de cache plugável (pra Redis, etc.)
- [ ] Helper: calcular ISS devido com base no município + serviço + contribuinte

**Critério de release:** cache reduz chamadas em >95% em uso típico.

---

## v0.6 — DX e Developer Tooling

**Objetivo:** tornar a biblioteca agradável de usar e testar.

**Entregas:**
- [ ] `NfseClientFake` completo para testes de consumidores
- [ ] CLI (`npx open-nfse`) para operações manuais (consulta, teste de cert)
- [ ] Documentação com TypeDoc
- [ ] Site de documentação (Docusaurus ou similar)
- [ ] Exemplos em `/examples` para cenários comuns
- [ ] Guia de migração de gateways comerciais (NFE.io, PlugNotas, etc.)

---

## v1.0 — API Estável

**Objetivo:** primeira versão com garantia de compatibilidade.

**Entregas:**
- [ ] Cobertura 100% do Manual do Contribuinte v1.2
- [ ] Testes de integração contra Produção Restrita em CI
- [ ] Changelog seguindo Keep a Changelog
- [ ] Versionamento semântico rigoroso
- [ ] Uso em produção documentado (case studies)
- [ ] Auditoria de segurança

**Critério de release:** zero quebra de API em 3 meses, ≥ 5 projetos de produção usando.

---

## Pós v1.0 — Visão de longo prazo

### Evolução da Reforma Tributária (2026–2033)

A Reforma Tributária introduz IBS e CBS com transição gradual. Cada ano terá nova Nota Técnica da Receita mudando o layout. A lib acompanha com MINOR releases.

Cronograma previsto:
- 2026: NBS obrigatório, IBS/CBS opcionais
- 2027: IBS/CBS em teste (alíquota simbólica)
- 2029–2032: transição ICMS/ISS → IBS
- 2033: extinção de ICMS, ISS, PIS, COFINS

### Possíveis extensões

- `open-nfse-ingestion` — worker pronto pra polling de NSU com persistência
- `open-nfse-webhooks` — servidor HTTP pra receber notificações
- `open-nfse-storage` — abstração pra guardar XMLs (S3, disco, DB)
- `open-nfe` — irmão pra NF-e (produto), se fizer sentido no futuro
- `open-cte` — irmão pra CT-e (transporte), se fizer sentido no futuro
- Port pra Deno/Bun
- Biblioteca irmã para NF-e (produto) — possível, mas é outro mundo (SOAP, 27 SEFAZs)

### Comunidade

- Canal de Discord ou Telegram pra discussão técnica
- Reuniões mensais abertas sobre mudanças regulatórias
- Parceria com comunidades de contadores para feedback fiscal

---

## Como priorizamos

1. **Bugs que quebram emissão em produção** — imediato, patch release
2. **Mudanças regulatórias obrigatórias** — urgente, minor release
3. **Features pedidas por múltiplos usuários** — próxima minor
4. **Melhorias de DX** — acumulam até próximo milestone

Use as [GitHub Discussions](https://github.com/SEU_USUARIO/open-nfse/discussions) para sugerir prioridades.

---

## O que NÃO está no roadmap

Pra manter o foco, essas coisas estão explicitamente fora:

- ❌ Integração com ERPs específicos (Bling, Omie, Tiny, etc.) — faça wrappers em projetos separados
- ❌ Interface web / dashboard — é uma biblioteca, não um produto
- ❌ Persistência de notas emitidas — responsabilidade do sistema consumidor
- ❌ Fila/retry/orquestração — responsabilidade do sistema consumidor
- ❌ Suporte a emissores municipais legados (padrão ABRASF antigo) — obsoleto em 2026
- ❌ NF-e (produto) — outro padrão, outra complexidade, outro projeto

Se alguma dessas é importante pra você, considere construir **em cima** do `open-nfse` — a lib foi desenhada pra isso.