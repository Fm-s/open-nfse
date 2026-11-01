# Consultar NFS-e

Dois modos: **por chave de acesso** (aleatória, idempotente) e **por NSU** (paginação incremental).

## Por chave de acesso — `fetchByChave`

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

resultado.chaveAcesso;                          // string
resultado.xmlNfse;                               // XML cru assinado, como veio do SEFIN (escape hatch)
resultado.nfse;                                  // NFSe = NfseNt004 | NfseNt009, tipada
resultado.tipoAmbiente;                          // TipoAmbiente.Producao | .Homologacao
resultado.versaoAplicativo;                     // versão do app SEFIN
resultado.dataHoraProcessamento;                // Date
```

A chave é pré-validada antes de tocar a rede. Os XSDs oficiais divergem sobre onde fica o CNPJ alfanumérico, e a lib aceita as duas formas: `TSChaveNFSe` (letras nas posições 7–20) e a regra de formação de `TSIdNFSe` (Cód. Mun. + Amb. Ger. + Tipo de Inscrição + inscrição, letras nas posições 10–23).

### Leiaute da nota: `nt004` ou `nt009`

Os métodos de leitura devolvem a união `NFSe` **independentemente do `layout` do cliente**: um cliente `nt009` lê notas `nt004` e vice-versa. NFS-e emitidas no leiaute antigo continuam chegando por `fetchByChave`/`fetchByNsu` depois da virada de 01/12/2026. O parser detecta o leiaute por `infDPS/finNFSe` (obrigatório no `nt009`, inexistente no `nt004`) e preenche o campo **sintético** `layout` (não existe no XML):

```typescript
const { nfse } = await cliente.fetchByChave(chave);

// Campos comuns aos dois leiautes: acesso direto, sem narrowing
nfse.infNFSe.nNFSe;
nfse.infNFSe.valores.vLiq;

// Campos que mudaram: discrimine por `layout`
if (nfse.layout === 'nt009') {
  nfse.infNFSe.valores.vCalcAjusteBCISSQN;          // NfseNt009
  nfse.infNFSe.DPS.infDPS.valores.vAjusteBC;
} else {
  nfse.infNFSe.valores.vCalcDR;                     // NfseNt004
  nfse.infNFSe.DPS.infDPS.valores.vDedRed;
}
```

O parser é leniente e sem perdas: um campo exclusivo do outro leiaute é ignorado com `warn` `nfse.parse.unexpected_field` (nunca lança). Os avisos vão para o `logger` do cliente. Detalhes em [Leiautes](./layouts#leitura-os-dois-leiautes-sem-perda).

### Navegando o `NFSe` parseado

Toda a árvore RTC v1.01 está tipada. O trecho abaixo usa só campos presentes nos dois leiautes:

```typescript
const inf = resultado.nfse.infNFSe;

// Identificação
inf.Id;                                // "NFS..." (concatenado com a chave)
inf.chaveAcesso;                       // 50 caracteres
inf.nNFSe;                             // número sequencial da NFS-e
inf.cStat;                             // SituacaoNfse — '100' = NFS-e gerada
inf.dhProc;                            // Date

// Emitente
inf.emit.xNome;                        // razão social
if ('CNPJ' in inf.emit.identificador) {
  console.log(inf.emit.identificador.CNPJ);
}

// Serviço
inf.DPS.infDPS.serv.cServ.cTribNac;
inf.DPS.infDPS.serv.cServ.xDescServ;

// Tomador (opcional — discriminated union; xNome é opcional no nt009)
const toma = inf.DPS.infDPS.toma;
if (toma && 'CPF' in toma.identificador) {
  console.log('Tomador PF:', toma.identificador.CPF, toma.xNome ?? '(sem nome)');
}

// Valores
inf.valores.vLiq;
inf.valores.vISSQN;
inf.valores.vTotalRet;

// IBS/CBS (Reforma Tributária, quando presente)
if (inf.IBSCBS) {
  console.log(inf.IBSCBS.totCIBS.vTotNF);
  console.log(inf.IBSCBS.totCIBS.gIBS?.vIBSTot);   // gIBS/gCBS são opcionais no nt009
}
```

::: tip Textos já decodificados
Os campos de texto do DTO chegam decodificados, nos dois leiautes: entidades predefinidas e referências numéricas de caractere (`&#231;`/`&#xE7;` → `ç`) viram o caractere. Na 0.11 as referências numéricas chegavam literais (`'Concei&#231;&#227;o'`); se você decodificava por conta própria, remova esse passo. `xmlNfse` continua sendo o XML cru, sem tratamento.
:::

