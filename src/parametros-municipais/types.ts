/** Convênio do município — 1 Pleno, 2 Simplificado. */
export type TipoConvenio = '1' | '2';

/** Resposta Sim/Não do ADN — 0 Não, 1 Sim, -1 Indefinido. */
export type TipoSimNao = '0' | '1' | '-1';

/** Situação de emissão padrão para contribuintes RFB — 0 Não, 1 Sim, -1 Indefinido. */
export type TipoSituacaoEmissaoPadraoContribuintesRFB = '0' | '1' | '-1';

/** Configuração do regime especial — 1 Permitido, 2 Vedado, 3 Obrigatório. */
export type TipoConfiguracaoRegimeEspecial = '1' | '2' | '3';

/** Tipo de redução da base de cálculo — 1 Percentual, 2 Alíquota diferenciada. */
export type TipoReducaoBaseDeCalculo = '1' | '2';

/** Tipo de inscrição para benefício — 0 Qualquer, 1 CNPJ, 2 CPF, 3 NIF, 4 cNaoNIF. */
export type TipoInscricaoBeneficio = '0' | '1' | '2' | '3' | '4';

/** Tipo de retenção de ISSQN — 0 Qualquer, 1 Retido, 2 Não retido, 3 A critério. */
export type TipoRetencaoISSQN = '0' | '1' | '2' | '3';

/**
 * Uma alíquota de ISSQN parametrizada pelo município.
 * O wire usa PascalCase (`Incidencia`, `Aliq`, `DtIni`, `DtFim`) — a lib
 * normaliza para camelCase.
 */
export interface Aliquota {
  readonly incidencia?: string;
  /** Alíquota em % (ex: `2.5` = 2,5%). */
  readonly aliquota?: number;
  readonly dataInicio: Date;
  readonly dataFim?: Date;
}

/** Serviço vinculado a um benefício. */
export interface BeneficioServico {
  readonly codigoServico?: string;
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
}

/** Inscrição (CNPJ/CPF/...) beneficiada por um regime. */
export interface BeneficioInscricao {
  readonly tipoInscricao: TipoInscricaoBeneficio;
  readonly inscricao?: string;
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
}

/** Benefício municipal (redução de BC, alíquota diferenciada, imunidade, etc.). */
export interface Beneficio {
  readonly codigoBeneficio?: string;
  readonly descricao?: string;
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
  /** Tipo do benefício (per enum existente `TipoBeneficioMunicipal`). */
  readonly tipoBeneficio: string;
  readonly tipoReducaoBC?: TipoReducaoBaseDeCalculo;
  readonly reducaoPercentualBC?: number;
  readonly aliquotaDiferenciada?: number;
  readonly restritoAoMunicipio?: boolean;
  readonly servicos: readonly BeneficioServico[];
  readonly contribuintes: readonly BeneficioInscricao[];
}

/** Parâmetros de configuração do convênio do município com a Sefin Nacional. */
export interface ParametrosConvenio {
  readonly tipoConvenio: TipoConvenio;
  readonly aderenteAmbienteNacional: TipoSimNao;
  readonly aderenteEmissorNacional: TipoSimNao;
  readonly situacaoEmissaoPadraoContribuintesRFB: TipoSituacaoEmissaoPadraoContribuintesRFB;
  readonly aderenteMAN: TipoSimNao;
  readonly permiteAproveitamentoDeCreditos?: boolean;
}

/** Regime especial de tributação ativo em um município + serviço + competência. */
export interface RegimeEspecial {
  readonly situacao: TipoConfiguracaoRegimeEspecial;
  readonly dataInicio: Date;
  readonly dataFim?: Date;
  readonly observacoes?: string;
}

export interface RetencaoArtigoSexto {
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
}

export interface RetencoesArtigoSexto {
  readonly habilitado: boolean;
  readonly historico: readonly RetencaoArtigoSexto[];
}

export interface RetencaoMunicipalServico {
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
}

export interface RetencaoMunicipalPorCodigoServico {
  readonly codigoCompleto?: string;
  readonly historico: readonly RetencaoMunicipalServico[];
}

export interface RetencaoMunicipal {
  readonly descricao?: string;
  readonly dataInicioVigencia: Date;
  readonly dataFimVigencia?: Date;
  readonly tiposRetencao: readonly TipoRetencaoISSQN[];
  readonly servicos: readonly RetencaoMunicipalPorCodigoServico[];
}

/** Configuração agregada de retenções para um município. */
export interface Retencoes {
  readonly artigoSexto: RetencoesArtigoSexto;
  readonly retencoesMunicipais: readonly RetencaoMunicipal[];
}

// ---------------------------------------------------------------------------
// Result wrappers expostos na API pública
// ---------------------------------------------------------------------------

export interface ConsultaAliquotasResult {
  /** Mensagem opcional — populada quando a Receita tem info adicional ou o
   *  lookup não encontrou dados (status 400/404 com corpo). */
  readonly mensagem?: string;
  /**
   * Mapa `cTribNac → Aliquota[]`. O ADN retorna como objeto com chaves de
   * código de serviço, cada chave apontando para um histórico de alíquotas.
   */
  readonly aliquotas: Readonly<Record<string, readonly Aliquota[]>>;
}

export interface ConsultaBeneficioResult {
  readonly mensagem?: string;
  readonly beneficio?: Beneficio;
}

export interface ConsultaConvenioResult {
  readonly mensagem?: string;
  readonly parametrosConvenio?: ParametrosConvenio;
}

export interface ConsultaRegimesEspeciaisResult {
  readonly mensagem?: string;
  /**
   * Estrutura aninhada: `regime → variante → RegimeEspecial[]`. Codificação
   * preservada do ADN.
   */
  readonly regimesEspeciais: Readonly<
    Record<string, Readonly<Record<string, readonly RegimeEspecial[]>>>
  >;
}

export interface ConsultaRetencoesResult {
  readonly mensagem?: string;
  readonly retencoes?: Retencoes;
}
