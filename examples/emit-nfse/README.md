# Exemplo: emissão de NFS-e em Produção Restrita

Demonstra a API de emissão síncrona (`POST /nfse`) do open-nfse: montagem de DPS, dry-run, emissão única e emissão em lote com concorrência controlada.

Os dois scripts emitem no leiaute `nt004` (produção atual) por padrão; `NFSE_LAYOUT=nt009` troca para o NT 009, já disponível em Produção Restrita (produção em 01/12/2026). Ver [Leiautes](https://fm-s.github.io/open-nfse/guide/layouts).

## Requisitos

- Node.js 20+
- Certificado A1 (ICP-Brasil, arquivo `.pfx`) habilitado em **Produção Restrita**
- CNPJ e município habilitados para emissão pelo Sefin Nacional
- A lib já construída no repo pai (`npm run build` a partir da raiz)

## Primeiro uso

```sh
cd examples/emit-nfse
npm install
```

> ⚠️ Se o `npm install` reclamar que `open-nfse/dist` não existe, rode
> `npm run build` na raiz do repo primeiro.

## Emissão única (`npm start`)

```sh
export NFSE_CERT_PATH=/caminho/absoluto/para/seu-cert.pfx
export NFSE_CERT_SENHA='sua-senha-a1'
export NFSE_CNPJ=00000000000100
export NFSE_COD_MUN=2111300              # ex. São Luís/MA

# (opcionais)
export NFSE_LAYOUT=nt004                 # nt004 (default) ou nt009
export NFSE_SERIE=1
export NFSE_N_DPS=1
export NFSE_VALOR=100.00
# IMPORTANTE: por padrão só faz dry-run. Para enviar de fato:
export NFSE_CONFIRMA_EMISSAO=yes

npm start
```

Saída típica:

```
▸ Carregando certificado A1...
  subject:   VOGA LTDA:00574753000100
  expira em: 2026-06-05

▸ DPS a emitir:
  layout: nt004
  série:  1  nDPS: 1704000000
  valor:  R$ 100.00

▸ Dry-run: gerando DPS assinada sem enviar...
  xml assinado (3842 bytes):
    <?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse"...
  payload gzip+base64 (2104 bytes): pronto para POST

▸ Enviando DPS para PRODUCAO_RESTRITA...

✔ NFS-e autorizada!
  chaveAcesso: 21113002200574753000100000000000147226051234567890
  idDps:       DPS...
  nNFSe:       1472
  cStat:       100
  vLiq:        R$ 100.00
```

## Emissão em lote (`npm run bulk`)

```sh
export NFSE_LOTE_QTD=5
export NFSE_LOTE_CONCORRENCIA=2
export NFSE_CONFIRMA_EMISSAO=yes       # de novo: sem isso só pré-visualiza

npm run bulk
```

O lote é paralelizado no cliente (o SEFIN não tem endpoint de batch). Cada item vira um `EmitLoteItem` com `status: 'success' | 'success_unreadable' | 'failure' | 'skipped'`. Falhas em itens individuais **não derrubam o lote inteiro** — use `stopOnError: true` para mudar esse comportamento. `success_unreadable` é uma NFS-e **autorizada** cuja resposta não pôde ser lida (`item.error.chaveAcesso`): conta como sucesso e **não deve ser reemitida**.

Todas as DPS do lote precisam ser do layout do cliente — uma de outro layout rejeita o lote inteiro com `LayoutMismatchError` antes do primeiro envio.

## Modo dry-run

Os dois scripts rodam em modo dry-run por padrão: montam, assinam e comprimem a DPS **sem** enviar para a Receita. Isso permite inspecionar o XML assinado antes do primeiro envio real e evita emissão acidental em pipelines de CI.

Defina `NFSE_CONFIRMA_EMISSAO=yes` só quando quiser enviar de fato.

## Tratamento de rejeição

Quando o SEFIN rejeita a DPS, `emitir()` lança `ReceitaRejectionError` com:

- `codigo` / `descricao` / `complemento` — primeira mensagem
- `mensagens` — lista completa (pode vir mais de uma)
- `idDps` — quando a Receita conseguiu extrair do XML rejeitado
- `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento` — metadados

O exemplo imprime o código e a descrição. Para lógica de retry/fila, capture o erro e roteie por `codigo`.

Se a NFS-e foi **autorizada** mas a resposta não pôde ser interpretada, `emitir()` lança `UnreadableAuthorizedNfseError` (com `chaveAcesso`). Não é falha: a nota existe — guarde a chave e **não reemita**.

## Campos da DPS no exemplo

O script cria uma DPS **mínima** com os params de alto nível do `emitir` (o `tpAmb` segue o `ambiente` do cliente). Para emitir em Produção real, você precisa ajustar ao menos:

- `servico.cTribNac` / `servico.cNBS` — códigos de tributação nacional e NBS corretos para o serviço
- `emitente.regime` — regime tributário real do emitente (`opSimpNac`, `regApTribSN`, `regEspTrib`)
- `valores` — o membro do `totTrib` que o regime exige (MEI `indTotTrib` / ME-EPP `pTotTribSN` / Não Optante `vTotTrib` ou `pTotTrib`) e, se for o caso, `aliqIss`, `tribISSQN`, `tpRetISSQN`
- `tomador` — dados do tomador (CNPJ ou CPF), se aplicável
- `ambiente: Ambiente.Producao` no cliente — o `tpAmb` da DPS acompanha (`'1'`)
- `ibsCbs` / `ajusteBC` — só no `nt009`: grupo IBS/CBS e ajuste da base de cálculo, com as regras do Anexo I checadas offline

O `verAplic` fica no default `open-nfse/<versão>`. Detalhes em [Emitir NFS-e](https://fm-s.github.io/open-nfse/guide/emitir).

## Segurança

- **Nunca commite o `.pfx` nem a senha.** O repo já ignora `*.pfx` / `*.p12` / `*.pem`.
- Não emita em **Produção real** sem validar completamente em Produção Restrita primeiro. Cada nota autorizada vira um documento fiscal oficial.
- `NFSE_CONFIRMA_EMISSAO` é uma trava intencional do exemplo; replique algo parecido no seu código.

## Troubleshooting

- **`ExpiredCertificateError`**: o cert venceu. Renove no ICP-Brasil.
- **`InvalidCertificatePasswordError`**: `NFSE_CERT_SENHA` está errada.
- **`ForbiddenError` (HTTP 403)**: o CNPJ do cert não está habilitado no Emissor Nacional.
- **`ReceitaRejectionError [E****]`**: regra de negócio violada pela DPS — veja o `codigo` e ajuste o campo apontado. A Receita publica a tabela completa no Manual do Contribuinte.
- **`RuleViolationError`**: regra de negócio checada offline, antes de consumir o `nDPS` ou tocar a rede — `rule` traz o código (ex.: `E0322`).
- **`LayoutMismatchError`**: params/DPS de um layout num cliente de outro.
- **`InvalidDpsIdParamError`**: algum campo do Id (cMun, CNPJ, série, nDPS) está fora do formato esperado.