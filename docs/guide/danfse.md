# DANFSe — PDF oficial da nota

Duas formas de obter o DANFSe (Documento Auxiliar da NFS-e) em PDF:

1. **Online** — baixa o PDF oficial direto do ADN (`GET /danfse/{chave}`).
2. **Local** — renderiza com `pdfkit` + QR code, sem network.

A lib oferece ambas e um **modo auto** que tenta online e cai pro local em falha — o padrão que você quer em produção.

## `cliente.gerarDanfse(nfse)` — default `auto`

```typescript
const r = await cliente.emitir(params);
if (r.status === 'ok') {
  const pdf = await cliente.gerarDanfse(r.nfse.nfse);
  await fs.writeFile(`nfse-${r.nfse.chaveAcesso}.pdf`, pdf);
}
```

Ordem de tentativa:
1. `GET /danfse/{chave}` no ADN oficial
2. **Apenas falhas transientes** (`NetworkError`, `TimeoutError`, `ServerError`/5xx) → cai no renderer local
3. Log `danfse.online.fallback` no logger configurado para rastreabilidade

::: warning Erros permanentes sobem
`ForbiddenError` (CNPJ sem acesso à nota), `UnauthorizedError` (certificado expirado/inválido), `NotFoundError` (chave inexistente) e `InvalidChaveAcessoError` (formato errado) **não** caem para local — eles propagam para o caller. Mascarar esses erros com um PDF local degradado esconderia um problema real (cert vencido, typo na chave, permissão errada no CNPJ).
:::

### Forçar estratégia

```typescript
// Só ADN — lança se falhar (sem fallback):
await cliente.gerarDanfse(nfse, { strategy: 'online' });

// Só local — não toca rede:
await cliente.gerarDanfse(nfse, { strategy: 'local' });
```

### Opções de layout (modo local)

```typescript
await cliente.gerarDanfse(nfse, {
  strategy: 'local',
  urlConsultaPublica: 'https://minha.prefeitura.gov.br/consulta',  // override do QR + link
  ambiente: Ambiente.ProducaoRestrita,                              // adiciona watermark HOMOLOGAÇÃO
  observacoes: 'Pagamento via PIX. Data limite: 10/04/2026.',       // aparece em "Outras informações"
});
```

No modo `online` essas opções são ignoradas — a Receita usa o template próprio dela.

## `cliente.fetchDanfse(chave)` — só online

Quando você só tem a chave (sem o objeto `NFSe`), ou quer garantir que é o PDF oficial:

```typescript
try {
  const pdf = await cliente.fetchDanfse('21113002200574753000100000000000146726037032711025');
  await fs.writeFile('nfse.pdf', pdf);
} catch (err) {
  if (err instanceof InvalidChaveAcessoError) console.error('Chave com formato inválido');
  if (err instanceof NotFoundError) console.error('Chave não existe na Receita');
  if (err instanceof ForbiddenError) console.error('CNPJ do cert não autorizado a consultar');
  throw err;
}
```

Sem fallback — erros lançam. Use quando quiser falhar alto.

::: tip Validação upfront
`fetchDanfse` valida `/^\d{50}$/` antes de tocar a rede e lança `InvalidChaveAcessoError` se a chave estiver fora do formato — mesmo comportamento de `fetchByChave`. Protege contra round-trips desperdiçados e input injection via URL.
:::

## `gerarDanfse(nfse)` standalone — função pura

Exportada pra quem não quer depender do `NfseClient`:

```typescript
import { gerarDanfse } from 'open-nfse';
import { parseNfseXml } from 'open-nfse';

const nfse = parseNfseXml(xmlFromDatabase);
const pdf = await gerarDanfse(nfse, { observacoes: '...' });
```

Útil pra regerar DANFSe a partir do XML salvo no seu banco (ver [integração](./integracao#schema-sql)) sem precisar de cliente configurado.

## Layout do PDF local

A4 portrait, uma página, com os seguintes blocos:

1. **Cabeçalho** — "DANFS-e", chave de acesso (50 dígitos agrupados em 4), nº NFS-e, protocolo
2. **Prestador de Serviços** — CNPJ/CPF, IM, razão social, endereço completo
3. **Tomador de Serviços** — documento (CNPJ/CPF/NIF/cNaoNIF), nome, endereço (ou "não identificado")
4. **Descrição do Serviço** — cTribNac, cNBS, cTribMun, local de incidência, discriminação longa
5. **Valores** — vServ, BC, alíquota, vISSQN, retenções + **valor líquido em destaque**
6. **IBS/CBS** — quando presente (Reforma Tributária 2026+)
7. **Outras Informações** — quando `observacoes` foi passado
8. **Consulta da Autenticidade** — QR code + URL do portal público
9. **Autorização** — chave formatada, cStat, dhProc, verAplic, nDFSe

Watermark **HOMOLOGAÇÃO** em vermelho translúcido quando `ambiente: Ambiente.ProducaoRestrita`.

## Trade-offs conhecidos

- **Template não é pixel-perfect** com o oficial. Cobre todos os campos obrigatórios mas a disposição difere em margens/tipografia. Se sua prefeitura exige layout idêntico à especificação, use `strategy: 'online'`.
- **Sem logo de município nem brasão RFB** — a lib não carrega ativos visuais. Consumidores que queiram podem parsear o XML e gerar PDF próprio com a identidade visual que precisam.
- **Fontes Helvetica built-in do PDF** — universal mas genéricas. Fontes embedadas customizadas ficam para melhoria futura.

## Salvando + anexando em email

Fluxo comum: emitir → gerar PDF → enviar pro tomador.

```typescript
const r = await cliente.emitir(params);
if (r.status !== 'ok') throw new Error('emissão falhou');

const pdf = await cliente.gerarDanfse(r.nfse.nfse);

await mailer.send({
  to: tomador.email,
  subject: `NFS-e ${r.nfse.nfse.infNFSe.nNFSe}`,
  text: 'Segue o DANFSe da nota emitida.',
  attachments: [
    {
      filename: `nfse-${r.nfse.chaveAcesso}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    },
  ],
});
```
