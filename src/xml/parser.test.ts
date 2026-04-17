import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTR_PREFIX, parseXml } from './parser.js';

const SAMPLE_PATH = join(
  __dirname,
  '..',
  '..',
  'specs',
  'samples',
  '21113002200574753000100000000000146726037032711025.xml',
);

describe('parseXml', () => {
  it('parses a minimal element', () => {
    const tree = parseXml('<foo><bar>hello</bar></foo>');
    expect(tree.foo).toEqual({ bar: 'hello' });
  });

  it('keeps values as strings (no numeric/boolean coercion)', () => {
    const tree = parseXml('<foo><n>42</n><b>true</b></foo>');
    expect((tree.foo as { n: unknown; b: unknown }).n).toBe('42');
    expect((tree.foo as { n: unknown; b: unknown }).b).toBe('true');
  });

  it('strips namespace prefixes so domain code sees plain tag names', () => {
    const tree = parseXml(
      '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/></NFSe>',
    );
    // Signature appears without the ds: prefix
    expect(Object.keys(tree.NFSe as object)).toContain('Signature');
  });

  it(`prefixes attributes with '${ATTR_PREFIX}'`, () => {
    const tree = parseXml('<foo versao="1.01"><bar Id="x"/></foo>');
    expect((tree.foo as Record<string, unknown>)[`${ATTR_PREFIX}versao`]).toBe('1.01');
    expect(
      ((tree.foo as Record<string, unknown>).bar as Record<string, unknown>)[`${ATTR_PREFIX}Id`],
    ).toBe('x');
  });

  it('collapses repeated siblings into arrays', () => {
    const tree = parseXml('<list><item>a</item><item>b</item><item>c</item></list>');
    expect((tree.list as { item: string[] }).item).toEqual(['a', 'b', 'c']);
  });

  it('preserves whitespace in text content (relevant for xDescServ with newlines)', () => {
    const tree = parseXml('<foo>linha 1\n\nlinha 2</foo>');
    expect(tree.foo).toBe('linha 1\n\nlinha 2');
  });

  it('parses the captured NFS-e sample and exposes NFSe/infNFSe/emit/DPS structure', () => {
    const xml = readFileSync(SAMPLE_PATH, 'utf-8');
    const tree = parseXml(xml);
    const nfse = tree.NFSe as Record<string, unknown>;

    expect(nfse[`${ATTR_PREFIX}versao`]).toBe('1.01');

    const infNFSe = nfse.infNFSe as Record<string, unknown>;
    expect(infNFSe[`${ATTR_PREFIX}Id`]).toBe(
      'NFS21113002200574753000100000000000146726037032711025',
    );
    expect(infNFSe.nNFSe).toBe('1467');
    expect(infNFSe.cLocIncid).toBe('2111300');

    const emit = infNFSe.emit as Record<string, unknown>;
    expect(emit.CNPJ).toBe('00574753000100');
    expect(emit.xNome).toBe('VOGA LTDA');
    expect((emit.enderNac as Record<string, unknown>).UF).toBe('MA');

    const dps = infNFSe.DPS as Record<string, unknown>;
    const infDPS = dps.infDPS as Record<string, unknown>;
    expect((infDPS.toma as Record<string, unknown>).CPF).toBe('01075595363');

    const prest = infDPS.prest as { regTrib: { opSimpNac: string } };
    expect(prest.regTrib.opSimpNac).toBe('3');
  });
});
