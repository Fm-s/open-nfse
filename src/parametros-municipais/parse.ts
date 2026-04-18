import type {
  Aliquota,
  Beneficio,
  BeneficioInscricao,
  BeneficioServico,
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
  ParametrosConvenio,
  RegimeEspecial,
  RetencaoArtigoSexto,
  RetencaoMunicipal,
  RetencaoMunicipalPorCodigoServico,
  RetencaoMunicipalServico,
  Retencoes,
  RetencoesArtigoSexto,
  TipoConfiguracaoRegimeEspecial,
  TipoConvenio,
  TipoInscricaoBeneficio,
  TipoReducaoBaseDeCalculo,
  TipoRetencaoISSQN,
  TipoSimNao,
  TipoSituacaoEmissaoPadraoContribuintesRFB,
} from './types.js';

// ---------- Aliquota (único tipo com PascalCase no wire) ----------

interface RawAliquota {
  readonly Incidencia?: string | null;
  readonly Aliq?: number | null;
  readonly DtIni: string;
  readonly DtFim?: string | null;
}

interface RawResultadoConsultaAliquotas {
  readonly mensagem?: string | null;
  readonly aliquotas?: Record<string, RawAliquota[] | null> | null;
}

export function parseAliquotasResult(raw: RawResultadoConsultaAliquotas): ConsultaAliquotasResult {
  const aliquotas: Record<string, readonly Aliquota[]> = {};
  for (const [key, list] of Object.entries(raw.aliquotas ?? {})) {
    if (!list) continue;
    aliquotas[key] = list.map(parseAliquota);
  }
  return {
    ...optional('mensagem', raw.mensagem ?? undefined),
    aliquotas,
  };
}

function parseAliquota(raw: RawAliquota): Aliquota {
  return {
    ...optional('incidencia', raw.Incidencia ?? undefined),
    ...optional('aliquota', raw.Aliq ?? undefined),
    dataInicio: new Date(raw.DtIni),
    ...(raw.DtFim ? { dataFim: new Date(raw.DtFim) } : {}),
  };
}

// ---------- Beneficio ----------

interface RawBeneficioServico {
  readonly codigoServico?: string | null;
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
}

interface RawBeneficioInscricao {
  readonly tipoInscricao: number;
  readonly inscricao?: string | null;
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
}

interface RawBeneficio {
  readonly codigoBeneficio?: string | null;
  readonly descricao?: string | null;
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
  readonly tipoBeneficio: number;
  readonly tipoReducaoBC?: number | null;
  readonly reducaoPercentualBC?: number | null;
  readonly aliquotaDiferenciada?: number | null;
  readonly restritoAoMunicipio?: boolean | null;
  readonly servicos?: RawBeneficioServico[] | null;
  readonly contribuintes?: RawBeneficioInscricao[] | null;
}

interface RawResultadoConsultaBeneficio {
  readonly mensagem?: string | null;
  readonly beneficio?: RawBeneficio | null;
}

export function parseBeneficioResult(raw: RawResultadoConsultaBeneficio): ConsultaBeneficioResult {
  return {
    ...optional('mensagem', raw.mensagem ?? undefined),
    ...(raw.beneficio ? { beneficio: parseBeneficio(raw.beneficio) } : {}),
  };
}

function parseBeneficio(raw: RawBeneficio): Beneficio {
  return {
    ...optional('codigoBeneficio', raw.codigoBeneficio ?? undefined),
    ...optional('descricao', raw.descricao ?? undefined),
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
    tipoBeneficio: String(raw.tipoBeneficio),
    ...(raw.tipoReducaoBC !== null && raw.tipoReducaoBC !== undefined
      ? { tipoReducaoBC: String(raw.tipoReducaoBC) as TipoReducaoBaseDeCalculo }
      : {}),
    ...optional('reducaoPercentualBC', raw.reducaoPercentualBC ?? undefined),
    ...optional('aliquotaDiferenciada', raw.aliquotaDiferenciada ?? undefined),
    ...optional('restritoAoMunicipio', raw.restritoAoMunicipio ?? undefined),
    servicos: (raw.servicos ?? []).map(parseBeneficioServico),
    contribuintes: (raw.contribuintes ?? []).map(parseBeneficioInscricao),
  };
}

