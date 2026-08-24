import { RuleViolationError } from '../errors/validation.js';
import { validateCnpj, validateCpf } from '../fiscal/validate-cpf-cnpj.js';
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
import type {
  IndicadorTotalTributos,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
} from './enums.js';
import { OpcaoSimplesNacional, TipoRetISSQN, TipoTribISSQN } from './enums.js';

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
  /**
   * Código NBS do serviço. Opcional — apesar da NT04 declarar o elemento sem
   * `minOccurs`, a SEFIN não rejeita DPS sem `cNBS`. Quando omitido, o
   * `<cNBS>` não é serializado.
   */
  readonly cNBS?: string;
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
  /**
   * **Não use com `buildDps`.** `buildDps` sempre emite `tpEmit=1` (prestador é o
   * emitente), e `vReceb` só é válido com `tpEmit=3` (intermediário) — informá-lo
   * lança `RuleViolationError` (E0424). Para o cenário de intermediário, construa
   * `InfDPS` manualmente.
   */
  readonly vReceb?: number;
  /**
   * Alíquota ISS em **percentual** (ex: `2.5` = 2,5%, NÃO `0.025`). Preenche
   * `tribMun.pAliq` (`TCTribMunicipal`, `minOccurs="0"`). Pelo XSD: se o
   * município de incidência pertence ao Sistema Nacional NFS-e a alíquota é
   * parametrizada e fornecida pelo sistema — nesse caso omita (`undefined`);
   * fora do Sistema Nacional, o emitente fornece. Valores `0 < x < 0.5` são
   * rejeitados em tempo de build (quase sempre erro de fração-vs-percentual).
   *
   * Em termos de serialização: `undefined` não emite `<pAliq>`; um valor
   * definido (inclusive `0`) emite `<pAliq>` com aquele valor.
   */
  readonly aliqIss?: number;
  /** Default `'1'` (operação tributável). */
  readonly tribISSQN?: TipoTribISSQN;
  /** Default `'1'` (sem retenção). */
  readonly tpRetISSQN?: TipoRetISSQN;
  /**
   * Indicador de "sem total de tributos" (`'0'`) do choice `totTrib`. **Válido
   * apenas para MEI** (`opSimpNac=2`): Não Optante e ME/EPP não podem informá-lo
   * (E0713/E0712). Para MEI sem nenhum membro de `totTrib`, este é o default.
   */
  readonly indTotTrib?: IndicadorTotalTributos;
  /**
   * Alíquota aproximada do Simples Nacional (%) — choice `totTrib`. **Válido
   * apenas para ME/EPP** (`opSimpNac=3`): MEI (E0710) e Não Optante (E0713) não
   * podem informá-lo.
   */
  readonly pTotTribSN?: number;
  /**
   * Total aproximado de tributos em **valor** (Lei da Transparência / IBPT) —
   * choice `totTrib`. Válido para qualquer regime; é o membro a usar para **Não
   * Optante** (junto de `pTotTrib`), que não pode usar `indTotTrib`/`pTotTribSN`.
   */
  readonly vTotTrib?: {
    readonly vTotTribFed: number;
    readonly vTotTribEst: number;
    readonly vTotTribMun: number;
  };
  /**
   * Total aproximado de tributos em **percentual** — choice `totTrib`. Válido
   * para qualquer regime (alternativa a `vTotTrib` para Não Optante).
   */
  readonly pTotTrib?: {
    readonly pTotTribFed: number;
    readonly pTotTribEst: number;
    readonly pTotTribMun: number;
  };
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
  /**
   * Pula a validação de dígito verificador de CPF/CNPJ (emitente + tomador).
   * Default `false`. `emitir` repassa esta opção para cá, então o escape hatch
   * documentado continua funcionando no caminho seguro.
   */
  readonly skipCpfCnpjValidation?: boolean;
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
  assertValoresConsistency(params.valores, params.emitente.regime);
  // E0532 — o serviço 99.01.01 não tem incidência de ISSQN: exige tribISSQN=4.
  if (
    params.servico.cTribNac === '990101' &&
    (params.valores.tribISSQN ?? DEFAULT_TRIB_ISSQN) !== TipoTribISSQN.NaoIncidencia
  ) {
    throw new RuleViolationError(
      "o serviço 99.01.01 não tem incidência de ISSQN: tribISSQN deve ser '4' (Não Incidência) — per E0532",
      'E0532',
    );
  }
  if (!params.skipCpfCnpjValidation) {
    assertIdentifiersDv(params);
  }

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
  const valores = buildInfoValores(params.valores, params.emitente.regime.opSimpNac);

  const verAplic = params.verAplic ?? DEFAULT_VER_APLIC;
  assertVerAplic(verAplic);

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
  const cLocPrestacao = serv.codMunicipioPrestacao ?? cMunDefault;
  // E0315 — '000' não é código de tributação municipal válido (passa no XSD).
  if (serv.cTribMun === '000') {
    throw new RuleViolationError(
      "cTribMun não pode ser '000' — informe o código de tributação municipal real — per E0315",
      'E0315',
    );
  }
  // E1402 — subitem 200101 não admite cLocPrestacao '0000000' (Águas Marítimas).
  if (serv.cTribNac === '200101' && cLocPrestacao === '0000000') {
    throw new RuleViolationError(
      "cTribNac=200101 não admite cLocPrestacao='0000000' (Águas Marítimas) — per E1402",
      'E1402',
    );
  }
  return {
    locPrest: { cLocPrestacao },
    cServ: {
      cTribNac: serv.cTribNac,
      ...(serv.cTribMun ? { cTribMun: serv.cTribMun } : {}),
      xDescServ: serv.descricao,
      ...(serv.cNBS ? { cNBS: serv.cNBS } : {}),
      ...(serv.codigoInterno ? { cIntContrib: serv.codigoInterno } : {}),
    },
  };
}

