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
    // Estável usa `open-nfse/` até 10 chars de versão; acima disso, `onfse/`.
    ['99.99.99', 'open-nfse/99.99.99'],
    ['100.100.10', 'open-nfse/100.100.10'],
    ['100.100.100', 'onfse/100.100.100'],
    ['0.12.0-rc.1', 'open-nfse/0.12.0rc1'],
    ['0.12.0-rc.10', 'open-nfse/0.12.0rc10'],
    ['0.12.0-rc.11', 'open-nfse/0.12.0rc11'],
    ['0.12.0-beta.1', 'open-nfse/0.12.0b1'],
    ['1.0.0-beta.2', 'open-nfse/1.0.0b2'],
    ['1.0.0-alpha.2', 'open-nfse/1.0.0a2'],
    // Pré-release conhecido sempre na mesma grafia (rc9 e rc100, nunca c100).
    ['0.12.0-rc.9', 'open-nfse/0.12.0rc9'],
    ['0.12.0-rc.100', 'onfse/0.12.0rc100'],
    // Não cabe com o prefixo longo → prefixo curto `onfse/`, sem perder dígito.
    ['1.10.10-rc.10', 'onfse/1.10.10rc10'],
    ['10.10.10-rc.10', 'onfse/10.10.10rc10'],
    ['10.20.30-rc.123', 'onfse/10.20.30rc123'],
    // Pré-release fora do padrão `<alpha|beta|rc>.<n>` mantém o `-` e os `.`.
    ['0.12.1-0', 'open-nfse/0.12.1-0'],
    ['1.0.0-rc.1.1', 'onfse/1.0.0-rc.1.1'],
    // Build metadata (+…) não identifica a release: descartado.
    ['1.2.3+build.7', 'open-nfse/1.2.3'],
    ['0.12.0-rc.1+sha.abc', 'open-nfse/0.12.0rc1'],
    // Fallback de readLibVersion quando o package.json não é legível.
    ['unknown', 'open-nfse/unknown'],
  ])('%s → %s', (version, expected) => {
    expect(toVerAplic(version)).toBe(expected);
    assertTsVerAplic(toVerAplic(version));
  });

  it.each([
    ['10.10.10-rc.10', '10.10.10-rc.1'],
    ['10.10.10-beta.11', '10.10.10-beta.1'],
    ['0.12.1-0', '0.12.10'],
    ['0.12.0-1', '0.12.01'],
    ['1.0.0-rc.1.1', '1.0.0-rc.11'],
    ['1.0.0-rc1', '1.0.0-rc.1'],
    ['1.0.0-c.1', '1.0.0-rc.1'],
  ])('%s e %s geram verAplic distintos', (a, b) => {
    expect(toVerAplic(a)).not.toBe(toVerAplic(b));
  });

  it('é injetivo no espaço de versões realistas (sem colisão, sempre ≤ 20 chars)', () => {
    const versoes: string[] = [];
    for (const major of [0, 1, 2, 9, 10, 12, 99]) {
      for (const minor of [0, 1, 9, 10, 12, 99]) {
        for (const patch of [0, 1, 9, 10, 30, 99]) {
          const core = `${major}.${minor}.${patch}`;
          versoes.push(core);
          for (const tag of ['alpha', 'beta', 'rc']) {
            for (const n of [0, 1, 2, 9, 10, 11, 99, 100, 123]) {
              const v = `${core}-${tag}.${n}`;
              // Só versões que cabem de algum jeito (as demais lançam, ver abaixo).
              try {
                toVerAplic(v);
                versoes.push(v);
              } catch {}
            }
          }
          for (const n of [0, 1, 10]) versoes.push(`${core}-${n}`);
        }
      }
    }
    const vistos = new Map<string, string>();
    for (const v of versoes) {
      const ver = toVerAplic(v);
      assertTsVerAplic(ver);
      expect(vistos.get(ver), `${v} colide com ${vistos.get(ver)} em ${ver}`).toBeUndefined();
      vistos.set(ver, v);
    }
    // Cobertura: o pior caso realista (2 dígitos em tudo + rc de 3 dígitos) entrou.
    expect(vistos.get('onfse/99.99.99rc123')).toBe('99.99.99-rc.123');
  });

  it('lança em vez de truncar quando a versão não cabe sem perda em 20 chars', () => {
    expect(() => toVerAplic('10.20.30-snapshot.20261031')).toThrow(/verAplic/);
    expect(() => toVerAplic('0.12.0-x.7.z.92')).toThrow(/verAplic/);
  });
});