function parseBeneficioServico(raw: RawBeneficioServico): BeneficioServico {
  return {
    ...optional('codigoServico', raw.codigoServico ?? undefined),
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
  };
}

function parseBeneficioInscricao(raw: RawBeneficioInscricao): BeneficioInscricao {
  return {
    tipoInscricao: String(raw.tipoInscricao) as TipoInscricaoBeneficio,
    ...optional('inscricao', raw.inscricao ?? undefined),
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
  };
}

// ---------- Convenio ----------

interface RawParametrosConvenio {
  readonly tipoConvenioDeserializationSetter: number;
  readonly aderenteAmbienteNacional: number;
  readonly aderenteEmissorNacional: number;
  readonly situacaoEmissaoPadraoContribuintesRFB: number;
  readonly aderenteMAN: number;
  readonly permiteAproveitametoDeCreditos?: boolean | null;
}

interface RawResultadoConsultaConvenio {
  readonly mensagem?: string | null;
  readonly parametrosConvenio?: RawParametrosConvenio | null;
}

export function parseConvenioResult(raw: RawResultadoConsultaConvenio): ConsultaConvenioResult {
  return {
    ...optional('mensagem', raw.mensagem ?? undefined),
    ...(raw.parametrosConvenio
      ? { parametrosConvenio: parseParametrosConvenio(raw.parametrosConvenio) }
      : {}),
  };
}

function parseParametrosConvenio(raw: RawParametrosConvenio): ParametrosConvenio {
  return {
    tipoConvenio: String(raw.tipoConvenioDeserializationSetter) as TipoConvenio,
    aderenteAmbienteNacional: String(raw.aderenteAmbienteNacional) as TipoSimNao,
    aderenteEmissorNacional: String(raw.aderenteEmissorNacional) as TipoSimNao,
    situacaoEmissaoPadraoContribuintesRFB: String(
      raw.situacaoEmissaoPadraoContribuintesRFB,
    ) as TipoSituacaoEmissaoPadraoContribuintesRFB,
    aderenteMAN: String(raw.aderenteMAN) as TipoSimNao,
    ...optional('permiteAproveitamentoDeCreditos', raw.permiteAproveitametoDeCreditos ?? undefined),
  };
}

// ---------- Regimes especiais ----------

interface RawRegimeEspecial {
  readonly situacao: number;
  readonly dataInicio: string;
  readonly dataFim?: string | null;
  readonly observacoes?: string | null;
}

interface RawResultadoConsultaRegimesEspeciais {
  readonly mensagem?: string | null;
  readonly regimesEspeciais?: Record<
    string,
    Record<string, RawRegimeEspecial[] | null> | null
  > | null;
}

export function parseRegimesEspeciaisResult(
  raw: RawResultadoConsultaRegimesEspeciais,
): ConsultaRegimesEspeciaisResult {
  const regimesEspeciais: Record<string, Record<string, readonly RegimeEspecial[]>> = {};
  for (const [regime, variantes] of Object.entries(raw.regimesEspeciais ?? {})) {
    if (!variantes) continue;
    const inner: Record<string, readonly RegimeEspecial[]> = {};
    for (const [variante, list] of Object.entries(variantes)) {
      if (!list) continue;
      inner[variante] = list.map(parseRegimeEspecial);
    }
    regimesEspeciais[regime] = inner;
  }
  return {
    ...optional('mensagem', raw.mensagem ?? undefined),
    regimesEspeciais,
  };
}