function buildInfoValores(v: ValoresInput, opSimpNac: OpcaoSimplesNacional) {
  // vReceb não é serializado: assertValoresConsistency já rejeita vReceb !== undefined
  // (E0424 — buildDps usa tpEmit=1).
  const vServPrest: VServPrest = {
    vServ: v.vServ,
  };
  const tribMun: TribMunicipal = {
    tribISSQN: v.tribISSQN ?? DEFAULT_TRIB_ISSQN,
    tpRetISSQN: v.tpRetISSQN ?? DEFAULT_TP_RET_ISSQN,
    ...(v.aliqIss !== undefined ? { pAliq: v.aliqIss } : {}),
  };
  return {
    vServPrest,
    trib: { tribMun, totTrib: buildTotTrib(v, opSimpNac) },
  };
}

/**
 * Seleciona o membro do choice `totTrib` conforme a situação do emitente perante
 * o Simples Nacional (`opSimpNac`), aplicando E0710/E0712/E0713. `vTotTrib` e
 * `pTotTrib` (Lei da Transparência / IBPT) valem para qualquer regime; o
 * default — quando nada é informado — só existe para MEI (`indTotTrib='0'`).
 * Não Optante e ME/EPP exigem um membro explícito, senão lança fail-fast em vez
 * de produzir uma DPS que a SEFIN rejeitaria.
 */
function buildTotTrib(v: ValoresInput, opSimpNac: OpcaoSimplesNacional): TribTotal {
  if (v.vTotTrib) return { vTotTrib: v.vTotTrib };
  if (v.pTotTrib) return { pTotTrib: v.pTotTrib };
  if (v.pTotTribSN !== undefined) {
    if (opSimpNac === OpcaoSimplesNacional.Mei) {
      throw new RuleViolationError(
        'pTotTribSN não pode ser informado para MEI — per E0710',
        'E0710',
      );
    }
    if (opSimpNac === OpcaoSimplesNacional.NaoOptante) {
      throw new RuleViolationError(
        'pTotTribSN não pode ser informado para Não Optante (use vTotTrib/pTotTrib) — per E0713',
        'E0713',
      );
    }
    return { pTotTribSN: v.pTotTribSN };
  }
  if (v.indTotTrib !== undefined) {
    if (opSimpNac === OpcaoSimplesNacional.MeEpp) {
      throw new RuleViolationError(
        'indTotTrib não pode ser informado para ME/EPP (use pTotTribSN) — per E0712',
        'E0712',
      );
    }
    if (opSimpNac === OpcaoSimplesNacional.NaoOptante) {
      throw new RuleViolationError(
        'indTotTrib não pode ser informado para Não Optante (use vTotTrib/pTotTrib) — per E0713',
        'E0713',
      );
    }
    return { indTotTrib: v.indTotTrib };
  }
  // Nenhum membro informado → default por regime.
  if (opSimpNac === OpcaoSimplesNacional.Mei) {
    return { indTotTrib: DEFAULT_IND_TOT_TRIB };
  }
  if (opSimpNac === OpcaoSimplesNacional.MeEpp) {
    throw new RuleViolationError(
      'ME/EPP exige um total de tributos: informe pTotTribSN (ou vTotTrib/pTotTrib) — per E0712',
      'E0712',
    );
  }
  throw new RuleViolationError(
    'Não Optante exige um total de tributos: informe vTotTrib ou pTotTrib — per E0713',
    'E0713',
  );
}

/**
 * `regApTribSN` é obrigatório quando `opSimpNac=MeEpp` ('3') per TCRegTrib do
 * RTC v1.01 — XSD não enforça, então a SEFIN rejeita após round-trip. Fail-fast
 * local para virar erro de tempo de build em vez de rejeição.
 */
/**
 * Valida o DV de CPF/CNPJ do emitente e do tomador (E0080/E0096/E0188/E0206) no
 * próprio builder, para que o caminho offline `buildDps` + `buildDpsXml`
 * (dry-run/preview, design principle #5) também rejeite DV inválido — não só o
 * `emitSeguro`. O XSD valida apenas o formato (14 chars alfanuméricos no
 * TSCNPJ do bundle 20260727), não o DV.
 */
