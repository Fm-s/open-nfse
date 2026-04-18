import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ambiente } from '../ambiente.js';
import { parseNfseXml } from '../nfse/parse-xml.js';
import { gerarDanfse } from './gerar.js';

const SAMPLE_XML = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'specs',
    'samples',
    '21113002200574753000100000000000146726037032711025.xml',
  ),
  'utf-8',
);

describe('gerarDanfse', () => {
  it('produces a valid PDF buffer from a real NFS-e fixture', async () => {
    const nfse = parseNfseXml(SAMPLE_XML);
    const pdf = await gerarDanfse(nfse);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(2000); // at least a few KB
    // PDF magic bytes
    expect(pdf.slice(0, 5).toString('utf-8')).toBe('%PDF-');
    // ends with EOF marker
    expect(pdf.slice(-6).toString('utf-8').trim()).toMatch(/%%EOF/);
  });

  it('embeds a Title in the PDF info dictionary', async () => {
    const nfse = parseNfseXml(SAMPLE_XML);
    const pdf = await gerarDanfse(nfse);
    const asString = pdf.toString('latin1');
    // The Title entry exists in the /Info dict; exact encoding varies.
    expect(asString).toMatch(/\/Title/);
  });

  it('accepts observacoes option', async () => {
    const nfse = parseNfseXml(SAMPLE_XML);
    const pdf = await gerarDanfse(nfse, { observacoes: 'Pagamento via PIX' });
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('marks homologação visually when ambiente is ProducaoRestrita', async () => {
    const nfse = parseNfseXml(SAMPLE_XML);
    const pdfProd = await gerarDanfse(nfse, { ambiente: Ambiente.Producao });
    const pdfHomo = await gerarDanfse(nfse, { ambiente: Ambiente.ProducaoRestrita });
    // Homologação adiciona o watermark, então fica maior.
    expect(pdfHomo.length).toBeGreaterThan(pdfProd.length);
  });

  it('uses the custom urlConsultaPublica when provided', async () => {
    const nfse = parseNfseXml(SAMPLE_XML);
    const customUrl = 'https://minha.prefeitura.gov.br/consulta';
    const pdf = await gerarDanfse(nfse, { urlConsultaPublica: customUrl });
    expect(pdf.toString('latin1')).toContain(customUrl);
  });
});
