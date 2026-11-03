# Princípios de design

Compromissos da API pública. Mudanças aqui exigem bump de MINOR; histórico no [CHANGELOG](https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md).

## 1. DTO in, DTO out

Callers não veem XML, GZip, Base64, mTLS, XMLDSig — tudo entra e sai tipado. O campo `xmlNfse` cru é exposto como **escape hatch** (arquivar, re-assinar externamente), não como API primária.

## 2. Erros tipados, uma classe por modo de falha

`Error → OpenNfseError → grupo (HttpError/CertificateError/ValidationError) → concreto`. O ramo de status HTTP tem um nível a mais (`HttpError → HttpStatusError → NotFoundError`/`TooManyRequestsError`/…), e `ReceitaRejectionError` e `UnreadableAuthorizedNfseError` herdam direto de `OpenNfseError`. O caller escolhe a granularidade do catch (`ReceitaRejectionError` específico, `ServerError` para retry, `OpenNfseError` para re-throw com contexto). Hierarquia completa + exemplos em [Erros tipados](./erros).

## 3. Sem estado interno, com primitives de orquestração e retry

Sem banco, cache global ou singleton. Mas a lib oferece:

- **`emitirEmLote`** — worker pool client-side (SEFIN não tem endpoint batch).
- **`substituir`** — um único write: emite a DPS com `<subst>` e o sistema gera o 105102; retorna `ok`/`retry_pending`, sem rollback.
- **`RetryStore` + `replayPendingEvents`** — interface plugável para transientes + método cron-friendly. O re-POST reusa o mesmo `infDPS.Id` (emissão rejeitada com E0014/E1235 é reconciliada via `GET /dps/{id}`) e eventos deduplicam por `(chave, tipoEvento)`, então rodar o replay N vezes não cria documento novo.
- **`DpsCounter`** — provider atômico de `nDPS`, consultado só depois das validações offline.

Persistência durável, agendamento do replay e reconciliação com os seus próprios registros ficam com o consumidor. Schema SQL sugerido em [Integração em serviços](./integracao).

## 4. Schema-driven, um tipo por leiaute

Tipos em `src/nfse/domain.ts` derivam dos XSDs RTC v1.01 de cada leiaute (`nt004`: bundle `20260727`; `nt009`: `esquemas_prod_restrita_20261020`). Tipo que é igual nos dois XSDs mantém o nome (`InfoPrestador`, `Serv`, …); tipo que mudou entre eles ou só existe em um ganha sufixo — `InfDPSNt004`/`InfDPSNt009`, `TipoDedRedNt004`, `AjusteBCInputNt009` —, sem alias sem sufixo. `DPS` e `NFSe` são uniões discriminadas pelo campo sintético `layout` (nunca serializado); `DpsFor<L>`/`NfseFor<L>` resolvem o tipo de um leiaute.

`xs:choice` vira discriminated union — nunca campos opcionais se excluindo:

```typescript
// ✅ modelado como union (caller narrow via `in`)
type IdentificadorPessoa =
  | { CNPJ: string }
  | { CPF: string }
  | { NIF: string }
  | { cNaoNIF: CodigoNaoNif };
```

## 5. Leiaute sempre explícito

`layout: 'nt004' | 'nt009'` é obrigatório em `new NfseClient`, `new NfseClientFake`, `buildDps` e nos validadores de XSD (`validateDpsXml(xml, { layout })`, …). Não há default nem seleção automática por data: cada adiamento de cronograma exigiria um release da lib. O compilador amarra o leiaute (`NfseClient<'nt009'>` só emite DPS `nt009`); para JS puro, a lib checa em runtime — `InvalidLayoutError` para valor desconhecido e `LayoutMismatchError` para DPS de outro leiaute, antes de consumir o `DpsCounter`, assinar ou fazer qualquer I/O. A leitura é a exceção: o parser detecta o leiaute de cada NFS-e e lê os dois.

## 6. Identificadores como `string`, decimais como `number`

CNPJ, CPF, CEP, cMun, cTribNac, chaveAcesso — `string` para preservar zeros à esquerda. Decimais (`vServ`, `pAliq`) — `number`, com a ressalva de que JS floats não fazem aritmética fiscal exata. Consumidores que precisam de precisão (soma de centavos, ABNT NBR 5891) envolvem em `Decimal.js`.

## 7. Builder separável do transporte

`emitir({ ...params, dryRun: true })` ou `emitirDpsPronta(dps, { dryRun: true })` montam + assinam + comprimem sem enviar e sem consumir `DpsCounter`. Usado para preview em staging, CI e auditoria de payload.

## 8. Validações opt-out, não opt-in

XSD, CEP e CPF/CNPJ rodam **por default** antes de qualquer round-trip. Desligar é deliberado (`skipValidation`, `skipCepValidation`, `skipCpfCnpjValidation`) — a semântica é "mostre falhas óbvias localmente antes de gastar a Receita". As regras de rejeição fechadas do Anexo I checadas em `buildDps` (`RuleViolationError` com o código) e o guard de leiaute não têm opt-out — as regras só barram o que o Anexo I sempre rejeita.

## 9. Ambientes isolados

`Ambiente.ProducaoRestrita` para homologação, `Ambiente.Producao` para valor fiscal. Feche o ciclo completo (emitir → consultar → cancelar → substituir) em homologação antes de trocar — inclusive o do `nt009`, já disponível em Produção Restrita antes da virada de 01/12/2026. O `ambiente` escolhe os hosts e, em `emitir`/`cancelar`, o `tpAmb` omitido (Produção → `'1'`); só a DPS montada à parte com `buildDps` precisa do `tpAmb` explícito — veja [Emitir NFS-e](./emitir#setup).
