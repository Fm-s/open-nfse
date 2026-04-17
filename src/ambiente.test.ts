import { describe, expect, it } from 'vitest';
import { AMBIENTE_ENDPOINTS, Ambiente } from './ambiente.js';

describe('AMBIENTE_ENDPOINTS', () => {
  it('exposes HTTPS endpoints for every service in both environments', () => {
    for (const ambiente of [Ambiente.ProducaoRestrita, Ambiente.Producao]) {
      const endpoints = AMBIENTE_ENDPOINTS[ambiente];
      for (const url of Object.values(endpoints)) {
        expect(url).toMatch(/^https:\/\//);
      }
    }
  });

  it('points Produção Restrita to the homologação hosts', () => {
    const pr = AMBIENTE_ENDPOINTS[Ambiente.ProducaoRestrita];
    expect(pr.sefin).toBe('https://sefin.producaorestrita.nfse.gov.br/SefinNacional');
    expect(pr.adn).toBe('https://adn.producaorestrita.nfse.gov.br/contribuintes');
    expect(pr.danfse).toBe('https://adn.producaorestrita.nfse.gov.br/danfse');
    expect(pr.parametrosMunicipais).toBe('https://adn.producaorestrita.nfse.gov.br/parametrizacao');
  });

  it('points Produção to the live hosts (no "producaorestrita")', () => {
    const prod = AMBIENTE_ENDPOINTS[Ambiente.Producao];
    for (const url of Object.values(prod)) {
      expect(url).not.toContain('producaorestrita');
    }
    expect(prod.sefin).toBe('https://sefin.nfse.gov.br/SefinNacional');
    expect(prod.adn).toBe('https://adn.nfse.gov.br/contribuintes');
  });

  it('puts SEFIN and ADN on different hosts', () => {
    const pr = AMBIENTE_ENDPOINTS[Ambiente.ProducaoRestrita];
    const sefinHost = new URL(pr.sefin).host;
    const adnHost = new URL(pr.adn).host;
    expect(sefinHost).not.toBe(adnHost);
  });
});
