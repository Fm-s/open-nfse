import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Ambiente } from '../ambiente.js';
import type { NFSe } from '../nfse/domain.js';

export interface GerarDanfseOptions {
  /**
   * URL base do portal público onde o tomador consulta a NFS-e. O QR Code e
   * o link de verificação usam este URL. Default: produção (
   * `https://adn.nfse.gov.br/contribuintes/consulta`). Para homologação passe
   * `https://adn.producaorestrita.nfse.gov.br/contribuintes/consulta`.
   */
  readonly urlConsultaPublica?: string;
  /** Ambiente — ajusta a URL default e marca "HOMOLOGAÇÃO" visualmente. */
  readonly ambiente?: Ambiente;
  /** Observações extras que aparecem na área "Outras informações". */
  readonly observacoes?: string;
}

const URL_CONSULTA_PRODUCAO = 'https://adn.nfse.gov.br/contribuintes/consulta';
const URL_CONSULTA_RESTRITA = 'https://adn.producaorestrita.nfse.gov.br/contribuintes/consulta';

/**
 * Gera o DANFSe (Documento Auxiliar da NFS-e) em PDF a partir de uma `NFSe`
 * tipada — geralmente a resposta de `cliente.emitir()` ou `fetchByChave()`.
 *
 * Layout A4 portrait, com:
 * - Cabeçalho com chave de acesso + tipo de ambiente
 * - Dados do emitente (prestador)
 * - Dados do tomador quando presente
 * - Descrição do serviço + códigos (cTribNac, cNBS, cClassTrib)
 * - Valores e tributação (ISS, retenções, IBS/CBS quando presente)
 * - QR Code de verificação + URL
 * - Rodapé com protocolo, data/hora de processamento e chave formatada
 *
 * Não tenta reproduzir pixel-perfect o template oficial — mantém os **campos
 * obrigatórios** legíveis em uma folha. Para customização além do `options`,
 * consumidores podem parsear o XML e gerar PDF próprio.
 */
