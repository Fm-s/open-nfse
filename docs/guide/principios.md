# Princípios de design

Esses são os compromissos da API pública. Mudanças aqui exigem bump de MINOR e estão documentadas no [CHANGELOG](https://github.com/fm-s/open-nfse/blob/main/CHANGELOG.md).

## 1. DTO in, DTO out

Callers **não veem** XML, GZip, Base64, mTLS, XMLDSig. Tudo entra e sai como objeto tipado. O `xmlNfse` cru é exposto em `NfseQueryResult` como **escape hatch** — não como API primária.

```typescript
// ✅ caminho idiomático
const { nfse } = await cliente.fetchByChave(chave);
console.log(nfse.infNFSe.emit.xNome);

// ⚠️ escape hatch, use só quando precisar do XML literal (arquivar, assinar externamente)
const { xmlNfse } = await cliente.fetchByChave(chave);
```

## 2. Erros tipados em 3 níveis

```
Error
  └─ OpenNfseError           (abstract base)
       ├─ HttpError          (grupo)
       │    ├─ NetworkError
       │    ├─ TimeoutError
       │    ├─ UnauthorizedError    (HTTP 401)
       │    ├─ ForbiddenError       (HTTP 403)
       │    ├─ NotFoundError        (HTTP 404)
       │    └─ ServerError          (HTTP 5xx)
       ├─ CertificateError   (grupo)
       │    ├─ ExpiredCertificateError
       │    ├─ InvalidCertificateError
       │    └─ InvalidCertificatePasswordError
       ├─ ValidationError    (grupo)
       │    ├─ InvalidChaveAcessoError
       │    ├─ InvalidXmlError
       │    ├─ XsdValidationError
       │    ├─ InvalidCepError
       │    ├─ InvalidCpfError
       │    └─ InvalidCnpjError
       ├─ ReceitaRejectionError     (concreto — carrega mensagens[])
       └─ ClientClosedError         (concreto — pós-close())
```

Isso deixa o caller escolher a granularidade do catch:

```typescript
try {
  const r = await cliente.emitir(params);
  if (r.status === 'retry_pending') {
    // falha transiente já salva no retryStore; cron cuida do replay
    logger.warn('emit transient, pending:', r.pending.id);
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // rejeição fiscal — nDPS consumido, não retry
    logger.warn(`rejeitada [${err.codigo}]: ${err.descricao}`);
  } else if (err instanceof OpenNfseError) {
    // erro conhecido da lib — relançar com contexto
    throw new MyAppError('Falha de emissão', { cause: err });
  } else {
    throw err; // erro inesperado
  }
}
```

## 3. Sem estado interno, com primitives de orquestração e retry

A lib **não tem** banco, cache global, singleton escondido ou qualquer lifecycle que sobreviva ao processo — nesse sentido é stateless.

Mas ela **oferece primitives** que antes o consumidor teria que escrever:

- **`emitirEmLote`** — worker pool client-side que paraleliza emit (o SEFIN não tem endpoint batch). Você passa a concorrência, a lib orquestra.
- **`substituir`** — máquina de 4 estados (`ok` / `retry_pending` / `rolled_back` / `rollback_pending`) com compensação automática quando step 2 falha. Você não escreve a lógica de rollback.
- **`RetryStore` + `replayPendingEvents`** — interface plugável para persistir eventos pendentes e um método cron-friendly que re-envia tudo que ficou transiente. Você implementa `save`/`list`/`delete` contra seu banco.

O que **fica com seu serviço**:

- **Persistência durável** — `RetryStore` contra Postgres/Redis, tabelas de submissions, NFS-e autorizadas, cursor de NSU. [Esquema completo em Integração](./integracao).
- **Agendamento** do cron que chama `replayPendingEvents()`.
- **Reconciliação** de DPS em `status = 'in_flight'` via `fetchByChave`.

Framing alternativo: a lib **não decide por você** *quando* ou *onde* persistir, mas provê as peças bem encaixadas para você montar isso.

## 4. Schema-driven

Todos os tipos em `src/nfse/domain.ts` derivam diretamente dos XSDs oficiais (RTC v1.01). Quando uma Nota Técnica atualiza o layout:

1. Os XSDs novos vão para `schemas/rtc-vX.YZ/`
2. `domain.ts` é atualizado campo a campo seguindo o diff
3. `parse-xml.ts` e `build-xml.ts` acompanham
4. `scripts/generate-schemas.mjs` é rodado para regerar o bundle de validação
5. MINOR bump, CHANGELOG explica os novos campos

`xs:choice` no XSD vira **discriminated union** em TypeScript — nunca "campos opcionais que se excluem mutuamente":

```typescript
// ❌ nunca assim
interface Tomador {
  CNPJ?: string;
  CPF?: string;
  NIF?: string;
}

// ✅ como é modelado
type IdentificadorPessoa =
  | { CNPJ: string }
  | { CPF: string }
  | { NIF: string }
  | { cNaoNIF: CodigoNaoNif };
```

Isso preserva **exhaustividade** no caller e torna impossível representar estados inválidos.

## 5. Identificadores como `string`, decimais como `number`

- **CNPJ, CPF, CEP, cMun, cTribNac, chaveAcesso** — sempre `string`, para preservar zeros à esquerda.
- **Decimais** (`vServ`, `pAliq`, etc.) — `number`, com a ressalva de que JavaScript floats não fazem aritmética fiscal exata.

Consumidores que precisam de aritmética fiscal precisa (somas de centavos, arredondamento conforme ABNT NBR 5891) devem envolver valores em `Decimal.js` ou similar no seu código.

## 6. Builder separável do transporte

```typescript
// emitir(params) em dry-run monta+assina sem enviar (counter NÃO é consumido)
const preview = await cliente.emitir({ ...params, dryRun: true });
console.log(preview.xmlDpsAssinado);    // XML assinado, pronto para enviar mas NÃO enviado
console.log(preview.xmlDpsGZipB64);     // payload gzip+base64 pronto para POST

// Ou para uma DPS já montada manualmente:
const dps = buildDps({ ...params, nDPS: '1' });
const dry2 = await cliente.emitirDpsPronta(dps, { dryRun: true });
```

Isso permite preview em staging, testes de integração offline e auditoria do payload sem consumir quota da Receita.

## 7. Validações opt-out, não opt-in

As três validações pré-envio (**XSD, CEP, CPF/CNPJ**) são **ligadas por default**. A semântica é: "me mostre falhas óbvias localmente antes de gastar um round-trip com a Receita". Desligar é possível mas deliberado:

```typescript
await cliente.emitir({
  ...params,
  skipValidation: true,       // XSD
  skipCepValidation: true,    // ViaCEP lookup
  skipCpfCnpjValidation: true // DV algorítmico
});
```

## 8. Ambientes isolados

```typescript
Ambiente.ProducaoRestrita   // homologação oficial (sefin.producaorestrita.nfse.gov.br)
Ambiente.Producao           // produção real (sefin.nfse.gov.br)
```

Notas emitidas em `Producao` têm valor fiscal. Use `ProducaoRestrita` para todos os testes até fechar o ciclo completo (emitir → consultar → cancelar → substituir) do seu serviço.
