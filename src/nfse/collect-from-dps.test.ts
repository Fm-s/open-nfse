import { describe, expect, it } from 'vitest';
import { collectCepsFromDps, collectIdentifiersFromDps } from './collect-from-dps.js';
import type { DPS, InfDPS } from './domain.js';

function base(): DPS {
  const infDPS: InfDPS = {
    Id: 'DPS211130010057475300010000001000000000000001',
    tpAmb: '2' as InfDPS['tpAmb'],
    dhEmi: new Date('2026-04-17T14:30:00Z'),
    verAplic: 'test',
    serie: '1',
    nDPS: '1',
    dCompet: new Date('2026-04-17T00:00:00Z'),
    tpEmit: '1' as InfDPS['tpEmit'],
    cLocEmi: '2111300',
    prest: {
      identificador: { CNPJ: '00574753000100' },
      regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
    },
    serv: {
      locPrest: { cLocPrestacao: '2111300' },
      cServ: { cTribNac: '250101', cNBS: '123456789', xDescServ: 'x' },
    },
    valores: {
      vServPrest: { vServ: 100 },
      trib: {
        tribMun: { tribISSQN: '1' as never, tpRetISSQN: '1' as never },
        totTrib: { indTotTrib: '0' as never },
      },
    },
  };
  return { versao: '1.01', infDPS };
}

describe('collectCepsFromDps', () => {
  it('returns empty list when the DPS has no addresses', () => {
    expect(collectCepsFromDps(base())).toEqual([]);
  });

  it('collects prest/toma/interm national addresses', () => {
    const dps = base();
    const endNac = (cep: string) => ({
      localidade: { endNac: { cMun: '2111300', CEP: cep } },
      xLgr: 'Rua',
      nro: '1',
      xBairro: 'Centro',
    });
    const withAddrs: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: { ...dps.infDPS.prest, end: endNac('01310100') },
        toma: { identificador: { CPF: '01075595363' }, xNome: 'T', end: endNac('04538133') },
        interm: { identificador: { CNPJ: '00574753000100' }, xNome: 'I', end: endNac('20040007') },
      },
    };
    const ceps = collectCepsFromDps(withAddrs).map((c) => c.cep);
    expect(ceps).toEqual(['01310100', '04538133', '20040007']);
  });

  it('ignores exterior addresses (no CEP in endExt)', () => {
    const dps = base();
    const withExt: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        toma: {
          identificador: { NIF: 'NIF-001' },
          xNome: 'Foreign',
          end: {
            localidade: {
              endExt: { cPais: 'US', cEndPost: 'NY-10001', xCidade: 'NY', xEstProvReg: 'NY' },
            },
            xLgr: 'Main St',
            nro: '1',
            xBairro: 'Manhattan',
          },
        },
      },
    };
    expect(collectCepsFromDps(withExt)).toEqual([]);
  });

  it('includes CEPs from obra.end, atvEvento.end and IBSCBS.dest.end', () => {
    const dps = base();
    const full: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        serv: {
          ...dps.infDPS.serv,
          obra: {
            identificacao: {
              end: { CEP: '01310100', xLgr: 'Obra', nro: '1', xBairro: 'B' },
            },
          },
          atvEvento: {
            xNome: 'Feira',
            dtIni: new Date('2026-05-01T00:00:00Z'),
            dtFim: new Date('2026-05-02T00:00:00Z'),
            identificacao: {
              end: { CEP: '04538133', xLgr: 'Av', nro: '1', xBairro: 'B' },
            },
          },
        },
        IBSCBS: {
          finNFSe: '1' as never,
          indFinal: '1' as never,
          cIndOp: '01',
          indDest: '1',
          dest: {
            identificador: { CPF: '01075595363' },
            xNome: 'Dest',
            end: {
              localidade: { endNac: { cMun: '3550308', CEP: '20040007' } },
              xLgr: 'R',
              nro: '1',
              xBairro: 'B',
            },
          },
          valores: {
            trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } },
          },
        },
      },
    };
    const ceps = collectCepsFromDps(full).map((c) => c.cep);
    expect(ceps).toContain('01310100');
    expect(ceps).toContain('04538133');
    expect(ceps).toContain('20040007');
  });
});

describe('collectIdentifiersFromDps', () => {
  it('collects CNPJ/CPF from prest, toma, interm (NIF/cNaoNIF skipped)', () => {
    const dps = base();
    const withAll: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        toma: { identificador: { CPF: '01075595363' }, xNome: 'T' },
        interm: { identificador: { NIF: 'NIF-123' }, xNome: 'Estrangeiro' },
      },
    };
    const ids = collectIdentifiersFromDps(withAll);
    expect(ids).toEqual([
      { path: 'infDPS.prest.CNPJ', type: 'CNPJ', value: '00574753000100' },
      { path: 'infDPS.toma.CPF', type: 'CPF', value: '01075595363' },
    ]);
  });

  it('includes identifiers from docDedRed.fornec and IBSCBS.dest', () => {
    const dps = base();
    const full: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        valores: {
          ...dps.infDPS.valores,
          vDedRed: {
            documentos: {
              docDedRed: [
                {
                  referencia: { nDoc: 'X' },
                  tpDedRed: '1' as never,
                  dtEmiDoc: new Date('2026-04-01T00:00:00Z'),
                  vDedutivelRedutivel: 10,
                  vDeducaoReducao: 5,
                  fornec: { identificador: { CNPJ: '11222333000181' }, xNome: 'Fornec' },
                },
              ],
            },
          },
        },
        IBSCBS: {
          finNFSe: '1' as never,
          indFinal: '1' as never,
          cIndOp: '01',
          indDest: '1',
          dest: { identificador: { CNPJ: '33000167000101' }, xNome: 'D' },
          valores: { trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } } },
        },
      },
    };
    const ids = collectIdentifiersFromDps(full).map((i) => i.value);
    expect(ids).toContain('00574753000100');
    expect(ids).toContain('33000167000101');
    expect(ids).toContain('11222333000181');
  });
});