export async function gerarDanfse(nfse: NFSe, options?: GerarDanfseOptions): Promise<Buffer> {
  const ambiente = options?.ambiente ?? Ambiente.Producao;
  const urlBase =
    options?.urlConsultaPublica ??
    (ambiente === Ambiente.Producao ? URL_CONSULTA_PRODUCAO : URL_CONSULTA_RESTRITA);
  const urlConsulta = `${urlBase}?chave=${nfse.infNFSe.chaveAcesso}`;

  const qrPng = await QRCode.toBuffer(urlConsulta, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160,
  });

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 32,
      info: { Title: `DANFSe ${nfse.infNFSe.chaveAcesso}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      renderCabecalho(doc, nfse, ambiente);
      renderEmitente(doc, nfse);
      renderTomador(doc, nfse);
      renderServico(doc, nfse);
      renderValores(doc, nfse);
      renderIbsCbs(doc, nfse);
      renderObservacoes(doc, options?.observacoes);
      renderQrCode(doc, qrPng, urlConsulta);
      renderRodape(doc, nfse);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

const COLOR_BORDER = '#888';
const COLOR_LABEL = '#555';
const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

type Doc = InstanceType<typeof PDFDocument>;

function box(doc: Doc, label: string, x: number, y: number, w: number, h: number): void {
  doc.lineWidth(0.5).strokeColor(COLOR_BORDER).rect(x, y, w, h).stroke();
  if (label) {
    doc
      .fillColor(COLOR_LABEL)
      .fontSize(6)
      .font(FONT_BOLD)
      .text(label.toUpperCase(), x + 3, y + 2, { lineBreak: false });
  }
  doc.fillColor('black');
}

function field(doc: Doc, label: string, value: string, x: number, y: number, w: number): number {
  doc
    .fillColor(COLOR_LABEL)
    .fontSize(6)
    .font(FONT_BOLD)
    .text(label.toUpperCase(), x, y, { width: w, lineBreak: false });
  doc
    .fillColor('black')
    .fontSize(9)
    .font(FONT_REGULAR)
    .text(value || '—', x, y + 8, { width: w });
  return doc.y + 4;
}

function formatChave(chave: string): string {
  // 50 digits — split in groups of 4 for readability
  return chave.match(/.{1,4}/g)?.join(' ') ?? chave;
}

function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return value;
}

function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return cep;
}

function currency(n: number | undefined): string {
  if (n === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function percent(n: number | undefined): string {
  if (n === undefined) return '—';
  return `${currency(n)} %`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderCabecalho(doc: Doc, nfse: NFSe, ambiente: Ambiente): void {
  const inf = nfse.infNFSe;
  const x = 32;
  const w = 531;

  box(doc, '', x, 32, w, 60);
  doc
    .fillColor('black')
    .font(FONT_BOLD)
    .fontSize(14)
    .text('DANFS-e', x + 10, 40);
  doc
    .fontSize(8)
    .font(FONT_REGULAR)
    .text('Documento Auxiliar da Nota Fiscal de Serviço Eletrônica', x + 10, 58);
  doc.fontSize(7).text('Padrão Nacional — nfse.gov.br', x + 10, 70);

  doc
    .font(FONT_BOLD)
    .fontSize(8)
    .text('CHAVE DE ACESSO', x + 260, 40);
  doc
    .font(FONT_REGULAR)
    .fontSize(9)
    .text(formatChave(inf.chaveAcesso), x + 260, 50, { width: 260 });
  doc
    .fontSize(7)
    .fillColor(COLOR_LABEL)
    .text(`Nº NFS-e: ${inf.nNFSe}`, x + 260, 72);
  doc.text(`Protocolo DF-e: ${inf.nDFSe}`, x + 390, 72);

  if (ambiente === Ambiente.ProducaoRestrita) {
    doc.save();
    doc.rotate(-15, { origin: [300, 300] });
    doc.fillColor('#ff000022').fontSize(80).font(FONT_BOLD).text('HOMOLOGAÇÃO', 100, 280);
    doc.restore();
    doc.fillColor('black');
  }
}

function renderEmitente(doc: Doc, nfse: NFSe): void {
  const emit = nfse.infNFSe.emit;
  const x = 32;
  const w = 531;
  const y = 100;
  box(doc, 'Prestador de Serviços', x, y, w, 68);

  const cnpj =
    'CNPJ' in emit.identificador
      ? emit.identificador.CNPJ
      : 'CPF' in emit.identificador
        ? emit.identificador.CPF
        : '';
  field(doc, 'CNPJ / CPF', formatCnpjCpf(cnpj), x + 6, y + 14, 140);
  field(doc, 'Inscrição Municipal', emit.IM ?? '—', x + 150, y + 14, 120);
  field(doc, 'Nome / Razão Social', emit.xNome, x + 275, y + 14, 286);

  const e = emit.enderNac;
  field(doc, 'Endereço', `${e.xLgr}, ${e.nro}${e.xCpl ? ` - ${e.xCpl}` : ''}`, x + 6, y + 38, 350);
  field(doc, 'Bairro', e.xBairro, x + 360, y + 38, 100);
  field(doc, 'CEP', formatCep(e.CEP), x + 465, y + 38, 80);

  const yb = doc.y;
  field(doc, 'Município', nfse.infNFSe.xLocEmi, x + 6, yb, 260);
  field(doc, 'UF', e.UF, x + 275, yb, 40);
  if (emit.email) field(doc, 'E-mail', emit.email, x + 320, yb, 240);
}

function renderTomador(doc: Doc, nfse: NFSe): void {
  const toma = nfse.infNFSe.DPS.infDPS.toma;
  const x = 32;
  const w = 531;
  const y = 176;
  box(doc, 'Tomador de Serviços', x, y, w, 58);

  if (!toma) {
    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(COLOR_LABEL)
      .text('Tomador não identificado (consumidor final).', x + 6, y + 20);
    doc.fillColor('black');
    return;
  }

  const idLabel =
    'CNPJ' in toma.identificador
      ? ['CNPJ', formatCnpjCpf(toma.identificador.CNPJ)]
      : 'CPF' in toma.identificador
        ? ['CPF', formatCnpjCpf(toma.identificador.CPF)]
        : 'NIF' in toma.identificador
          ? ['NIF', toma.identificador.NIF]
          : ['Sem NIF', toma.identificador.cNaoNIF];

  field(doc, idLabel[0] as string, idLabel[1] as string, x + 6, y + 14, 160);
  field(doc, 'Nome / Razão Social', toma.xNome, x + 175, y + 14, 380);

  if (toma.end) {
    const end = toma.end;
    const isNac = 'endNac' in end.localidade;
    const endereco = `${end.xLgr}, ${end.nro}${end.xCpl ? ` - ${end.xCpl}` : ''} — ${end.xBairro}`;
    field(doc, 'Endereço', endereco, x + 6, y + 38, 400);
    if (isNac) {
      field(doc, 'CEP', formatCep(end.localidade.endNac.CEP), x + 415, y + 38, 80);
    }
  }
}

function renderServico(doc: Doc, nfse: NFSe): void {
  const inf = nfse.infNFSe;
  const serv = inf.DPS.infDPS.serv;
  const x = 32;
  const w = 531;
  const y = 242;
  box(doc, 'Descrição do Serviço', x, y, w, 108);

  field(doc, 'Código de Tributação Nacional', serv.cServ.cTribNac, x + 6, y + 14, 160);
  field(doc, 'Código NBS', serv.cServ.cNBS ?? '—', x + 175, y + 14, 100);
  if (serv.cServ.cTribMun)
    field(doc, 'Código Municipal', serv.cServ.cTribMun, x + 290, y + 14, 120);
  field(doc, 'Local de Incidência', inf.xLocIncid ?? inf.xLocPrestacao, x + 420, y + 14, 140);

  doc
    .fillColor(COLOR_LABEL)
    .fontSize(6)
    .font(FONT_BOLD)
    .text('DISCRIMINAÇÃO DO SERVIÇO', x + 6, y + 40);
  doc
    .fillColor('black')
    .fontSize(9)
    .font(FONT_REGULAR)
    .text(serv.cServ.xDescServ, x + 6, y + 50, { width: w - 12, height: 54 });
}

function renderValores(doc: Doc, nfse: NFSe): void {
  const inf = nfse.infNFSe;
  const valores = inf.valores;
  const trib = inf.DPS.infDPS.valores.trib;
  const vServ = inf.DPS.infDPS.valores.vServPrest.vServ;
  const x = 32;
  const w = 531;
  const y = 358;
  box(doc, 'Valores', x, y, w, 72);

  field(doc, 'Valor do Serviço', currency(vServ), x + 6, y + 14, 100);
  field(doc, 'Base de Cálculo', currency(valores.vBC ?? vServ), x + 110, y + 14, 100);
  field(
    doc,
    'Alíquota ISSQN',
    percent(valores.pAliqAplic ?? trib.tribMun.pAliq),
    x + 215,
    y + 14,
    90,
  );
  field(doc, 'Valor ISSQN', currency(valores.vISSQN), x + 310, y + 14, 100);
  field(doc, 'Retenções', currency(valores.vTotalRet), x + 415, y + 14, 140);

  // Linha 2 — líquido em destaque
  doc
    .fillColor(COLOR_LABEL)
    .fontSize(7)
    .font(FONT_BOLD)
    .text('VALOR LÍQUIDO', x + 6, y + 46);
  doc
    .fillColor('black')
    .fontSize(14)
    .font(FONT_BOLD)
    .text(`R$ ${currency(valores.vLiq)}`, x + 6, y + 54);

  if (valores.xOutInf) {
    doc
      .fillColor(COLOR_LABEL)
      .fontSize(7)
      .text(valores.xOutInf, x + 200, y + 50, { width: w - 210 });
    doc.fillColor('black');
  }
}

function renderIbsCbs(doc: Doc, nfse: NFSe): void {
  const ibs = nfse.infNFSe.IBSCBS;
  if (!ibs) return;
  const x = 32;
  const w = 531;
  const y = 438;
  box(doc, 'IBS / CBS (Reforma Tributária)', x, y, w, 50);
  field(doc, 'Localidade de Incidência', ibs.xLocalidadeIncid, x + 6, y + 14, 200);
  field(doc, 'Valor Total NF', currency(ibs.totCIBS.vTotNF), x + 210, y + 14, 120);
  field(doc, 'Valor IBS Total', currency(ibs.totCIBS.gIBS.vIBSTot), x + 335, y + 14, 100);
  field(doc, 'Valor CBS', currency(ibs.totCIBS.gCBS.vCBS), x + 440, y + 14, 100);
}

function renderObservacoes(doc: Doc, observacoes: string | undefined): void {
  if (!observacoes) return;
  const x = 32;
  const w = 531;
  const y = 496;
  box(doc, 'Outras Informações', x, y, w, 40);
  doc
    .fontSize(8)
    .font(FONT_REGULAR)
    .fillColor('black')
    .text(observacoes, x + 6, y + 12, { width: w - 12, height: 26 });
}

function renderQrCode(doc: Doc, qrPng: Buffer, urlConsulta: string): void {
  const x = 32;
  const y = 544;
  const w = 531;
  const h = 110;
  box(doc, 'Consulta da Autenticidade', x, y, w, h);
  doc.image(qrPng, x + 8, y + 14, { width: 90, height: 90 });
  doc
    .fontSize(7)
    .fillColor(COLOR_LABEL)
    .font(FONT_BOLD)
    .text('VERIFICAÇÃO NO PORTAL NACIONAL', x + 108, y + 18);
  doc
    .fontSize(8)
    .font(FONT_REGULAR)
    .fillColor('black')
    .text(
      'Leia o QR Code ou acesse o link abaixo com a chave de acesso para validar a autenticidade desta NFS-e:',
      x + 108,
      y + 30,
      { width: w - 118 },
    );
  doc
    .fillColor('#0066cc')
    .fontSize(8)
    .font(FONT_REGULAR)
    .text(urlConsulta, x + 108, y + 58, { width: w - 118, link: urlConsulta, underline: true });
  doc.fillColor('black');
}

function renderRodape(doc: Doc, nfse: NFSe): void {
  const inf = nfse.infNFSe;
  const x = 32;
  const y = 680;
  const w = 531;
  box(doc, 'Autorização', x, y, w, 56);
  field(doc, 'Chave de Acesso', formatChave(inf.chaveAcesso), x + 6, y + 14, 380);
  field(doc, 'Situação (cStat)', inf.cStat, x + 400, y + 14, 140);
  field(
    doc,
    'Data/Hora do Processamento',
    inf.dhProc.toISOString().replace('T', ' ').slice(0, 19),
    x + 6,
    y + 36,
    220,
  );
  field(doc, 'Versão Aplicativo', inf.verAplic, x + 230, y + 36, 160);
  field(doc, 'Nº DFSe', inf.nDFSe, x + 400, y + 36, 140);

  // Créditos discretos
  doc
    .fontSize(6)
    .fillColor('#aaa')
    .font(FONT_REGULAR)
    .text('Gerado por open-nfse', x, 780, { width: w, align: 'center' });
  doc.fillColor('black');
}
