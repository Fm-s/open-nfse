# Exemplo: fetch de NFS-e em Produção Restrita

Teste de integração real contra a API. Carrega um certificado A1, consulta uma NFS-e por chave (opcional), e puxa documentos da distribuição por NSU.

## Requisitos

- Node.js 20+
- Certificado A1 (ICP-Brasil, arquivo `.pfx`) habilitado em **Produção Restrita**
- A lib já construída no repo pai (`npm run build` a partir da raiz)

## Primeiro uso

```sh
# a partir deste diretório
cd examples/fetch-nfse

# instala tsx + link local pra lib (file:../..)
npm install
```

> ⚠️ Se o `npm install` reclamar que `open-nfse/dist` não existe, rode primeiro
> `npm run build` na raiz do repo. O exemplo consome o pacote via `file:../..`, que
> resolve direto para `dist/`.

## Executando

```sh
export NFSE_CERT_PATH=/caminho/absoluto/para/seu-cert.pfx
export NFSE_CERT_SENHA='sua-senha-a1'

# (opcional) uma chave de acesso conhecida pra testar consulta por chave
export NFSE_CHAVE=21113002200574753000100000000000146726037032711025

# (opcional) retomar a paginação de NSU de onde parou
export NFSE_ULTIMO_NSU=0

npm start
```

## Saída esperada

```
▸ Carregando certificado A1...
  subject:    VOGA LTDA:00574753000100
  emitido em: 2025-06-05
  expira em:  2026-06-05

▸ Consultando NFS-e por chave: 21113002200574753000100000000000146726037032711025
  [http.request]  { method: 'GET', url: 'https://sefin.producaorestrita...' }
  [http.response] { method: 'GET', url: '...', status: 200, latencyMs: 412 }
  nNFSe:           1467
  emitente:        VOGA LTDA
  município incid: São Luís
  valor líquido:   R$ 51.60
  status (cStat):  100

▸ Consultando distribuição por NSU...
  [http.request]  { method: 'GET', url: 'https://adn.producaorestrita...' }
  lote 1: status=DOCUMENTOS_LOCALIZADOS  docs=50  ultimoNsu=2369958
    NSU 2369909  NFSE  21113002200574753000100000000000146826...
    ... (+45 omitidos)

▸ Total: ... documentos em N lote(s). Último NSU: ...
```

## Segurança

- **Nunca commite o `.pfx` nem a senha.** O repo já ignora `*.pfx` / `*.p12` / `*.pem`.
- Use variáveis de ambiente ou um gerenciador de secrets.
- Em CI, injete via secrets do provedor (GitHub Actions, GitLab CI, etc.).

## Troubleshooting

- **`ExpiredCertificateError`**: o cert venceu. Renove no ICP-Brasil.
- **`InvalidCertificatePasswordError`**: `NFSE_CERT_SENHA` está errada.
- **`UnauthorizedError` (HTTP 401)**: certificado inválido ou não apresentado na conexão TLS.
- **`ForbiddenError` (HTTP 403)**: o CNPJ do cert não está habilitado no Emissor Nacional.
- **`NotFoundError` (HTTP 404)**: a chave de acesso consultada não existe na Receita. (Nota: `fetchByNsu` **não** lança esse erro quando a Receita devolve 404 com body — isso é a forma dela sinalizar "caught up, sem documentos pendentes" e já é tratado como resultado normal com `status === 'NENHUM_DOCUMENTO_LOCALIZADO'`.)
- **`ServerError` (HTTP 5xx)**: problema na Receita, geralmente transitório — tente de novo em alguns minutos.