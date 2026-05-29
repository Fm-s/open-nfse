import { describe, expect, it } from 'vitest';
import { TipoEventoNfse } from '../nfse/enums.js';
import { parseEventoXml } from './parse-event.js';

function wrap(inner: string, tipoEventoId = '240520231030000000000000000000000000000000000') {
  const nDFSe = '12345';
  return `<?xml version="1.0" encoding="UTF-8"?>
<evento versao="1.01">
  <infEvento Id="ID${tipoEventoId}">
    <ambGer>2</ambGer>
    <nSeqEvento>1</nSeqEvento>
    <dhProc>2026-04-17T10:00:00-03:00</dhProc>
    <nDFSe>${nDFSe}</nDFSe>
    <pedRegEvento versao="1.01">
      <infPedReg Id="PRE${tipoEventoId}">
        <tpAmb>2</tpAmb>
        <verAplic>1.0.0</verAplic>
        <dhEvento>2026-04-17T09:59:00-03:00</dhEvento>
        <CNPJAutor>00574753000100</CNPJAutor>
        <chNFSe>21113002200574753000100000000000146726037032711025</chNFSe>
        <nPedRegEvento>001</nPedRegEvento>
        ${inner}
      </infPedReg>
    </pedRegEvento>
  </infEvento>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="#id1"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>abc</DigestValue></Reference>
    </SignedInfo>
    <SignatureValue>sig</SignatureValue>
    <KeyInfo><X509Data><X509Certificate>cert</X509Certificate></X509Data></KeyInfo>
  </Signature>
</evento>`;
}

describe('parseEventoXml — cobertura de tipos de evento', () => {
  it('parseia e101101 (cancelamento)', () => {
    const r = parseEventoXml(
      wrap(
        '<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Erro de digitação</xMotivo></e101101>',
      ),
    );
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe(TipoEventoNfse.Cancelamento);
    if ('e101101' in r.infEvento.pedRegEvento.infPedReg.detalhe) {
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e101101.xMotivo).toBe('Erro de digitação');
    }
  });

  it('parseia e202201 (confirmação do prestador) — payload mínimo', () => {
    const r = parseEventoXml(wrap('<e202201><xDesc>Confirmação do Prestador</xDesc></e202201>'));
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe(TipoEventoNfse.ConfirmacaoPrestador);
    if ('e202201' in r.infEvento.pedRegEvento.infPedReg.detalhe) {
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e202201.xDesc).toBe(
        'Confirmação do Prestador',
      );
    }
  });

  it('parseia e202205 (rejeição do prestador) — cMotivo/xMotivo filhos diretos (sem infRej)', () => {
    const r = parseEventoXml(
      wrap(
        '<e202205><xDesc>Rejeição do Prestador</xDesc><cMotivo>1</cMotivo><xMotivo>NFS-e em duplicidade</xMotivo></e202205>',
      ),
    );
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe(TipoEventoNfse.RejeicaoPrestador);
    if ('e202205' in r.infEvento.pedRegEvento.infPedReg.detalhe) {
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e202205.cMotivo).toBe('1');
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e202205.xMotivo).toBe(
        'NFS-e em duplicidade',
      );
    }
  });

  it('parseia e305101 (cancelamento por ofício)', () => {
    const r = parseEventoXml(
      wrap(
        '<e305101><xDesc>Cancelamento de NFS-e por Ofício</xDesc><CPFAgTrib>01234567890</CPFAgTrib><nProcAdm>PROC-2026-001</nProcAdm><xProcAdm>Decisão administrativa</xProcAdm></e305101>',
      ),
    );
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe(
      TipoEventoNfse.CancelamentoPorOficio,
    );
    if ('e305101' in r.infEvento.pedRegEvento.infPedReg.detalhe) {
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e305101.CPFAgTrib).toBe('01234567890');
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.e305101.nProcAdm).toBe('PROC-2026-001');
    }
  });

  it('fallback unknown preserva raw para elementos não modelados', () => {
    // Usa um código fictício tipo-estruturado mas fora do conjunto conhecido
    const r = parseEventoXml(
      wrap('<e999999><xDesc>Tipo futuro</xDesc><campoNovo>valor</campoNovo></e999999>'),
    );
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe('999999');
    if ('unknown' in r.infEvento.pedRegEvento.infPedReg.detalhe) {
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.unknown.elementName).toBe('e999999');
      expect(r.infEvento.pedRegEvento.infPedReg.detalhe.unknown.raw).toBeDefined();
    }
  });

  // Regressão: a SEFIN em produção (SefinNacional_1.6.0) devolve o número do
  // documento no elemento <nDFSe> (com S) — igual ao documento NFS-e. O parser
  // lia <nDFe> (sem S) e lançava `elemento <nDFe> ausente ou não textual` num
  // cancelamento que JÁ tinha sido aceito pela SEFIN, descartando a resposta de
  // sucesso. XML abaixo é uma resposta real de cancelamento (cert/dados zerados).
  it('parses resposta real de cancelamento da SEFIN com <nDFSe>', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<evento versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infEvento Id="EVT21113002200574753000100000000000260326050759841311101101001">
    <verAplic>SefinNacional_1.6.0</verAplic>
    <ambGer>2</ambGer>
    <nSeqEvento>1</nSeqEvento>
    <dhProc>2026-05-28T18:22:45-03:00</dhProc>
    <nDFSe>0</nDFSe>
    <pedRegEvento versao="1.01">
      <infPedReg Id="PRE21113002200574753000100000000000260326050759841311101101">
        <tpAmb>1</tpAmb>
        <verAplic>open-nfse/0.8.6</verAplic>
        <dhEvento>2026-05-28T18:22:45-03:00</dhEvento>
        <CNPJAutor>00574753000100</CNPJAutor>
        <chNFSe>21113002200574753000100000000000260326050759841311</chNFSe>
        <e101101>
          <xDesc>Cancelamento de NFS-e</xDesc>
          <cMotivo>1</cMotivo>
          <xMotivo>Emissão duplicada e data de competência errada</xMotivo>
        </e101101>
      </infPedReg>
    </pedRegEvento>
  </infEvento>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <Reference URI="#EVT21113002200574753000100000000000260326050759841311101101001"><DigestValue>x</DigestValue></Reference>
    </SignedInfo>
    <SignatureValue>sig</SignatureValue>
    <KeyInfo><X509Data><X509Certificate>cert</X509Certificate></X509Data></KeyInfo>
  </Signature>
</evento>`;
    const r = parseEventoXml(xml);
    expect(r.infEvento.nDFSe).toBe('0');
    expect(r.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe(TipoEventoNfse.Cancelamento);
  });
});