function parseRegimeEspecial(raw: RawRegimeEspecial): RegimeEspecial {
  return {
    situacao: String(raw.situacao) as TipoConfiguracaoRegimeEspecial,
    dataInicio: new Date(raw.dataInicio),
    ...(raw.dataFim ? { dataFim: new Date(raw.dataFim) } : {}),
    ...optional('observacoes', raw.observacoes ?? undefined),
  };
}

// ---------- Retencoes ----------

interface RawRetencaoArtigoSexto {
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
}

interface RawRetencoesArtigoSexto {
  readonly habilitado: boolean;
  readonly historico?: RawRetencaoArtigoSexto[] | null;
}

interface RawRetencaoMunicipalServico {
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
}

interface RawRetencaoMunicipalPorCodigoServico {
  readonly codigoCompleto?: string | null;
  readonly historico?: RawRetencaoMunicipalServico[] | null;
}

interface RawRetencaoMunicipal {
  readonly descricao?: string | null;
  readonly dataInicioVigencia: string;
  readonly dataFimVigencia?: string | null;
  readonly tiposRetencao?: number[] | null;
  readonly servicos?: RawRetencaoMunicipalPorCodigoServico[] | null;
}

interface RawRetencoes {
  readonly artigoSexto?: RawRetencoesArtigoSexto | null;
  readonly retencoesMunicipais?: RawRetencaoMunicipal[] | null;
}

interface RawResultadoConsultaRetencoes {
  readonly mensagem?: string | null;
  readonly retencoes?: RawRetencoes | null;
}

export function parseRetencoesResult(raw: RawResultadoConsultaRetencoes): ConsultaRetencoesResult {
  return {
    ...optional('mensagem', raw.mensagem ?? undefined),
    ...(raw.retencoes ? { retencoes: parseRetencoes(raw.retencoes) } : {}),
  };
}

function parseRetencoes(raw: RawRetencoes): Retencoes {
  const artigoSexto: RetencoesArtigoSexto = raw.artigoSexto
    ? {
        habilitado: raw.artigoSexto.habilitado,
        historico: (raw.artigoSexto.historico ?? []).map(parseRetencaoArtigoSexto),
      }
    : { habilitado: false, historico: [] };
  return {
    artigoSexto,
    retencoesMunicipais: (raw.retencoesMunicipais ?? []).map(parseRetencaoMunicipal),
  };
}

function parseRetencaoArtigoSexto(raw: RawRetencaoArtigoSexto): RetencaoArtigoSexto {
  return {
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
  };
}

function parseRetencaoMunicipal(raw: RawRetencaoMunicipal): RetencaoMunicipal {
  return {
    ...optional('descricao', raw.descricao ?? undefined),
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
    tiposRetencao: (raw.tiposRetencao ?? []).map((n) => String(n) as TipoRetencaoISSQN),
    servicos: (raw.servicos ?? []).map(parseRetencaoMunicipalPorCodigoServico),
  };
}

function parseRetencaoMunicipalPorCodigoServico(
  raw: RawRetencaoMunicipalPorCodigoServico,
): RetencaoMunicipalPorCodigoServico {
  return {
    ...optional('codigoCompleto', raw.codigoCompleto ?? undefined),
    historico: (raw.historico ?? []).map(parseRetencaoMunicipalServico),
  };
}

function parseRetencaoMunicipalServico(raw: RawRetencaoMunicipalServico): RetencaoMunicipalServico {
  return {
    dataInicioVigencia: new Date(raw.dataInicioVigencia),
    ...(raw.dataFimVigencia ? { dataFimVigencia: new Date(raw.dataFimVigencia) } : {}),
  };
}

// ---------- small helper ----------

function optional<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
  return value === undefined
    ? ({} as { readonly [P in K]?: V })
    : ({ [key]: value } as { readonly [P in K]: V });
}

// ---------- Raw types exports (for tests) ----------

export type {
  RawResultadoConsultaAliquotas,
  RawResultadoConsultaBeneficio,
  RawResultadoConsultaConvenio,
  RawResultadoConsultaRegimesEspeciais,
  RawResultadoConsultaRetencoes,
};