### Erros possíveis

```typescript
try {
  const r = await cliente.fetchByChave(chave);
} catch (err) {
  if (err instanceof InvalidChaveAcessoError) {
    // chave fora das duas formas aceitas (TSChaveNFSe / regra de formação) — nenhuma requisição foi feita
  } else if (err instanceof NotFoundError) {
    // HTTP 404 — chave não existe na Receita
  } else if (err instanceof UnauthorizedError) {
    // HTTP 401 — certificado inválido/não apresentado
  } else if (err instanceof ForbiddenError) {
    // HTTP 403 — CNPJ não autorizado a consultar essa chave
  } else if (err instanceof InvalidXmlError) {
    // o XML devolvido não pôde ser interpretado (estrutura inesperada)
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
import { StatusDistribuicao } from 'open-nfse';

let ultimoNsu = Number(await db.getUltimoNsu(cnpj) ?? 0);

while (true) {
  const r = await cliente.fetchByNsu({ ultimoNsu });

  for (const doc of r.documentos) {
    await db.salvar(doc);                       // persista antes de avançar o cursor
    console.log(doc.nsu, doc.tipoDocumento, doc.chaveAcesso);
    console.log(doc.xmlDocumento);              // já descomprimido
  }

  await db.setUltimoNsu(cnpj, r.ultimoNsu);

  if (r.status === StatusDistribuicao.NenhumDocumento || r.ultimoNsu === ultimoNsu) break;
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

`r.status` é o enum `StatusDistribuicao`:

| Status (`StatusDistribuicao`)                          | Significado                                                         |
|--------------------------------------------------------|---------------------------------------------------------------------|
| `DocumentosEncontrados` (`DOCUMENTOS_LOCALIZADOS`)     | Há documentos no lote — consuma `documentos[]` e avance `ultimoNsu` |
| `NenhumDocumento` (`NENHUM_DOCUMENTO_LOCALIZADO`)      | Caught up — sem novos documentos pendentes                          |
| `Rejeicao` (`REJEICAO`)                                | A requisição foi rejeitada (veja `erros[]`)                         |

::: warning Comportamento do ADN
`/DFe/{NSU}` devolve **HTTP 404 com body** quando caught up e **HTTP 400 com body** em rejeição — nenhum dos dois é erro HTTP. A lib trata automaticamente (`acceptedStatuses: [400, 404]`) e retorna `NsuQueryResult` normalmente. **Você nunca vê `NotFoundError` em `fetchByNsu`** — veja `status === StatusDistribuicao.NenhumDocumento`.

Mesmo no caminho "caught up", a Receita inclui uma mensagem em `erros` (ex: `E2220`). A fonte de verdade é `status`; `erros[]` é informativo.

**Guarda de sanidade:** se o response 400/404 não trouxer o campo `StatusProcessamento` (por exemplo, um proxy/WAF na frente do ADN devolveu um HTML genérico), a lib lança `NetworkError` ao invés de silenciosamente parsear como "nenhum documento". Assim você vê o problema de infra em vez de cursor parado.
:::

### Tipos de documento

`xmlDocumento` é o XML cru (já descomprimido). Para ter o DTO tipado, passe-o ao parser correspondente:

```typescript
import { parseEventoXml, parseNfseXml, TipoDocumento, TipoEvento } from 'open-nfse';

for (const doc of r.documentos) {
  if (doc.tipoDocumento === TipoDocumento.Nfse) {
    const nfse = parseNfseXml(doc.xmlDocumento, { logger });  // NFSe — nt004 ou nt009
    console.log(nfse.layout, nfse.infNFSe.nNFSe);
  } else if (doc.tipoDocumento === TipoDocumento.Evento) {
    // XML de evento (cancelamento, substituição, etc.)
    const evento = parseEventoXml(doc.xmlDocumento);    // EventoProcessado
    if (doc.tipoEvento === TipoEvento.Cancelamento) {
      console.log('cancelada:', doc.chaveAcesso, evento.infEvento.Id);
    }
  }
}
```

O cursor de NSU mistura os dois leiautes: depois de 01/12/2026, as NFS-e `nt004` emitidas antes da virada continuam no histórico distribuído. Trate `NFSe` como união — não presuma o leiaute pela data nem pelo `layout` do seu cliente.

## Exemplo runnable

Em [`examples/fetch-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/fetch-nfse) — script `npm start` que consulta por chave + pagina por NSU usando certificado A1 real.
