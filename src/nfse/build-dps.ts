import { RuleViolationError } from '../errors/validation.js';
import { DEFAULT_VER_APLIC } from '../version.js';
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
import { OpcaoSimplesNacional } from './enums.js';
import type {
  IndicadorTotalTributos,
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

/**
 * Identificação do emitente prestador.
 *
 * `xNome` (nome/razão social) e endereço **não** são aceitos aqui de propósito:
 * `buildDps` sempre usa `tpEmit='1'` (prestador é o próprio emitente), e a SEFIN
 * rejeita esses campos no bloco `prest` nesse cenário — eles são preenchidos a
 * partir do cadastro do CNPJ. Os mesmos dados aparecem no `NFSe` retornado.
 */
export interface EmitenteInput {
  readonly cnpj: string;
  /** Código IBGE do município emissor (7 dígitos). */
  readonly codMunicipio: string;
  readonly inscricaoMunicipal?: string;
  readonly regime: RegimeTributario;
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
   * Alíquota ISS em **percentual** (ex: `2.5` = 2,5%, NÃO `0.025`). Preenche
   * `tribMun.pAliq`. Omita para imune/isenta, retido pelo tomador, ou Simples
   * Nacional sem `pAliq` específica do município. Valores `0 < x < 0.5` são
   * rejeitados em tempo de build (quase sempre erro de fração-vs-percentual).
   */
  readonly aliqIss?: number;
  /** Default `'1'` (operação tributável). */
  readonly tribISSQN?: TipoTribISSQN;
  /** Default `'1'` (sem retenção). */
  readonly tpRetISSQN?: TipoRetISSQN;
  /** Default `'0'` (não informado). Ignorado se `pTotTribSN` for fornecido. */
  readonly indTotTrib?: IndicadorTotalTributos;
  /** Alíquota aproximada do Simples Nacional (%). Quando fornecido, prevalece sobre `indTotTrib`. */
  readonly pTotTribSN?: number;
}

export interface BuildDpsParams {
  readonly emitente: EmitenteInput;
  readonly serie: string;
  /**
   * Identificador sequencial da DPS na série, como string. **Não preencher com
   * zeros à esquerda** — o `Id` da DPS é composto a partir da string passada
   * aqui, então `'1'` e `'00001'` produzem `Id`s diferentes mesmo representando
   * o mesmo número. O `DpsCounter` (acionado por `NfseClient.emitir`) já segue
   * a convenção sem padding.
   */
  readonly nDPS: string;
  /** Default `'2'` (Homologação). */
  readonly tpAmb?: TipoAmbienteDps;
  /** Default `new Date()`. */
  readonly dhEmi?: Date;
  /**
   * Competência (mês/ano) da prestação do serviço. Default `new Date()` (hoje).
   * Para notas com competência retroativa (ex.: serviço prestado no mês anterior)
   * informe explicitamente — o default não deduz nada de `dhEmi`.
   */
  readonly dCompet?: Date;
  /** Versão do aplicativo emissor. Default `open-nfse/<VERSÃO_ATUAL>`. */
  readonly verAplic?: string;
  readonly servico: ServicoInput;
  readonly valores: ValoresInput;
  readonly tomador?: TomadorInput;
}
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
  assertSimplesNacionalConsistency(params.emitente.regime);
  assertAliqIssRange(params.valores.aliqIss);

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

  const verAplic = params.verAplic ?? DEFAULT_VER_APLIC;
  assertVerAplicLength(verAplic);

  const infDPS: InfDPS = {
    Id,
    tpAmb,
    dhEmi,
    verAplic,
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
  // tpEmit='1' (prestador é o emitente): SEFIN preenche xNome e endereço a
  // partir do cadastro do CNPJ e rejeita o envio desses campos. buildDps sempre
  // usa tpEmit='1', então `xNome` e `end` ficam de fora — e `EmitenteInput` não
  // os expõe pra falhar em tempo de compilação.
  return {
    identificador: { CNPJ: emit.cnpj },
    ...(emit.inscricaoMunicipal ? { IM: emit.inscricaoMunicipal } : {}),
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
  const totTrib: TribTotal =
    v.pTotTribSN !== undefined
      ? { pTotTribSN: v.pTotTribSN }
      : { indTotTrib: v.indTotTrib ?? DEFAULT_IND_TOT_TRIB };
  return {
    vServPrest,
    trib: { tribMun, totTrib },
  };
}

/**
 * `regApTribSN` é obrigatório quando `opSimpNac=MeEpp` ('3') per TCRegTrib do
 * RTC v1.01 — XSD não enforça, então a SEFIN rejeita após round-trip. Fail-fast
 * local para virar erro de tempo de build em vez de rejeição.
 */
function assertSimplesNacionalConsistency(regime: RegimeTributario): void {
  if (regime.opSimpNac === OpcaoSimplesNacional.MeEpp && regime.regApTribSN === undefined) {
    throw new RuleViolationError(
      `regApTribSN é obrigatório quando opSimpNac=MeEpp ('3') — per TCRegTrib do RTC v1.01`,
      'TCRegTrib',
    );
  }
}

/**
 * `aliqIss` é em percentual (ex: `2.5` = 2,5%). Valores `0 < x < 0.5` são quase
 * sempre erro de fração-vs-percentual (ex: `0.025` em vez de `2.5`): o formatter
 * faria `(0.025).toFixed(2) === '0.03'` e a SEFIN aceitaria a nota com **0,03%**
 * em vez dos 2,5% pretendidos. ISS por LC 116 nunca é abaixo de 2%; o limite de
 * 0.5 é generoso pra regimes especiais e ainda pega a confusão de unidade.
 */
function assertAliqIssRange(aliqIss: number | undefined): void {
  if (aliqIss === undefined || aliqIss === 0) return;
  if (aliqIss > 0 && aliqIss < 0.5) {
    const asPercent = aliqIss * 100;
    throw new RuleViolationError(
      `aliqIss=${aliqIss} parece ser uma fração, não um percentual. Para emitir alíquota de ${asPercent}%, passe aliqIss=${asPercent}. Se a alíquota é realmente abaixo de 0,5%, construa InfDPS manualmente.`,
      'aliqIss',
    );
  }
}

/** `TSVerAplic` limita verAplic a maxLength=20. Fail-fast local. */
function assertVerAplicLength(verAplic: string): void {
  if (verAplic.length < 1 || verAplic.length > 20) {
    throw new RuleViolationError(
      `verAplic deve ter entre 1 e 20 caracteres (atual: ${verAplic.length}) — per TSVerAplic do RTC v1.01`,
      'TSVerAplic',
    );
  }
}
