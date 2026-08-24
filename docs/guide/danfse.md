# DANFSe — PDF da nota

O DANFSe (Documento Auxiliar da NFS-e) é gerado **localmente** pela lib com `pdfkit` + QR code, sem network.

::: warning NT 008/2026 — API oficial de geração suspensa em 03/08/2026
A geração do DANFSe passa a ser responsabilidade dos sistemas emissores. Desde a v0.10.1 o default de `gerarDanfse` é `'local'`; as estratégias `'online'`/`'auto'` e o `consultarDanfse` continuam funcionando **até 03/08/2026** e estão deprecated — cada uso loga `danfse.online.deprecated`. A emissão manual pelo Portal Nacional não muda.
:::

## `cliente.gerarDanfse(nfse)` — default `local`

```typescript
const r = await cliente.emitir(params);
if (r.status === 'ok') {
  const pdf = await cliente.gerarDanfse(r.nfse.nfse);
  await fs.writeFile(`nfse-${r.nfse.chaveAcesso}.pdf`, pdf);
}
```

### Estratégias deprecated (`'auto'` / `'online'`)

Até a suspensão do endpoint, dá para forçar o caminho antigo:

```typescript
// Só ADN — lança se falhar (sem fallback). Morre em 03/08/2026:
await cliente.gerarDanfse(nfse, { strategy: 'online' });

// Online-first com fallback local em transientes (NetworkError/Timeout/5xx).
// Após 03/08/2026, toda chamada paga um round-trip perdido antes do fallback:
await cliente.gerarDanfse(nfse, { strategy: 'auto' });
```

No caminho online, erros permanentes sobem: `ForbiddenError` (CNPJ sem acesso à nota), `UnauthorizedError` (certificado expirado/inválido), `NotFoundError` (chave inexistente) e `InvalidChaveAcessoError` (formato errado) **não** caem para local — mascará-los com um PDF local degradado esconderia um problema real.

### Opções de layout

```typescript
await cliente.gerarDanfse(nfse, {
  strategy: 'local',
  urlConsultaPublica: 'https://minha.prefeitura.gov.br/consulta',  // override do QR + link
  ambiente: Ambiente.ProducaoRestrita,                              // adiciona watermark HOMOLOGAÇÃO
  observacoes: 'Pagamento via PIX. Data limite: 10/04/2026.',       // aparece em "Outras informações"
});
```

No modo `online` (deprecated) essas opções são ignoradas — a Receita usa o template próprio dela.

## `cliente.consultarDanfse(chave)` — só online (deprecated, morre em 03/08/2026)

Quando você só tem a chave (sem o objeto `NFSe`) e ainda quer o PDF oficial do ADN enquanto o endpoint existe:

```typescript
try {
  const pdf = await cliente.consultarDanfse('21113002200574753000100000000000146726037032711025');
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
`consultarDanfse` valida a chave (pattern `TSChaveNFSe`, CNPJ alfanumérico aceito) antes de tocar a rede e lança `InvalidChaveAcessoError` se a chave estiver fora do formato — mesmo comportamento de `fetchByChave`. Protege contra round-trips desperdiçados e input injection via URL.
:::

## `gerarDanfse(nfse)` standalone — função pura

Exportada pra quem não quer depender do `NfseClient`:

```typescript
import { gerarDanfse } from 'open-nfse';
import { parseNfseXml } from 'open-nfse';

const nfse = parseNfseXml(xmlFromDatabase);
const pdf = await gerarDanfse(nfse, { observacoes: '...' });
```

Útil pra regerar DANFSe a partir do XML salvo no seu banco (ver [integração](./integracao#minimo)) sem precisar de cliente configurado.

## Layout do PDF local

A4 portrait, uma página, com os seguintes blocos:

1. **Cabeçalho** — "DANFS-e", chave de acesso (50 caracteres agrupados em 4), nº NFS-e, protocolo
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

- **Template ainda não segue o leiaute nacional único "DANFSe v2.0" da NT 008/2026.** O renderer atual cobre os campos principais do leiaute antigo (identificação, prestador, tomador, serviço, valores, totais IBS/CBS, QR Code), mas o leiaute v2.0 exige blocos que ainda não renderizamos: destinatário e intermediário, tributação municipal (ISSQN) detalhada, tributação federal (IRRF/PIS/COFINS), IBS/CBS por alíquotas efetivas (`vIBSMun`/`vIBSUF`/`pCBS`...), textos de supressão com redação oficial, watermarks CANCELADA/SUBSTITUÍDA e canhoto. A adequação está no roadmap (`specs/standards-watch.md`).
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
