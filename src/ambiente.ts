export enum Ambiente {
  ProducaoRestrita = 'PRODUCAO_RESTRITA',
  Producao = 'PRODUCAO',
}

export enum TipoAmbiente {
  Producao = 'PRODUCAO',
  Homologacao = 'HOMOLOGACAO',
}

export interface AmbienteEndpoints {
  readonly sefin: string;
  readonly adn: string;
  readonly danfse: string;
  readonly parametrosMunicipais: string;
}

export const AMBIENTE_ENDPOINTS = {
  [Ambiente.ProducaoRestrita]: {
    sefin: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
    adn: 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
    danfse: 'https://adn.producaorestrita.nfse.gov.br/danfse',
    parametrosMunicipais: 'https://adn.producaorestrita.nfse.gov.br/parametrizacao',
  },
  [Ambiente.Producao]: {
    sefin: 'https://sefin.nfse.gov.br/SefinNacional',
    adn: 'https://adn.nfse.gov.br/contribuintes',
    danfse: 'https://adn.nfse.gov.br/danfse',
    parametrosMunicipais: 'https://adn.nfse.gov.br/parametrizacao',
  },
} as const satisfies Record<Ambiente, AmbienteEndpoints>;