function assertIdentifiersDv(params: BuildDpsParams): void {
  validateCnpj(params.emitente.cnpj);
  if (params.tomador) {
    const doc = params.tomador.documento;
    if ('CNPJ' in doc) validateCnpj(doc.CNPJ);
    else validateCpf(doc.CPF);
  }
}

function assertSimplesNacionalConsistency(regime: RegimeTributario): void {
  if (regime.opSimpNac === OpcaoSimplesNacional.MeEpp && regime.regApTribSN === undefined) {
    throw new RuleViolationError(
      `regApTribSN é obrigatório quando opSimpNac=MeEpp ('3') — per TCRegTrib do RTC v1.01 (E0166)`,
      'E0166',
    );
  }
  // E0162 — regApTribSN só se aplica a ME/EPP; Não Optante e MEI não podem informá-lo.
  if (
    regime.regApTribSN !== undefined &&
    (regime.opSimpNac === OpcaoSimplesNacional.NaoOptante ||
      regime.opSimpNac === OpcaoSimplesNacional.Mei)
  ) {
    throw new RuleViolationError(
      `regApTribSN não pode ser informado quando opSimpNac=${regime.opSimpNac} (Não Optante/MEI) — per E0162`,
      'E0162',
    );
  }
}

/**
 * Consistência intra-DPS entre regime, alíquota e tributação do ISSQN — regras
 * de rejeição fechadas (sem consulta externa), checáveis no build:
 * - E0600: MEI (opSimpNac=2) não pode informar `aliqIss`.
 * - E0602: `aliqIss` não pode ser informada com `tribISSQN` 2/3/4 (imune/exportação/não-incidência).
 * - E0580: não pode haver retenção (`tpRetISSQN` 2/3) com `tribISSQN` 2/3/4.
 */
function assertValoresConsistency(v: ValoresInput, regime: RegimeTributario): void {
  // E0424 — vReceb só é válido com tpEmit=3 (intermediário); buildDps sempre usa
  // tpEmit=1 (prestador é o emitente), então vReceb aqui é rejeição garantida.
  if (v.vReceb !== undefined) {
    throw new RuleViolationError(
      'vReceb não pode ser informado: buildDps usa tpEmit=1 (prestador é o emitente). vReceb só vale com tpEmit=3 (intermediário) — para esse cenário construa InfDPS manualmente — per E0424',
      'E0424',
    );
  }
  const tribISSQN = v.tribISSQN ?? DEFAULT_TRIB_ISSQN;
  const tpRet = v.tpRetISSQN ?? DEFAULT_TP_RET_ISSQN;
  const naoTributavel =
    tribISSQN === TipoTribISSQN.Imunidade ||
    tribISSQN === TipoTribISSQN.ExportacaoServico ||
    tribISSQN === TipoTribISSQN.NaoIncidencia;

  if (regime.opSimpNac === OpcaoSimplesNacional.Mei && v.aliqIss !== undefined) {
    throw new RuleViolationError(
      'aliqIss não pode ser informada quando o prestador é MEI (opSimpNac=2) — per E0600',
      'E0600',
    );
  }
  if (naoTributavel && v.aliqIss !== undefined) {
    throw new RuleViolationError(
      `aliqIss não pode ser informada quando tribISSQN=${tribISSQN} (imune/exportação/não-incidência) — per E0602`,
      'E0602',
    );
  }
  if (
    naoTributavel &&
    (tpRet === TipoRetISSQN.RetidoPeloTomador || tpRet === TipoRetISSQN.RetidoPeloIntermediario)
  ) {
    throw new RuleViolationError(
      `tpRetISSQN não pode indicar retenção (2/3) quando tribISSQN=${tribISSQN} (imune/exportação/não-incidência) — per E0580`,
      'E0580',
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
  // E0595 — teto constitucional do ISSQN é 5%; acima disso a SEFIN rejeita.
  if (aliqIss > 5) {
    throw new RuleViolationError(
      `aliqIss=${aliqIss}% excede o teto de 5% do ISSQN — per E0595`,
      'E0595',
    );
  }
}

/**
 * `TSVerAplic` (base `TSString`): 1 a 20 caracteres, todos imprimíveis
 * (`[!-ÿ]`), sem espaço/controle nas pontas — pattern
 * `[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ]`. Fail-fast local em vez de rejeição XSD.
 */
const TSSTRING_PATTERN = /^(?:[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ])$/u;

function assertVerAplic(verAplic: string): void {
  if (verAplic.length < 1 || verAplic.length > 20) {
    throw new RuleViolationError(
      `verAplic deve ter entre 1 e 20 caracteres (atual: ${verAplic.length}) — per TSVerAplic do RTC v1.01`,
      'TSVerAplic',
    );
  }
  if (!TSSTRING_PATTERN.test(verAplic)) {
    throw new RuleViolationError(
      'verAplic deve conter apenas caracteres imprimíveis, sem espaço ou controle nas pontas — per TSString do RTC v1.01',
      'TSVerAplic',
    );
  }
}
