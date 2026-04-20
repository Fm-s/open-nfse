import { describe, expect, it } from 'vitest';
import { JustificativaCancelamento, JustificativaSubstituicao } from '../nfse/enums.js';
import { parseXml } from '../xml/parser.js';
import { buildCancelamentoXml, buildSubstituicaoXml } from './build-event-xml.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';
const CHAVE_NOVA = '21113002200574753000100000000000146727037032711025';

describe('buildCancelamentoXml', () => {
  it('emits <pedRegEvento> with xmlns + versao + infPedReg Id PRE...', () => {
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'Valor digitado incorretamente',
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">',
    );
    expect(xml).toContain(`<infPedReg Id="PRE${CHAVE}101101001">`);
  });

  it('includes all required TCInfPedReg children in XSD order', () => {
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ServicoNaoPrestado,
      xMotivo: 'Cliente desistiu',
    });
    const tree = parseXml(xml) as unknown as {
      pedRegEvento: { infPedReg: Record<string, unknown> };
    };
    const inf = tree.pedRegEvento.infPedReg;
    expect(inf.tpAmb).toBe('2');
    expect(inf.verAplic).toMatch(/^open-nfse\/\d+\.\d+\.\d+$/);
    expect(typeof inf.dhEvento).toBe('string');
    expect(inf.CNPJAutor).toBe('00574753000100');
    expect(inf.chNFSe).toBe(CHAVE);
    expect(inf.nPedRegEvento).toBe('001');
    const det = inf.e101101 as Record<string, unknown>;
    expect(det.xDesc).toBe('Cancelamento de NFS-e');
    expect(det.cMotivo).toBe('2');
    expect(det.xMotivo).toBe('Cliente desistiu');
  });

  it('formats dhEvento in Brazil local time (UTC-03:00) without ms', () => {
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.Outros,
      xMotivo: 'Outro motivo detalhado',
      dhEvento: new Date('2026-04-17T14:30:00Z'),
    });
    expect(xml).toContain('<dhEvento>2026-04-17T11:30:00-03:00</dhEvento>');
  });

  it('uses CPFAutor when autor is a CPF (discriminated union)', () => {
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE,
      autor: { CPF: '01075595363' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro',
    });
    expect(xml).toContain('<CPFAutor>01075595363</CPFAutor>');
    expect(xml).not.toContain('<CNPJAutor>');
  });

  it('pads nPedRegEvento to 3 digits in the Id', () => {
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'x',
      nPedRegEvento: '7',
    });
    expect(xml).toContain(`Id="PRE${CHAVE}101101007"`);
    expect(xml).toContain('<nPedRegEvento>007</nPedRegEvento>');
  });
});

describe('buildSubstituicaoXml', () => {
  it('emits e105102 with chSubstituta referencing the new chave', () => {
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Substituição por correção de valor',
    });
    expect(xml).toContain(`<infPedReg Id="PRE${CHAVE}105102001">`);
    expect(xml).toContain('<e105102>');
    expect(xml).toContain('<xDesc>Cancelamento de NFS-e por Substituicao</xDesc>');
    expect(xml).toContain(`<chSubstituta>${CHAVE_NOVA}</chSubstituta>`);
  });

  it('omits xMotivo when not supplied (optional in 105102)', () => {
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.DesenquadramentoSN,
    });
    expect(xml).not.toContain('<xMotivo>');
  });

  it('references the ORIGINAL chave (the one being replaced) in chNFSe', () => {
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.Outros,
    });
    expect(xml).toContain(`<chNFSe>${CHAVE}</chNFSe>`);
    expect(xml).not.toContain(`<chNFSe>${CHAVE_NOVA}</chNFSe>`);
  });
});
