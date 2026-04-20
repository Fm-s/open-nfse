# Consultar NFS-e

Dois modos: **por chave de acesso** (aleatória, idempotente) e **por NSU** (paginação incremental).

## Por chave de acesso — `fetchByChave`

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

resultado.chaveAcesso;                          // string
resultado.xmlNfse;                               // XML cru assinado (escape hatch)
resultado.nfse;                                  // NFSe completa, tipada
resultado.tipoAmbiente;                          // TipoAmbiente.Producao | .Homologacao
resultado.versaoAplicativo;                     // versão do app SEFIN
resultado.dataHoraProcessamento;                // Date
```

### Navegando o `NFSe` parseado

Toda a árvore RTC v1.01 está tipada:

```typescript
const inf = resultado.nfse.infNFSe;

// Identificação
inf.Id;                                // "NFS..." (concatenado com a chave)
inf.chaveAcesso;                       // 50 dígitos
inf.nNFSe;                             // número municipal sequencial
inf.cStat;                             // "100" = autorizado
inf.dhProc;                            // Date

// Emitente
inf.emit.xNome;                        // razão social
if ('CNPJ' in inf.emit.identificador) {
  console.log(inf.emit.identificador.CNPJ);
}

// Serviço
inf.DPS.infDPS.serv.cServ.cTribNac;
inf.DPS.infDPS.serv.cServ.xDescServ;

// Tomador (opcional — discriminated union)
const toma = inf.DPS.infDPS.toma;
if (toma && 'CPF' in toma.identificador) {
  console.log('Tomador PF:', toma.identificador.CPF);
}

// Valores
inf.valores.vLiq;
inf.valores.vISSQN;
inf.valores.vTotalRet;

// IBS/CBS (Reforma Tributária, quando presente)
if (inf.IBSCBS) {
  console.log(inf.IBSCBS.totCIBS.vTotNF);
}
```

### Erros possíveis

```typescript
try {
  const r = await cliente.fetchByChave(chave);
} catch (err) {
  if (err instanceof InvalidChaveAcessoError) {
    // chave com formato inválido (não tem 50 dígitos)
  } else if (err instanceof NotFoundError) {
    // HTTP 404 — chave não existe na Receita
  } else if (err instanceof UnauthorizedError) {
    // HTTP 401 — certificado inválido/não apresentado
  } else if (err instanceof ForbiddenError) {
    // HTTP 403 — CNPJ não autorizado a consultar essa chave
  }
}
```

## Por NSU — `fetchByNsu`

**NSU** (Número Sequencial Único) é um cursor por CPF/CNPJ. A cada NFS-e emitida **onde seu CNPJ é prestador, tomador ou intermediário**, a Receita incrementa o NSU e guarda o documento em `/DFe/{NSU}`.

::: warning NSU é por município-ator, não por CNPJ
Conforme Anexo IV do Manual v1.2, a **mesma NFS-e gera múltiplos NSUs** — um para cada município distinto envolvido (emissor, tomador, intermediário, prestação, incidência). O cursor que você busca é por **seu CNPJ**, mas a Receita roteia eventos para o município de cada ator. Consequências práticas:

- Um CNPJ matriz **não vê** documentos roteados exclusivamente ao município de uma filial.
- Se você tem múltiplos estabelecimentos em municípios diferentes, paginar por um único cursor pode perder eventos — considere um `nsu_cursors` por (CNPJ, município) se o cenário exigir.
- NFS-e recebidas aparecem tanto no cursor do prestador quanto no do tomador (com NSUs diferentes).
:::

### Loop básico

```typescript
let ultimoNsu = Number(await db.getUltimoNsu(cnpj) ?? 0);

while (true) {
  const r = await cliente.fetchByNsu({ ultimoNsu });

  for (const doc of r.documentos) {
    await db.salvar(doc);                       // persista antes de avançar o cursor
    console.log(doc.nsu, doc.tipoDocumento, doc.chaveAcesso);
    console.log(doc.xmlDocumento);              // já descomprimido
  }

  await db.setUltimoNsu(cnpj, r.ultimoNsu);

  if (r.status === 'NENHUM_DOCUMENTO_LOCALIZADO' || r.ultimoNsu === ultimoNsu) break;
  ultimoNsu = r.ultimoNsu;
}
```

### Parâmetros

```typescript
await cliente.fetchByNsu({
  ultimoNsu: 12345,
  cnpjConsulta: '00574753000100',    // opcional — consulta em nome de outro CNPJ
  lote: true,                         // opcional — pede lote completo
});
```

### Status retornados

| Status                           | Significado                                                                 |
|----------------------------------|-----------------------------------------------------------------------------|
| `DOCUMENTOS_LOCALIZADOS`         | Há documentos no lote — consuma `documentos[]` e avance `ultimoNsu`         |
| `NENHUM_DOCUMENTO_LOCALIZADO`    | Caught up — sem novos documentos pendentes                                  |
| `REJEICAO`                       | A requisição foi rejeitada (veja `erros[]`)                                 |

::: warning Comportamento do ADN
`/DFe/{NSU}` devolve **HTTP 404 com body** quando caught up e **HTTP 400 com body** em rejeição — nenhum dos dois é erro HTTP. A lib trata automaticamente (`acceptedStatuses: [400, 404]`) e retorna `NsuQueryResult` normalmente. **Você nunca vê `NotFoundError` em `fetchByNsu`** — veja `status === 'NENHUM_DOCUMENTO_LOCALIZADO'`.

Mesmo no caminho "caught up", a Receita inclui uma mensagem em `erros` (ex: `E2220`). A fonte de verdade é `status`; `erros[]` é informativo.

**Guarda de sanidade:** se o response 400/404 não trouxer o campo `StatusProcessamento` (por exemplo, um proxy/WAF na frente do ADN devolveu um HTML genérico), a lib lança `NetworkError` ao invés de silenciosamente parsear como "nenhum documento". Assim você vê o problema de infra em vez de cursor parado.
:::

### Tipos de documento

```typescript
import { TipoDocumento, TipoEvento } from 'open-nfse';

for (const doc of r.documentos) {
  if (doc.tipoDocumento === TipoDocumento.NFSE) {
    // XML de NFS-e completa
  } else if (doc.tipoDocumento === TipoDocumento.EVENTO_NFSE) {
    // XML de evento (cancelamento, substituição, etc.)
    console.log(doc.tipoEvento);   // "101101" etc
  }
}
```

## Exemplo runnable

Em [`examples/fetch-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/fetch-nfse) — script `npm start` que consulta por chave + pagina por NSU usando certificado A1 real.
