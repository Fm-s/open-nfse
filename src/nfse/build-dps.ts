import type {
  DPS,
  Endereco,
  IdentificadorPessoa,
  InfDPS,
  InfoPessoa,
  InfoPrestador,
  RegTrib,
  Serv,
  TribMunicipal,
  TribTotal,
  VServPrest,
} from './domain.js';
import { buildDpsId } from './dps-id.js';
import type {
  IndicadorTotalTributos,
  OpcaoSimplesNacional,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
  TipoRetISSQN,
  TipoTribISSQN,
} from './enums.js';

/** Regime tributário do emitente. Casa com os grupos do `TCRegTrib`. */
export interface RegimeTributario {
  readonly opSimpNac: OpcaoSimplesNacional;
  readonly regEspTrib: RegimeEspecialTributacao;
  /** Obrigatório quando `opSimpNac === MeEpp`. */
  readonly regApTribSN?: RegimeApuracaoSimplesNacional;
}

/** Endereço nacional na forma ergonômica aceita pelo builder. */
export interface EnderecoBr {
  /** Código IBGE do município (7 dígitos). */
  readonly codMunicipio: string;
  /** CEP (8 dígitos sem máscara). */
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly bairro: string;
  readonly complemento?: string;
}

/** Identificação do emitente prestador. */
export interface EmitenteInput {
  readonly cnpj: string;
  /** Código IBGE do município emissor (7 dígitos). */
  readonly codMunicipio: string;
  readonly inscricaoMunicipal?: string;
  readonly nome?: string;
  readonly regime: RegimeTributario;
  readonly endereco?: EnderecoBr;
  readonly email?: string;
  readonly fone?: string;
}

/** Identificação do tomador. */
export interface TomadorInput {
  readonly documento: { readonly CNPJ: string } | { readonly CPF: string };
  readonly nome: string;
  readonly inscricaoMunicipal?: string;
  readonly email?: string;
  readonly fone?: string;
  readonly endereco?: EnderecoBr;
}

/** Descrição do serviço. */
export interface ServicoInput {
  /** Código nacional do serviço (LC 116 + Anexo). */
  readonly cTribNac: string;
  /** Código NBS do serviço (required pelo XSD). */
  readonly cNBS: string;
  readonly descricao: string;
  /** Default: `emitente.codMunicipio`. */
  readonly codMunicipioPrestacao?: string;
  readonly cTribMun?: string;
  /** Código interno do contribuinte para essa linha de serviço. */
  readonly codigoInterno?: string;
}

/** Valores e tributação do serviço. */
export interface ValoresInput {
  readonly vServ: number;
  readonly vReceb?: number;
  /**
   * Alíquota ISS em % (ex: `2.5` = 2,5%). Preenche `tribMun.pAliq`.
   * Omita quando a nota é imune/isenta ou quando o ISSQN é retido pelo tomador.
   */
  readonly aliqIss?: number;
  /** Default `'1'` (operação tributável). */
  readonly tribISSQN?: TipoTribISSQN;
  /** Default `'1'` (sem retenção). */
  readonly tpRetISSQN?: TipoRetISSQN;
  /** Default `'0'` (não informado). */
  readonly indTotTrib?: IndicadorTotalTributos;
}

export interface BuildDpsParams {
  readonly emitente: EmitenteInput;
  readonly serie: string;
  readonly nDPS: string;
  /** Default `'2'` (Homologação). */
  readonly tpAmb?: TipoAmbienteDps;
  /** Default `new Date()`. */
  readonly dhEmi?: Date;
  /** Default `new Date()` truncada em UTC. */
  readonly dCompet?: Date;
  /** Versão do aplicativo emissor. Default `'open-nfse/0.2'`. */
  readonly verAplic?: string;
  readonly servico: ServicoInput;
  readonly valores: ValoresInput;
  readonly tomador?: TomadorInput;
}

const DEFAULT_VER_APLIC = 'open-nfse/0.2';
const DEFAULT_TP_AMB: TipoAmbienteDps = '2' as TipoAmbienteDps;
const TP_EMIT_PRESTADOR = '1' as InfDPS['tpEmit'];
const DEFAULT_TRIB_ISSQN: TipoTribISSQN = '1' as TipoTribISSQN;
const DEFAULT_TP_RET_ISSQN: TipoRetISSQN = '1' as TipoRetISSQN;
const DEFAULT_IND_TOT_TRIB: IndicadorTotalTributos = '0' as IndicadorTotalTributos;

