# Exemplo: emissão de NFS-e em Produção Restrita

Demonstra a API de emissão síncrona (`POST /nfse`) do open-nfse: montagem de DPS, dry-run, emissão única e emissão em lote com concorrência controlada.

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

▸ DPS montada:
  Id:     DPS21113001000574753000100000011704000000000000
  série:  1  nDPS: 1704000000
  valor:  R$ 100.00

▸ Dry-run: gerando DPS assinada sem enviar...
  xml assinado (3842 bytes):
    <?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse"...
  payload gzip+base64 (2104 bytes): pronto para POST

▸ Enviando DPS para ProducaoRestrita...

✔ NFS-e autorizada!
  chaveAcesso: 21113001000574753000100000000000000014671234567890
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

O lote é paralelizado no cliente (o SEFIN não tem endpoint de batch). Cada item vira um `EmitLoteItem` com `status: 'success' | 'failure' | 'skipped'`. Falhas em itens individuais **não derrubam o lote inteiro** — use `stopOnError: true` para mudar esse comportamento.

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

## Campos da DPS no exemplo

O script cria uma DPS **mínima** de Homologação. Para emitir em Produção real, você precisa ajustar ao menos:

- `cServ.cTribNac` — código de tributação nacional correto para o serviço
- `valores.trib.tribMun.tribISSQN` e `pAliq` — alíquota do município
- `prest.regTrib` — regime tributário real do emitente (SN/LP/LR/MEI)
- `toma` — dados do tomador (CNPJ ou CPF) se aplicável
- `IBSCBS` — grupo obrigatório conforme NT04 quando o serviço se encaixa

Consulte a [Nota Técnica RTC v1.01](https://www.gov.br/nfse/pt-br) para a lista completa.

## Segurança

- **Nunca commite o `.pfx` nem a senha.** O repo já ignora `*.pfx` / `*.p12` / `*.pem`.
- Não emita em **Produção real** sem validar completamente em Produção Restrita primeiro. Cada nota autorizada vira um documento fiscal oficial.
- `NFSE_CONFIRMA_EMISSAO` é uma trava intencional do exemplo; replique algo parecido no seu código.

## Troubleshooting

- **`ExpiredCertificateError`**: o cert venceu. Renove no ICP-Brasil.
- **`InvalidCertificatePasswordError`**: `NFSE_CERT_SENHA` está errada.
- **`ForbiddenError` (HTTP 403)**: o CNPJ do cert não está habilitado no Emissor Nacional.
- **`ReceitaRejectionError [E****]`**: regra de negócio violada pela DPS — veja o `codigo` e ajuste o campo apontado. A Receita publica a tabela completa no Manual do Contribuinte.
- **`InvalidDpsIdParamError`**: algum campo do Id (cMun, CNPJ, série, nDPS) está fora do formato esperado.