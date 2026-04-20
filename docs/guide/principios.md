# Princípios de design

Compromissos da API pública. Mudanças aqui exigem bump de MINOR; histórico no [CHANGELOG](https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md).

## 1. DTO in, DTO out

Callers não veem XML, GZip, Base64, mTLS, XMLDSig — tudo entra e sai tipado. O campo `xmlNfse` cru é exposto como **escape hatch** (arquivar, re-assinar externamente), não como API primária.

## 2. Erros tipados em 3 níveis

`Error → OpenNfseError → grupo (HttpError/CertificateError/ValidationError) → concreto`. O caller escolhe a granularidade do catch (`ReceitaRejectionError` específico, `ServerError` para retry, `OpenNfseError` para re-throw com contexto). Hierarquia completa + exemplos em [Erros tipados](./erros).

## 3. Sem estado interno, com primitives de orquestração e retry

Sem banco, cache global ou singleton. Mas a lib oferece:

- **`emitirEmLote`** — worker pool client-side (SEFIN não tem endpoint batch).
- **`substituir`** — máquina de 4 estados com rollback automático no cancel pós-emit.
- **`RetryStore` + `replayPendingEvents`** — interface plugável para transientes + método cron-friendly. SEFIN deduplica via `infDPS.Id` / `(chave, tipoEvento, nPedRegEvento)`, então replay é idempotente.
- **`DpsCounter`** — provider atômico de `nDPS`, consultado só depois das validações offline.

Persistência durável, cron e reconciliação ficam com o consumidor. Schema SQL sugerido em [Integração em serviços](./integracao).

## 4. Schema-driven

Tipos em `src/nfse/domain.ts` derivam dos XSDs RTC v1.01. `xs:choice` vira discriminated union — nunca campos opcionais se excluindo:

```typescript
// ✅ modelado como union (caller narrow via `in`)
type IdentificadorPessoa =
  | { CNPJ: string }
  | { CPF: string }
  | { NIF: string }
  | { cNaoNIF: CodigoNaoNif };
```

## 5. Identificadores como `string`, decimais como `number`

CNPJ, CPF, CEP, cMun, cTribNac, chaveAcesso — `string` para preservar zeros à esquerda. Decimais (`vServ`, `pAliq`) — `number`, com a ressalva de que JS floats não fazem aritmética fiscal exata. Consumidores que precisam de precisão (soma de centavos, ABNT NBR 5891) envolvem em `Decimal.js`.

## 6. Builder separável do transporte

`emitir({ ...params, dryRun: true })` ou `emitirDpsPronta(dps, { dryRun: true })` montam + assinam + comprimem sem enviar e sem consumir `DpsCounter`. Usado para preview em staging, CI e auditoria de payload.

## 7. Validações opt-out, não opt-in

XSD, CEP e CPF/CNPJ rodam **por default** antes de qualquer round-trip. Desligar é deliberado (`skipValidation`, `skipCepValidation`, `skipCpfCnpjValidation`) — a semântica é "mostre falhas óbvias localmente antes de gastar a Receita".

## 8. Ambientes isolados

`Ambiente.ProducaoRestrita` para homologação, `Ambiente.Producao` para valor fiscal. Feche o ciclo completo (emitir → consultar → cancelar → substituir) em homologação antes de trocar.