/**
 * Constrói uma `DPS` completa a partir de um subconjunto ergonômico de campos.
 * Cobre o caso comum (prestador brasileiro, serviço único, tomador BR opcional)
 * preenchendo todo o boilerplate do layout RTC v1.01.
 *
 * Para cenários avançados — exterior, obra, atvEvento, dedução/redução, IBSCBS —
 * construa `InfDPS` manualmente (todos os tipos da RTC estão exportados).
 */
export function buildDps(params: BuildDpsParams): DPS {
  const dhEmi = params.dhEmi ?? new Date();
  const dCompet = params.dCompet ?? new Date();
  const tpAmb = params.tpAmb ?? DEFAULT_TP_AMB;

  const Id = buildDpsId({
    cLocEmi: params.emitente.codMunicipio,
    tipoInsc: 'CNPJ',
    inscricaoFederal: params.emitente.cnpj,
    serie: params.serie,
    nDPS: params.nDPS,
  });

  const prest = buildInfoPrestador(params.emitente);
  const serv = buildServ(params.servico, params.emitente.codMunicipio);
  const valores = buildInfoValores(params.valores);

  const infDPS: InfDPS = {
    Id,
    tpAmb,
    dhEmi,
    verAplic: params.verAplic ?? DEFAULT_VER_APLIC,
    serie: params.serie,
    nDPS: params.nDPS,
    dCompet,
    tpEmit: TP_EMIT_PRESTADOR,
    cLocEmi: params.emitente.codMunicipio,
    prest,
    ...(params.tomador ? { toma: buildInfoPessoa(params.tomador) } : {}),
    serv,
    valores,
  };

  return { versao: '1.01', infDPS };
}

// ---------------------------------------------------------------------------

function buildInfoPrestador(emit: EmitenteInput): InfoPrestador {
  const regTrib: RegTrib = {
    opSimpNac: emit.regime.opSimpNac,
    ...(emit.regime.regApTribSN !== undefined ? { regApTribSN: emit.regime.regApTribSN } : {}),
    regEspTrib: emit.regime.regEspTrib,
  };
  return {
    identificador: { CNPJ: emit.cnpj },
    ...(emit.inscricaoMunicipal ? { IM: emit.inscricaoMunicipal } : {}),
    ...(emit.nome ? { xNome: emit.nome } : {}),
    ...(emit.endereco ? { end: toEndereco(emit.endereco) } : {}),
    ...(emit.fone ? { fone: emit.fone } : {}),
    ...(emit.email ? { email: emit.email } : {}),
    regTrib,
  };
}

function buildInfoPessoa(tomador: TomadorInput): InfoPessoa {
  const identificador: IdentificadorPessoa =
    'CNPJ' in tomador.documento ? { CNPJ: tomador.documento.CNPJ } : { CPF: tomador.documento.CPF };
  return {
    identificador,
    ...(tomador.inscricaoMunicipal ? { IM: tomador.inscricaoMunicipal } : {}),
    xNome: tomador.nome,
    ...(tomador.endereco ? { end: toEndereco(tomador.endereco) } : {}),
    ...(tomador.fone ? { fone: tomador.fone } : {}),
    ...(tomador.email ? { email: tomador.email } : {}),
  };
}

function toEndereco(e: EnderecoBr): Endereco {
  return {
    localidade: { endNac: { cMun: e.codMunicipio, CEP: e.cep } },
    xLgr: e.logradouro,
    nro: e.numero,
    ...(e.complemento ? { xCpl: e.complemento } : {}),
    xBairro: e.bairro,
  };
}

function buildServ(serv: ServicoInput, cMunDefault: string): Serv {
  return {
    locPrest: { cLocPrestacao: serv.codMunicipioPrestacao ?? cMunDefault },
    cServ: {
      cTribNac: serv.cTribNac,
      ...(serv.cTribMun ? { cTribMun: serv.cTribMun } : {}),
      xDescServ: serv.descricao,
      cNBS: serv.cNBS,
      ...(serv.codigoInterno ? { cIntContrib: serv.codigoInterno } : {}),
    },
  };
}

function buildInfoValores(v: ValoresInput) {
  const vServPrest: VServPrest = {
    ...(v.vReceb !== undefined ? { vReceb: v.vReceb } : {}),
    vServ: v.vServ,
  };
  const tribMun: TribMunicipal = {
    tribISSQN: v.tribISSQN ?? DEFAULT_TRIB_ISSQN,
    tpRetISSQN: v.tpRetISSQN ?? DEFAULT_TP_RET_ISSQN,
    ...(v.aliqIss !== undefined ? { pAliq: v.aliqIss } : {}),
  };
  const totTrib: TribTotal = { indTotTrib: v.indTotTrib ?? DEFAULT_IND_TOT_TRIB };
  return {
    vServPrest,
    trib: { tribMun, totTrib },
  };
}
