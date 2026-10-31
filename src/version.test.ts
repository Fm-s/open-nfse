import { describe, expect, it } from 'vitest';
import { buildDps } from './nfse/build-dps.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from './nfse/enums.js';
import { DEFAULT_VER_APLIC, LIB_VERSION, toVerAplic } from './version.js';

// TSVerAplic (base TSString): 1 a 20 chars imprimíveis, sem espaço nas pontas.
const TS_VER_APLIC = /^(?:[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ])$/u;

function assertTsVerAplic(v: string): void {
  expect(v.length).toBeGreaterThanOrEqual(1);
  expect(v.length).toBeLessThanOrEqual(20);
  expect(v).toMatch(TS_VER_APLIC);
}

describe('DEFAULT_VER_APLIC', () => {
  it('satisfaz TSVerAplic para a versão corrente do package.json', () => {
    expect(DEFAULT_VER_APLIC).toBe(toVerAplic(LIB_VERSION));
    assertTsVerAplic(DEFAULT_VER_APLIC);
  });

  it('é aceito pelo guard de verAplic do buildDps (default sem override)', () => {
    const dps = buildDps({
      layout: 'nt004',
      emitente: {
        cnpj: '00574753000100',
        codMunicipio: '2111300',
        regime: {
          opSimpNac: OpcaoSimplesNacional.NaoOptante,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
      serie: '1',
      nDPS: '1',
      servico: { cTribNac: '250101', descricao: 'Teste' },
      valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
    });
    expect(dps.infDPS.verAplic).toBe(DEFAULT_VER_APLIC);
  });
});

describe('toVerAplic', () => {
  it.each([
    ['0.11.0', 'open-nfse/0.11.0'],
    ['0.12.0-rc.1', 'open-nfse/0.12.0rc1'],
    // 'open-nfse/0.12.0beta1' teria 21 chars → abrevia (beta → b) sem perder dígitos.
    ['0.12.0-beta.1', 'open-nfse/0.12.0b1'],
    // 'open-nfse/1.10.10rc10' teria 21 chars → abrevia (rc → c) sem perder dígitos.
    ['1.10.10-rc.10', 'open-nfse/1.10.10c10'],
    ['1.0.0-alpha.2', 'open-nfse/1.0.0a2'],
    // Build metadata (+…) não identifica a release: descartado.
    ['1.2.3+build.7', 'open-nfse/1.2.3'],
  ])('%s → %s', (version, expected) => {
    expect(toVerAplic(version)).toBe(expected);
    assertTsVerAplic(toVerAplic(version));
  });

  it('é determinístico e sempre válido, mesmo quando só truncando cabe', () => {
    const longa = '10.20.30-snapshot.20261031';
    const v = toVerAplic(longa);
    expect(v).toBe(toVerAplic(longa));
    expect(v.startsWith('open-nfse/')).toBe(true);
    assertTsVerAplic(v);
  });
});
