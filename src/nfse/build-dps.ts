import { LayoutMismatchError, RuleViolationError } from '../errors/validation.js';
import { validateCnpj, validateCpf } from '../fiscal/validate-cpf-cnpj.js';
import { DEFAULT_VER_APLIC } from '../version.js';
import { formatDate, formatDecimal } from './build-xml.js';
import type {
  DocAjusteBCNt009,
  DPS,
  DpsNt004,
  DpsNt009,
  Endereco,
  IdentificadorPessoa,
  InfDPSNt004,
  InfDPSNt009,
  InfoAjusteBCNt009,
  InfoPessoaNt004,
  InfoPrestador,
  RegTrib,
  RtcDocumentoReferenciado,
  RtcInfoDest,
  RtcInfoIbsCbsNt009,
  RtcInfoImovelNt009,
  RtcInfoTribIbsCbsNt009,
  RtcUnidadeImobiliariaNt009,
  Serv,
  TribMunicipal,
  TribTotal,
  VDescCondIncond,
  VServPrest,
} from './domain.js';
import { buildDpsId } from './dps-id.js';
import type {
  IndicadorFinal,
  IndicadorTotalTributos,
  RegimeApuracaoSimplesNacional,
  TipoAmbienteDps,
  TipoEnteGovernamental,
} from './enums.js';
import {
  FinalidadeNFSe,
  IndicadorDestinatario,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBCLocImoveisNt009,
  TipoAjusteBCNt009,
  TipoChaveDFe,
  TipoOperacao,
  TipoRetISSQN,
  TipoTribISSQN,
} from './enums.js';
import { assertLayout, type Layout, unknownLayout } from './layout.js';

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
   * Código NBS do serviço. Opcional no XSD (`minOccurs="0"`), mas
   * **obrigatório quando a DPS leva o grupo IBS/CBS** (`ibsCbs`, layout
   * `nt009`): a SEFIN rejeita com E0322, e `buildDps` lança
   * `RuleViolationError` antes de montar a DPS. Quando omitido, o `<cNBS>`
   * não é serializado.
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
   * **Não use com `buildDps`.** Pela regra E0424, o valor recebido não deve ser
   * informado na DPS quando o emitente é o prestador ou o tomador (`nt004`, Anexo
   * I 20260209: `tpEmit` 1 ou 2) — ou também o intermediário (`nt009`, Anexo I
   * 20261020: `tpEmit` 1, 2 ou 3). `buildDps` sempre emite `tpEmit=1`, então
   * informá-lo lança `RuleViolationError` (E0424) nos dois layouts.
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
  /**
   * Default `'1'` (operação tributável). Serviços sem incidência de ISSQN
   * exigem `'4'` (Não Incidência) — senão `RuleViolationError` E0532: no
   * `nt004`, só o 99.01.01; no `nt009`, todo 99.XX.XX (inclui locação 99.03 e
   * bens móveis 99.04.01).
   */
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

/** Campos de `buildDps` comuns aos dois layouts. */
export interface BuildDpsParamsBase {
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
  /**
   * Default `'2'` (Homologação) no `buildDps` avulso. Em `NfseClient.emitir`
   * (e no fake), omitido segue o `ambiente` do cliente (Produção → `'1'`).
   */
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
   * Pula a validação de dígito verificador de CPF/CNPJ (emitente + tomador e,
   * no nt009, fornecedores de `ajusteBC` + destinatário de `ibsCbs`).
   * Default `false`. `emitir` repassa esta opção para cá, então o escape hatch
   * documentado continua funcionando no caminho seguro.
   */
  readonly skipCpfCnpjValidation?: boolean;
}

/** Parâmetros de `buildDps` para o layout `nt004` (produção). */
export interface BuildDpsParamsNt004 extends BuildDpsParamsBase {
  /** Layout da DPS. Obrigatório — sem default. */
  readonly layout: 'nt004';
  /**
   * Só existe no `nt009`. Tipado `never` para que params do `nt009` guardados
   * numa variável (sem checagem de propriedade excedente) não passem por um
   * `NfseClient<'nt004'>`/`buildDps` do nt004 — viram erro de compilação, não
   * só `LayoutMismatchError` em runtime.
   */
  readonly ajusteBC?: never;
  /** Só existe no `nt009` — ver `ajusteBC`. */
  readonly ibsCbs?: never;
}

/**
 * Documento que fundamenta um ajuste da base de cálculo (`TCDocAjusteBC`,
 * layout nt009). Vira um `valores/vAjusteBC/documentos/docAjusteBC`.
 */
export interface DocumentoAjusteBCInputNt009 {
  /** Tipo de ajuste (`tpAjusteBC`). */
  readonly tipo: TipoAjusteBCNt009;
  /**
   * Descrição do ajuste (`xTpAjusteBC`). Obrigatória quando `tipo` é
   * `OutrasDeducoesIssqn` (99) ou `OutrosReembolsos` (199) — E0465 — e proibida
   * nos demais tipos — E0464.
   */
  readonly descricao?: string;
  /** Valor total do documento (`vTotDoc`). */
  readonly valorTotal: number;
  /**
   * Valor do ajuste aplicado (`vAjusteAplic`). Não pode exceder `valorTotal`
   * (E0469) nem `valores.vServ` (E0467).
   */
  readonly valorAplicado: number;
  /** Data de emissão do documento (`dtEmiDoc`). Não pode ser anterior a `dataCompetencia` (E0472). */
  readonly dataEmissao?: Date;
  /** Data de competência do documento (`dtCompDoc`). */
  readonly dataCompetencia?: Date;
  /** `xs:choice` `dFeNacional` | `docFiscalOutro` | `docOutro`. */
  readonly documento: RtcDocumentoReferenciado;
  /**
   * Fornecedor do documento (`fornec`). Identificado por CPF/CNPJ, exige o
   * endereço nacional (E0492).
   */
  readonly fornecedor?: TomadorInput & { readonly endereco: EnderecoBr };
}

/**
 * Ajuste da base de cálculo (`valores/vAjusteBC`, layout nt009) — substitui a
 * dedução/redução (`vDedRed`) do nt004. O ajuste do ISSQN e a lista de
 * documentos são independentes e podem coexistir. A lib não calcula nada:
 * os valores vão como informados.
 */
export interface AjusteBCInputNt009 {
  /**
   * Ajuste da BC do ISSQN: `percentual` → `pAjusteBCISSQN` (`> 0` e `<= 100`,
   * E0453) ou `valor` → `vAjusteBCISSQN`.
   */
  readonly issqn?: { readonly percentual: number } | { readonly valor: number };
  /** Documentos de ajuste (1 a 1000 no XSD; lista vazia equivale a omitir). */
  readonly documentos?: readonly DocumentoAjusteBCInputNt009[];
}

/**
 * Situação/classificação tributária do IBS/CBS (`IBSCBS/valores/trib`). Os
 * opcionais formam o grupo `gIBSCBS`, gerado só quando algum é informado.
 */
export interface ClassificacaoIbsCbsInputNt009 {
  /** CST do IBS/CBS (3 dígitos, `TSRTCCodSitTrib`) — não é o enum `CST` de PIS/COFINS. */
  readonly CST: string;
  /** Código de classificação tributária (6 dígitos, `TSRTCCodClassTrib`). */
  readonly cClassTrib: string;
  /** Código de crédito presumido (2 dígitos, `TSRTCCodCredPres`). */
  readonly cCredPres?: string;
  /** Tributação regular (`gTribRegular`). */
  readonly tributacaoRegular?: { readonly CSTReg: string; readonly cClassTribReg: string };
  /** Diferimento em percentual (`gDif`). */
  readonly diferimento?: {
    readonly pDifUF: number;
    readonly pDifMun: number;
    readonly pDifCBS: number;
  };
}

/**
 * Destinatário do serviço (`IBSCBS/dest`), quando distinto do tomador. Mesma
 * forma de {@link TomadorInput}, sem `inscricaoMunicipal` — o `TCRTCInfoDest`
 * não tem IM, então informá-la é erro de compilação.
 */
export type DestinatarioInputNt009 = Omit<TomadorInput, 'inscricaoMunicipal'>;

/** Unidade imobiliária (`IBSCBS/imovel/gUnidImob`). */
export interface UnidadeImobiliariaInputNt009 {
  /** Inscrição imobiliária fiscal (`inscImobFisc`). */
  readonly inscricaoImobiliaria?: string;
  /** `xs:choice`: código CIB ou endereço nacional do imóvel. */
  readonly identificacao:
    | { readonly cCIB: string }
    | {
        readonly endereco: {
          readonly cep: string;
          readonly logradouro: string;
          readonly numero: string;
          readonly complemento?: string;
          readonly bairro?: string;
        };
      };
  /** Parcelas não integrantes da BC do IBS/CBS na locação (`gAjusteBCLocImoveis`). */
  readonly ajustesBC?: readonly {
    readonly tipo: TipoAjusteBCLocImoveisNt009;
    readonly descricao?: string;
    readonly valor: number;
  }[];
}

/** Operação com bem imóvel, exceto obras (`IBSCBS/imovel`). */
export interface ImovelInputNt009 {
  /** Código IBGE do município do imóvel (`cMun`). */
  readonly codMunicipio: string;
  /**
   * Locação, cessão ou arrendamento (`gLocacao`) — só no subitem 99.03, onde é
   * obrigatória (E0936/E0937). `pCopropriedade` em percentual (0 a 100, E0940).
   * `valores.vServ` deve ser `pCopropriedade/100 × vTotOper` (E0433; aceita o
   * produto truncado ou arredondado para cima em centavos).
   *
   * `vDescIncondTot`/`vDescCondTot` são os descontos totais da locação; o
   * `buildDps` deriva deles os descontos da DPS (`valores/vDescCondIncond`),
   * como exigem E0434/E0443: `vDescIncond = pCopropriedade/100 × vDescIncondTot`
   * (idem `vDescCond`), em 2 casas com meio centavo para cima. Desconto
   * derivado zero não é emitido; derivado `>= vServ` lança (E0431/E0432).
   * Fora da locação, `buildDps` não emite descontos.
   */
  readonly locacao?: {
    readonly pCopropriedade: number;
    readonly vTotOper: number;
    readonly vDescIncondTot?: number;
    readonly vDescCondTot?: number;
    readonly dVencOrig?: Date;
  };
  /** Unidades imobiliárias (0 a 99; lista vazia equivale a omitir). */
  readonly unidades?: readonly UnidadeImobiliariaInputNt009[];
}

/** Bem móvel objeto de locação (`IBSCBS/bensMoveis`). */
export interface BemMovelInputNt009 {
  /** NCM do bem (8 dígitos). */
  readonly ncm: string;
  readonly descricao: string;
  /** Quantidade (1 a 3 dígitos, `TSNum3Dig`, maior que zero — E0974) — string, como os demais `TSNum*`. */
  readonly quantidade: string;
}

/**
 * Grupo IBS/CBS da DPS (`IBSCBS`, layout nt009). `indDest` é derivado:
 * `destinatario` presente → `DestinatarioDistinto` + `dest`; ausente →
 * `TomadorEhDestinatario`. A lib não calcula tributo nenhum.
 */
export interface IbsCbsInputNt009 {
  readonly classificacao: ClassificacaoIbsCbsInputNt009;
  readonly indFinal?: IndicadorFinal;
  /** Código indicador da operação (`cIndOp`, 6 dígitos). */
  readonly cIndOp?: string;
  readonly tpOper?: TipoOperacao;
  /** Chaves das NFS-e referenciadas (`gRefNFSe/refNFSe`; lista vazia equivale a omitir). */
  readonly nfseReferenciadas?: readonly string[];
  readonly tpEnteGov?: TipoEnteGovernamental;
  readonly destinatario?: DestinatarioInputNt009;
  readonly imovel?: ImovelInputNt009;
  /**
   * Bens móveis (0 a 1000; lista vazia equivale a omitir) — só no cTribNac
   * 99.04.01, onde são obrigatórios (E0963/E0967).
   */
  readonly bensMoveis?: readonly BemMovelInputNt009[];
}

/** Parâmetros de `buildDps` para o layout `nt009` (NT 009 release 1). */
export interface BuildDpsParamsNt009 extends BuildDpsParamsBase {
  /** Layout da DPS. Obrigatório — sem default. */
  readonly layout: 'nt009';
  /** Ajuste da base de cálculo (`valores/vAjusteBC`). */
  readonly ajusteBC?: AjusteBCInputNt009;
  /** Grupo IBS/CBS (`IBSCBS`). */
  readonly ibsCbs?: IbsCbsInputNt009;
}

/** Parâmetros de `buildDps` — discriminados por `layout` (obrigatório). */
export type BuildDpsParams = BuildDpsParamsNt004 | BuildDpsParamsNt009;

/** Membro de {@link BuildDpsParams} do layout `L`. */
export type BuildDpsParamsFor<L extends Layout> = Extract<BuildDpsParams, { readonly layout: L }>;

const DEFAULT_TP_AMB: TipoAmbienteDps = '2' as TipoAmbienteDps;
const TP_EMIT_PRESTADOR = '1' as InfDPSNt004['tpEmit'];
const DEFAULT_TRIB_ISSQN: TipoTribISSQN = '1' as TipoTribISSQN;
const DEFAULT_TP_RET_ISSQN: TipoRetISSQN = '1' as TipoRetISSQN;
const DEFAULT_IND_TOT_TRIB: IndicadorTotalTributos = '0' as IndicadorTotalTributos;

/**
 * Constrói uma `DPS` completa a partir de um subconjunto ergonômico de campos.
 * Cobre o caso comum (prestador brasileiro, serviço único, tomador BR opcional)
 * preenchendo todo o boilerplate do layout RTC v1.01.
 *
 * No layout `nt009`, `ajusteBC` (ajuste da base de cálculo) e `ibsCbs` (grupo
 * IBS/CBS, imóvel, bens móveis) também são montados aqui — sem cálculo de
 * tributo. As regras de rejeição **fechadas** do Anexo I 20261020 (que
 * dependem só dos inputs) são checadas antes; as que dependem de cadastro,
 * parametrização municipal ou da calculadora do IBS/CBS ficam com a SEFIN.
 *
 * Para cenários avançados — exterior, obra, atvEvento, dedução/redução e
 * IBSCBS no nt004 — construa `InfDPSNt004`/`InfDPSNt009` manualmente (todos os
 * tipos da RTC estão exportados).
 */
export function buildDps(params: BuildDpsParamsNt004): DpsNt004;
export function buildDps(params: BuildDpsParamsNt009): DpsNt009;
export function buildDps(params: BuildDpsParams): DPS;
export function buildDps(params: BuildDpsParams): DPS {
  // Chamador JS com layout desconhecido → InvalidLayoutError antes de qualquer trabalho.
  assertLayout((params as { readonly layout?: unknown }).layout);
  switch (params.layout) {
    case 'nt004': {
      // Fora do sistema de tipos (JS, cast): os inputs do nt009 não têm destino
      // no nt004 — rejeita em vez de descartar em silêncio.
      const extra = params as BuildDpsParamsNt004 & {
        readonly [K in 'ajusteBC' | 'ibsCbs']?: unknown;
      };
      for (const field of ['ajusteBC', 'ibsCbs'] as const) {
        if (extra[field] !== undefined) throw new LayoutMismatchError('nt004', 'nt004', field);
      }
      break;
    }
    case 'nt009':
      break;
    default:
      return unknownLayout(params);
  }
  assertSimplesNacionalConsistency(params.emitente.regime);
  assertAliqIssRange(params.valores.aliqIss);
  assertValoresConsistency(params.valores, params.emitente.regime, params.layout);
  assertIncidenciaPorServico(params);
  if (!params.skipCpfCnpjValidation) {
    assertIdentifiersDv(params);
  }
  if (params.layout === 'nt009') {
    assertRegrasNt009(params);
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

  // Campos comuns aos dois layouts (toma/valores do buildDps cabem em ambos).
  const comum = {
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

  switch (params.layout) {
    case 'nt004': {
      const infDPS: InfDPSNt004 = comum;
      return { layout: 'nt004', versao: '1.01', infDPS };
    }
    case 'nt009': {
      // nt009: mesmos campos + `finNFSe` obrigatório (só "Regular" na release 1)
      // + os grupos de alto nível do nt009 (ajuste de BC e IBS/CBS). A ordem de
      // serialização (finNFSe após cMotivoEmisTI, cNBS antes de xDescServ) é
      // responsabilidade do serializer.
      const vAjusteBC = params.ajusteBC && buildAjusteBCNt009(params.ajusteBC);
      const vDescCondIncond = descontosLocacaoNt009(params);
      const infDPS: InfDPSNt009 = {
        ...comum,
        finNFSe: FinalidadeNFSe.Regular,
        valores: {
          vServPrest: valores.vServPrest,
          ...(vDescCondIncond ? { vDescCondIncond } : {}),
          ...(vAjusteBC ? { vAjusteBC } : {}),
          trib: valores.trib,
        },
        ...(params.ibsCbs ? { IBSCBS: buildIbsCbsNt009(params.ibsCbs) } : {}),
      };
      return { layout: 'nt009', versao: '1.01', infDPS };
    }
    default:
      return unknownLayout(params);
  }
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

function buildInfoPessoa(tomador: TomadorInput): InfoPessoaNt004 {
  return {
    identificador: toIdentificador(tomador.documento),
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

function toIdentificador(doc: TomadorInput['documento']): IdentificadorPessoa {
  return 'CNPJ' in doc ? { CNPJ: doc.CNPJ } : { CPF: doc.CPF };
}

function nonEmpty<T>(xs: readonly T[] | undefined): readonly T[] | undefined {
  return xs && xs.length > 0 ? xs : undefined;
}

/** `AjusteBCInputNt009` → `valores/vAjusteBC`; `undefined` quando nada é informado. */
function buildAjusteBCNt009(a: AjusteBCInputNt009): InfoAjusteBCNt009 | undefined {
  const docs = nonEmpty(a.documentos);
  if (!a.issqn && !docs) return undefined;
  return {
    ...(a.issqn
      ? {
          ajusteIssqn:
            'percentual' in a.issqn
              ? { pAjusteBCISSQN: a.issqn.percentual }
              : { vAjusteBCISSQN: a.issqn.valor },
        }
      : {}),
    ...(docs ? { documentos: { docAjusteBC: docs.map(buildDocAjusteBCNt009) } } : {}),
  };
}

function buildDocAjusteBCNt009(d: DocumentoAjusteBCInputNt009): DocAjusteBCNt009 {
  return {
    tpAjusteBC: d.tipo,
    ...(d.descricao !== undefined ? { xTpAjusteBC: d.descricao } : {}),
    vTotDoc: d.valorTotal,
    vAjusteAplic: d.valorAplicado,
    ...(d.dataEmissao ? { dtEmiDoc: d.dataEmissao } : {}),
    ...(d.dataCompetencia ? { dtCompDoc: d.dataCompetencia } : {}),
    documento: d.documento,
    // InfoPessoaNt004 ⊂ InfoPessoaNt009 (no nt009 só `xNome` ficou opcional).
    ...(d.fornecedor ? { fornec: buildInfoPessoa(d.fornecedor) } : {}),
  };
}

/** `IbsCbsInputNt009` → `IBSCBS`. `indDest` é derivado da presença de `destinatario`. */
function buildIbsCbsNt009(i: IbsCbsInputNt009): RtcInfoIbsCbsNt009 {
  const refs = nonEmpty(i.nfseReferenciadas);
  const bens = nonEmpty(i.bensMoveis);
  return {
    ...(i.indFinal !== undefined ? { indFinal: i.indFinal } : {}),
    ...(i.cIndOp !== undefined ? { cIndOp: i.cIndOp } : {}),
    ...(i.tpOper !== undefined ? { tpOper: i.tpOper } : {}),
    ...(refs ? { gRefNFSe: { refNFSe: [...refs] } } : {}),
    ...(i.tpEnteGov !== undefined ? { tpEnteGov: i.tpEnteGov } : {}),
    indDest: i.destinatario
      ? IndicadorDestinatario.DestinatarioDistinto
      : IndicadorDestinatario.TomadorEhDestinatario,
    ...(i.destinatario ? { dest: buildDestNt009(i.destinatario) } : {}),
    ...(i.imovel ? { imovel: buildImovelNt009(i.imovel) } : {}),
    ...(bens
      ? {
          bensMoveis: bens.map((b) => ({
            cNCMBemMovel: b.ncm,
            xNCMBemMovel: b.descricao,
            qtdNCMBemMovel: b.quantidade,
          })),
        }
      : {}),
    valores: { trib: buildTribIbsCbsNt009(i.classificacao) },
  };
}

function buildDestNt009(d: DestinatarioInputNt009): RtcInfoDest {
  // TCRTCInfoDest não tem IM: `inscricaoMunicipal` não é serializada.
  return {
    identificador: toIdentificador(d.documento),
    xNome: d.nome,
    ...(d.endereco ? { end: toEndereco(d.endereco) } : {}),
    ...(d.fone ? { fone: d.fone } : {}),
    ...(d.email ? { email: d.email } : {}),
  };
}

function buildTribIbsCbsNt009(c: ClassificacaoIbsCbsInputNt009): RtcInfoTribIbsCbsNt009 {
  const temGrupo =
    c.cCredPres !== undefined || c.tributacaoRegular !== undefined || c.diferimento !== undefined;
  return {
    CST: c.CST,
    cClassTrib: c.cClassTrib,
    ...(temGrupo
      ? {
          gIBSCBS: {
            ...(c.cCredPres !== undefined ? { cCredPres: c.cCredPres } : {}),
            ...(c.tributacaoRegular ? { gTribRegular: c.tributacaoRegular } : {}),
            ...(c.diferimento ? { gDif: c.diferimento } : {}),
          },
        }
      : {}),
  };
}

function buildImovelNt009(i: ImovelInputNt009): RtcInfoImovelNt009 {
  const unidades = nonEmpty(i.unidades);
  return {
    cMun: i.codMunicipio,
    ...(i.locacao ? { gLocacao: i.locacao } : {}),
    ...(unidades ? { gUnidImob: unidades.map(buildUnidadeImobiliariaNt009) } : {}),
  };
}

function buildUnidadeImobiliariaNt009(u: UnidadeImobiliariaInputNt009): RtcUnidadeImobiliariaNt009 {
  const ajustes = nonEmpty(u.ajustesBC);
  const id = u.identificacao;
  return {
    ...(u.inscricaoImobiliaria !== undefined ? { inscImobFisc: u.inscricaoImobiliaria } : {}),
    identificacao:
      'cCIB' in id
        ? { cCIB: id.cCIB }
        : {
            end: {
              CEP: id.endereco.cep,
              xLgr: id.endereco.logradouro,
              nro: id.endereco.numero,
              ...(id.endereco.complemento ? { xCpl: id.endereco.complemento } : {}),
              ...(id.endereco.bairro ? { xBairro: id.endereco.bairro } : {}),
            },
          },
    ...(ajustes
      ? {
          gAjusteBCLocImoveis: ajustes.map((a) => ({
            tpAjusteBCLocImoveis: a.tipo,
            ...(a.descricao !== undefined ? { xTpAjusteBCLocImoveis: a.descricao } : {}),
            vAjusteBCLocImoveis: a.valor,
          })),
        }
      : {}),
  };
}

/**
 * E0532 — serviço sem incidência de ISSQN exige `tribISSQN=4`. O alcance muda
 * por layout: Anexo I 20260209 (`nt004`) cita só o 99.01.01; Anexo I 20261020
 * (`nt009`) estende a todo 99.XX.XX (inclui locação 99.03 e bens móveis 99.04).
 */
function assertIncidenciaPorServico(params: BuildDpsParams): void {
  if ((params.valores.tribISSQN ?? DEFAULT_TRIB_ISSQN) === TipoTribISSQN.NaoIncidencia) return;
  const { cTribNac } = params.servico;
  switch (params.layout) {
    case 'nt004':
      if (cTribNac === '990101') {
        throw new RuleViolationError(
          "o serviço 99.01.01 não tem incidência de ISSQN: tribISSQN deve ser '4' (Não Incidência) — per E0532",
          'E0532',
        );
      }
      return;
    case 'nt009':
      if (cTribNac.startsWith('99')) {
        throw new RuleViolationError(
          `os serviços 99.XX.XX não têm incidência de ISSQN (cTribNac=${cTribNac}): tribISSQN deve ser '4' (Não Incidência) — per E0532`,
          'E0532',
        );
      }
      return;
    default:
      unknownLayout(params);
  }
}

/**
 * Valor como o serializer o emite (`formatDecimal`: inteiro ou 2 casas). Os
 * guards comparam esta forma — a mesma que a SEFIN recebe. Valores fora do
 * domínio do `TSDec*V2` (negativos, não finitos) passam intactos: o
 * serializer já os rejeita.
 */
function comoSerializado(n: number): number {
  return Number.isFinite(n) && n >= 0 && n < 1e21 ? Number(formatDecimal(n)) : n;
}

/** Subitem da lista de serviços (`IISS` de `cTribNac` = `IISSDD`). */
function subitem(cTribNac: string): string {
  return cTribNac.slice(0, 4);
}

/** Subitem 99.03 — locação, cessão onerosa e arrendamento de bem imóvel. */
const SUBITEM_LOCACAO_IMOVEL = '9903';
/** cTribNac 99.04.01 — locação de bens móveis. */
const CTRIBNAC_BENS_MOVEIS = '990401';

/**
 * Regras de rejeição fechadas do Anexo I 20261020 (só `nt009`, execução
 * SEFIN) — dependem apenas dos inputs, sem consulta a cadastro,
 * parametrização municipal ou calculadora do IBS/CBS.
 */
function assertRegrasNt009(params: BuildDpsParamsNt009): void {
  // E0313 — MEI não informa código de tributação municipal.
  if (
    params.emitente.regime.opSimpNac === OpcaoSimplesNacional.Mei &&
    params.servico.cTribMun !== undefined
  ) {
    throw new RuleViolationError(
      'cTribMun não pode ser informado quando o emitente é MEI (opSimpNac=2) — per E0313',
      'E0313',
    );
  }
  if (params.ajusteBC) assertAjusteBCNt009(params.ajusteBC, params);
  if (params.ibsCbs) assertIbsCbsNt009(params.ibsCbs, params);
}

/** Tipos de ajuste de BC que exigem (e são os únicos que admitem) `xTpAjusteBC`. */
const TIPOS_AJUSTE_BC_COM_DESCRICAO: ReadonlySet<TipoAjusteBCNt009> = new Set([
  TipoAjusteBCNt009.OutrasDeducoesIssqn,
  TipoAjusteBCNt009.OutrosReembolsos,
]);

/** Documentos de ajuste que dispensam E0435/E0445 (repasses/reembolsos 101–105 e 199). */
const TIPOS_AJUSTE_BC_REPASSE: ReadonlySet<TipoAjusteBCNt009> = new Set([
  TipoAjusteBCNt009.RepasseIntermediacaoImoveis,
  TipoAjusteBCNt009.RepasseFornecedorAgenciaTurismo,
  TipoAjusteBCNt009.ReembolsoAgenciaPublicidadeProducaoExterna,
  TipoAjusteBCNt009.ReembolsoAgenciaPublicidadeMidia,
  TipoAjusteBCNt009.GlosaServicosSaude,
  TipoAjusteBCNt009.OutrosReembolsos,
]);

/**
 * E0462 — tipos que não convivem com ajuste do ISSQN por percentual/valor. Lista
 * da coluna "regra" (2, 5, 6, 7, 8, 9, 99); a mensagem do Anexo I cita também o
 * 105, mas a regra não — fica de fora para não barrar uma DPS que a SEFIN aceite.
 */
const TIPOS_AJUSTE_BC_SEM_AJUSTE_ISSQN: ReadonlySet<TipoAjusteBCNt009> = new Set([
  TipoAjusteBCNt009.Materiais,
  TipoAjusteBCNt009.RepasseConsorciado,
  TipoAjusteBCNt009.RepassePlanoSaude,
  TipoAjusteBCNt009.Servicos,
  TipoAjusteBCNt009.SubempreitadaMaoObra,
  TipoAjusteBCNt009.ProfissionalParceiro,
  TipoAjusteBCNt009.OutrasDeducoesIssqn,
]);

/** E0479 — tipos que exigem documento fiscal (`dFeNacional`/`docFiscalOutro`, não `docOutro`). */
const TIPOS_AJUSTE_BC_DOC_FISCAL: ReadonlySet<TipoAjusteBCNt009> = new Set([
  TipoAjusteBCNt009.RepasseIntermediacaoImoveis,
  TipoAjusteBCNt009.ReembolsoAgenciaPublicidadeProducaoExterna,
  TipoAjusteBCNt009.ReembolsoAgenciaPublicidadeMidia,
  TipoAjusteBCNt009.OutrosReembolsos,
]);

/** E0463 — subitens 06.01/06.02 só admitem estes tipos. */
const SUBITENS_SO_PARCEIRO_OU_REEMBOLSO: ReadonlySet<string> = new Set(['0601', '0602']);
const TIPOS_AJUSTE_BC_PARCEIRO_OU_REEMBOLSO: ReadonlySet<TipoAjusteBCNt009> = new Set([
  TipoAjusteBCNt009.ProfissionalParceiro,
  TipoAjusteBCNt009.OutrosReembolsos,
]);

/** E0476 — `docFiscalOutro` só para competência anterior a esta data (`TSData`). */
const DOC_FISCAL_OUTRO_COMPETENCIA_LIMITE = '2026-01-01';

/**
 * Regras de rejeição fechadas do ajuste de BC (Anexo I 20261020), checáveis
 * offline antes de montar a DPS. Datas comparadas como o serializer as emite
 * (`formatDate`, dia de Brasília) e valores como `comoSerializado`.
 */
function assertAjusteBCNt009(a: AjusteBCInputNt009, params: BuildDpsParamsNt009): void {
  const docs = a.documentos ?? [];
  if (!a.issqn && docs.length === 0) return;
  const { regime } = params.emitente;
  // E0436 — MEI não informa ajuste de BC (sem exceção).
  if (regime.opSimpNac === OpcaoSimplesNacional.Mei) {
    throw new RuleViolationError(
      'ajusteBC não pode ser informado quando o prestador é MEI (opSimpNac=2) — per E0436',
      'E0436',
    );
  }
  const temRepasse = docs.some((d) => TIPOS_AJUSTE_BC_REPASSE.has(d.tipo));
  const tribISSQN = params.valores.tribISSQN ?? DEFAULT_TRIB_ISSQN;
  // E0435 — ajuste de BC só com tribISSQN=1, salvo documento 101–105/199.
  if (tribISSQN !== TipoTribISSQN.OperacaoTributavel && !temRepasse) {
    throw new RuleViolationError(
      `ajusteBC não pode ser informado quando tribISSQN=${tribISSQN} (imune/exportação/não-incidência), salvo documento de tipo 101–105 ou 199 — per E0435`,
      'E0435',
    );
  }
  // E0445 — nem com regime especial de tributação, com a mesma exceção.
  if (regime.regEspTrib !== RegimeEspecialTributacao.Nenhum && !temRepasse) {
    throw new RuleViolationError(
      `ajusteBC não pode ser informado quando regEspTrib=${regime.regEspTrib} (regime especial), salvo documento de tipo 101–105 ou 199 — per E0445`,
      'E0445',
    );
  }
  if (a.issqn && 'percentual' in a.issqn) {
    const p = comoSerializado(a.issqn.percentual);
    if (!(p > 0 && p <= 100)) {
      throw new RuleViolationError(
        `ajusteBC.issqn.percentual=${a.issqn.percentual} (serializado: ${p}) deve ser maior que 0 e menor ou igual a 100 — per E0453`,
        'E0453',
      );
    }
  }
  const vServ = comoSerializado(params.valores.vServ);
  for (const [i, d] of docs.entries()) {
    const at = `ajusteBC.documentos[${i}]`;
    if (a.issqn && TIPOS_AJUSTE_BC_SEM_AJUSTE_ISSQN.has(d.tipo)) {
      throw new RuleViolationError(
        `${at}.tipo=${d.tipo} não pode ser informado junto com ajusteBC.issqn (percentual/valor) — per E0462`,
        'E0462',
      );
    }
    if (
      SUBITENS_SO_PARCEIRO_OU_REEMBOLSO.has(subitem(params.servico.cTribNac)) &&
      !TIPOS_AJUSTE_BC_PARCEIRO_OU_REEMBOLSO.has(d.tipo)
    ) {
      throw new RuleViolationError(
        `${at}.tipo=${d.tipo}: para cTribNac 06.01/06.02 o tipo deve ser 9 (Profissional Parceiro) ou 199 — per E0463`,
        'E0463',
      );
    }
    const exigeDescricao = TIPOS_AJUSTE_BC_COM_DESCRICAO.has(d.tipo);
    if (d.descricao !== undefined && !exigeDescricao) {
      throw new RuleViolationError(
        `${at}.descricao só pode ser informada quando tipo é 99 ou 199 (atual: ${d.tipo}) — per E0464`,
        'E0464',
      );
    }
    if (d.descricao === undefined && exigeDescricao) {
      throw new RuleViolationError(
        `${at}.descricao é obrigatória quando tipo é 99 ou 199 (atual: ${d.tipo}) — per E0465`,
        'E0465',
      );
    }
    if (
      d.dataEmissao &&
      d.dataCompetencia &&
      formatDate(d.dataEmissao) < formatDate(d.dataCompetencia)
    ) {
      throw new RuleViolationError(
        `${at}.dataEmissao não pode ser anterior a dataCompetencia — per E0472`,
        'E0472',
      );
    }
    const valorAplicado = comoSerializado(d.valorAplicado);
    if (valorAplicado > vServ) {
      throw new RuleViolationError(
        `${at}.valorAplicado=${d.valorAplicado} não pode exceder o valor do serviço (vServ=${params.valores.vServ}) — per E0467`,
        'E0467',
      );
    }
    if (valorAplicado > comoSerializado(d.valorTotal)) {
      throw new RuleViolationError(
        `${at}.valorAplicado=${d.valorAplicado} não pode exceder o valor do documento (valorTotal=${d.valorTotal}) — per E0469`,
        'E0469',
      );
    }
    const doc = d.documento;
    // E0470 — o Anexo I diz "tipo 99 - Outro"; no XSD (TSRTCTipoChaveDFe) "Outro" é o 9.
    if (
      'dFeNacional' in doc &&
      doc.dFeNacional.tipoChaveDFe === TipoChaveDFe.Outro &&
      !doc.dFeNacional.xTipoChaveDFe
    ) {
      throw new RuleViolationError(
        `${at}.documento.dFeNacional.xTipoChaveDFe é obrigatório quando tipoChaveDFe=9 (Outro) — per E0470`,
        'E0470',
      );
    }
    if (
      'docFiscalOutro' in doc &&
      d.dataCompetencia &&
      formatDate(d.dataCompetencia) >= DOC_FISCAL_OUTRO_COMPETENCIA_LIMITE
    ) {
      throw new RuleViolationError(
        `${at}.documento.docFiscalOutro só pode ser informado com dataCompetencia anterior a 01/01/2026 — per E0476`,
        'E0476',
      );
    }
    if ('docOutro' in doc && TIPOS_AJUSTE_BC_DOC_FISCAL.has(d.tipo)) {
      throw new RuleViolationError(
        `${at}.tipo=${d.tipo} exige documento fiscal (dFeNacional ou docFiscalOutro), não docOutro — per E0479`,
        'E0479',
      );
    }
    // E0492 — fornecedor identificado por CPF/CNPJ (sempre, no buildDps) exige endereço nacional.
    if (d.fornecedor && !d.fornecedor.endereco) {
      throw new RuleViolationError(
        `${at}.fornecedor.endereco é obrigatório quando o fornecedor é identificado por CPF/CNPJ — per E0492`,
        'E0492',
      );
    }
  }
}

/** E0903 — subitens da LC 116 que exigem `tpOper` (25.05, 15.09, 17.12, 10.05). */
const SUBITENS_COM_TP_OPER: ReadonlySet<string> = new Set(['2505', '1509', '1712', '1005']);

/**
 * Regras de rejeição fechadas do grupo IBS/CBS (Anexo I 20261020). Ficam de
 * fora as que dependem da calculadora do IBS/CBS ou de tabelas externas, e
 * E0855 (IBSCBS obrigatório a partir de 01/10/2026), que o CGNFS-e não aplica
 * até 31/12/2026. As obrigatoriedades por serviço (E0937, E0963) só são
 * checadas quando `ibsCbs` é informado, pelo mesmo motivo.
 */
function assertIbsCbsNt009(i: IbsCbsInputNt009, params: BuildDpsParamsNt009): void {
  const { cTribNac, cNBS } = params.servico;
  // E0322 — com IBS/CBS, a DPS precisa de um item da NBS.
  if (!cNBS) {
    throw new RuleViolationError(
      'servico.cNBS é obrigatório quando ibsCbs (grupo IBS/CBS) é informado — per E0322',
      'E0322',
    );
  }
  const c = i.classificacao;
  // E0959/E0970 — os 3 primeiros dígitos do cClassTrib são o CST.
  if (c.cClassTrib.slice(0, 3) !== c.CST) {
    throw new RuleViolationError(
      `ibsCbs.classificacao.cClassTrib=${c.cClassTrib} não pertence ao grupo do CST ${c.CST} (3 primeiros dígitos) — per E0959`,
      'E0959',
    );
  }
  const reg = c.tributacaoRegular;
  if (reg && reg.cClassTribReg.slice(0, 3) !== reg.CSTReg) {
    throw new RuleViolationError(
      `ibsCbs.classificacao.tributacaoRegular.cClassTribReg=${reg.cClassTribReg} não pertence ao grupo do CSTReg ${reg.CSTReg} (3 primeiros dígitos) — per E0970`,
      'E0970',
    );
  }
  // E0903 — tpOper obrigatório em compra governamental e nos subitens listados.
  // (E0904, o inverso, depende da correspondência NBS ↔ LC 116 — não checado.)
  if (
    i.tpOper === undefined &&
    (i.tpEnteGov !== undefined || SUBITENS_COM_TP_OPER.has(subitem(cTribNac)))
  ) {
    throw new RuleViolationError(
      'ibsCbs.tpOper é obrigatório quando tpEnteGov é informado ou o serviço é 25.05, 15.09, 17.12 ou 10.05 — per E0903',
      'E0903',
    );
  }
  const temRefs = nonEmpty(i.nfseReferenciadas) !== undefined;
  // E0905/E0906 — gRefNFSe obrigatório com tpOper 2/3, proibido nos demais (ou sem tpOper).
  const exigeRefs =
    i.tpOper === TipoOperacao.RecebimentoPagamentoFornecimentoRealizado ||
    i.tpOper === TipoOperacao.FornecimentoComPagamentoJaRealizado;
  if (exigeRefs && !temRefs) {
    throw new RuleViolationError(
      `ibsCbs.nfseReferenciadas é obrigatório quando tpOper=${i.tpOper} — per E0905`,
      'E0905',
    );
  }
  if (temRefs && !exigeRefs) {
    throw new RuleViolationError(
      `ibsCbs.nfseReferenciadas só pode ser informado com tpOper 2 ou 3 (atual: ${i.tpOper ?? 'ausente'}) — per E0906`,
      'E0906',
    );
  }

  const ehLocacao = subitem(cTribNac) === SUBITEM_LOCACAO_IMOVEL;
  const locacao = i.imovel?.locacao;
  if (locacao && !ehLocacao) {
    throw new RuleViolationError(
      `ibsCbs.imovel.locacao (gLocacao) só pode ser informado para o subitem 99.03 (cTribNac=${cTribNac}) — per E0936`,
      'E0936',
    );
  }
  if (!locacao && ehLocacao) {
    throw new RuleViolationError(
      `ibsCbs.imovel.locacao (gLocacao) é obrigatório para o subitem 99.03 (cTribNac=${cTribNac}) — per E0937`,
      'E0937',
    );
  }
  if (locacao) {
    const p = comoSerializado(locacao.pCopropriedade);
    if (!(p >= 0 && p <= 100)) {
      throw new RuleViolationError(
        `ibsCbs.imovel.locacao.pCopropriedade=${locacao.pCopropriedade} deve estar entre 0 e 100 — per E0940`,
        'E0940',
      );
    }
    assertVServLocacaoNt009(params.valores.vServ, locacao.pCopropriedade, locacao.vTotOper);
  }
  for (const [u, unidade] of (i.imovel?.unidades ?? []).entries()) {
    for (const [j, aj] of (unidade.ajustesBC ?? []).entries()) {
      const at = `ibsCbs.imovel.unidades[${u}].ajustesBC[${j}]`;
      if (!ehLocacao) {
        throw new RuleViolationError(
          `${at}: gAjusteBCLocImoveis só pode ser informado para o subitem 99.03 (cTribNac=${cTribNac}) — per E0939`,
          'E0939',
        );
      }
      const outras = aj.tipo === TipoAjusteBCLocImoveisNt009.Outras;
      if (outras !== (aj.descricao !== undefined)) {
        throw new RuleViolationError(
          `${at}.descricao é obrigatória quando tipo é 99 e proibida nos demais (atual: ${aj.tipo}) — per E0949`,
          'E0949',
        );
      }
      if (locacao && comoSerializado(aj.valor) > comoSerializado(locacao.vTotOper)) {
        throw new RuleViolationError(
          `${at}.valor=${aj.valor} não pode exceder o valor total da operação (vTotOper=${locacao.vTotOper}) — per E0966`,
          'E0966',
        );
      }
    }
  }

  const bens = nonEmpty(i.bensMoveis);
  if (bens && cTribNac !== CTRIBNAC_BENS_MOVEIS) {
    throw new RuleViolationError(
      `ibsCbs.bensMoveis só pode ser informado para o cTribNac 99.04.01 (atual: ${cTribNac}) — per E0967`,
      'E0967',
    );
  }
  if (!bens && cTribNac === CTRIBNAC_BENS_MOVEIS) {
    throw new RuleViolationError(
      'ibsCbs.bensMoveis é obrigatório para o cTribNac 99.04.01 — per E0963',
      'E0963',
    );
  }
  for (const [j, b] of (bens ?? []).entries()) {
    if (/^0+$/.test(b.quantidade)) {
      throw new RuleViolationError(
        `ibsCbs.bensMoveis[${j}].quantidade=${b.quantidade} deve ser maior que 0 — per E0974`,
        'E0974',
      );
    }
  }
}

/**
 * E0433 (subitem 99.03): `vServ = pCopropriedade × vTotOper`, com
 * `pCopropriedade` em percentual. O Anexo I não diz como a SEFIN arredonda o
 * produto, então aceita os dois centavos vizinhos do valor exato (truncado ou
 * arredondado para cima) — nunca rejeita uma DPS que algum arredondamento
 * aceitaria, e pega o `vServ` que não corresponde à copropriedade. Em centavos
 * inteiros (`BigInt`) sobre os valores serializados.
 */
function assertVServLocacaoNt009(vServ: number, pCopropriedade: number, vTotOper: number): void {
  const centavos = (v: number) => BigInt(Math.round(comoSerializado(v) * 100));
  // pCentesimos × vTotOperCentavos está em 1/10000 de centavo.
  const produto = centavos(pCopropriedade) * centavos(vTotOper);
  const piso = produto / 10_000n;
  const teto = produto % 10_000n === 0n ? piso : piso + 1n;
  const vServCentavos = centavos(vServ);
  if (vServCentavos !== piso && vServCentavos !== teto) {
    const esperado = (Number(piso) / 100).toFixed(2);
    throw new RuleViolationError(
      `valores.vServ=${vServ} deve ser pCopropriedade × vTotOper (${pCopropriedade}% × ${vTotOper} = ${esperado}${teto !== piso ? ` ou ${(Number(teto) / 100).toFixed(2)}` : ''}) na locação (subitem 99.03) — per E0433`,
      'E0433',
    );
  }
}

/**
 * Descontos da DPS derivados da locação (E0434/E0443, subitem 99.03):
 * `vDescIncond = pCopropriedade × vDescIncondTot` e o mesmo para `vDescCond`,
 * com `pCopropriedade` em percentual. Calculado sobre os valores serializados,
 * em centavos inteiros, arredondando meio centavo para cima. Um desconto zero
 * não é emitido (E0431/E0432 exigem `> 0`); um desconto `>= vServ` lança.
 */
function descontosLocacaoNt009(params: BuildDpsParamsNt009): VDescCondIncond | undefined {
  const locacao = params.ibsCbs?.imovel?.locacao;
  if (!locacao || subitem(params.servico.cTribNac) !== SUBITEM_LOCACAO_IMOVEL) return undefined;
  const vServ = comoSerializado(params.valores.vServ);
  const pCentesimos = Math.round(comoSerializado(locacao.pCopropriedade) * 100);
  const derivar = (
    total: number | undefined,
    campo: 'vDescIncond' | 'vDescCond',
    regra: 'E0431' | 'E0432',
  ): number | undefined => {
    if (total === undefined) return undefined;
    const totalCentavos = Math.round(comoSerializado(total) * 100);
    const valor = Math.round((pCentesimos * totalCentavos) / 10_000) / 100;
    if (valor === 0) return undefined;
    if (valor >= vServ) {
      throw new RuleViolationError(
        `${campo} derivado da locação (pCopropriedade × ${campo}Tot = ${valor}) deve ser menor que o valor do serviço (vServ=${params.valores.vServ}) — per ${regra}`,
        regra,
      );
    }
    return valor;
  };
  const vDescIncond = derivar(locacao.vDescIncondTot, 'vDescIncond', 'E0431');
  const vDescCond = derivar(locacao.vDescCondTot, 'vDescCond', 'E0432');
  if (vDescIncond === undefined && vDescCond === undefined) return undefined;
  return {
    ...(vDescIncond !== undefined ? { vDescIncond } : {}),
    ...(vDescCond !== undefined ? { vDescCond } : {}),
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
 * Valida o DV de CPF/CNPJ do emitente e do tomador (E0080/E0096/E0188/E0206)
 * — e, no nt009, dos fornecedores de `ajusteBC.documentos` e do
 * `ibsCbs.destinatario` — no próprio builder, para que o caminho offline
 * `buildDps` + `buildDpsXml`
 * (dry-run/preview, design principle #5) também rejeite DV inválido — não só o
 * `emitSeguro`. O XSD valida apenas o formato (14 chars alfanuméricos no
 * TSCNPJ do bundle 20260727), não o DV.
 */
function assertIdentifiersDv(params: BuildDpsParams): void {
  validateCnpj(params.emitente.cnpj);
  if (params.tomador) validateDocumento(params.tomador.documento);
  switch (params.layout) {
    case 'nt004':
      return;
    case 'nt009':
      // nt009: fornecedores do ajuste de BC e destinatário do IBS/CBS.
      for (const d of params.ajusteBC?.documentos ?? []) {
        if (d.fornecedor) validateDocumento(d.fornecedor.documento);
      }
      if (params.ibsCbs?.destinatario) validateDocumento(params.ibsCbs.destinatario.documento);
      return;
    default:
      unknownLayout(params);
  }
}

function validateDocumento(doc: TomadorInput['documento']): void {
  if ('CNPJ' in doc) validateCnpj(doc.CNPJ);
  else validateCpf(doc.CPF);
}

/** Quem, sendo o emitente, impede o `vReceb` (E0424) — texto do Anexo I de cada layout. */
const E0424_EMITENTE: Readonly<Record<Layout, string>> = {
  nt004: 'prestador ou tomador (tpEmit 1 ou 2)',
  nt009: 'prestador, tomador ou intermediário (tpEmit 1, 2 ou 3)',
};

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
function assertValoresConsistency(v: ValoresInput, regime: RegimeTributario, layout: Layout): void {
  // E0424 — vReceb não deve ser informado quando o emitente é o prestador ou o
  // tomador (nt004, Anexo I 20260209: tpEmit 1 ou 2) ou também o intermediário
  // (nt009, Anexo I 20261020: tpEmit 1, 2 ou 3). buildDps sempre usa tpEmit=1,
  // então vReceb aqui é rejeição garantida nos dois layouts; só o texto muda.
  if (v.vReceb !== undefined) {
    throw new RuleViolationError(
      `vReceb não pode ser informado: o valor recebido não deve ser informado na DPS quando o ${E0424_EMITENTE[layout]} for o emitente, e buildDps usa tpEmit=1 — per E0424`,
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
      `aliqIss=${aliqIss} parece ser uma fração, não um percentual. Para emitir alíquota de ${asPercent}%, passe aliqIss=${asPercent}. Se a alíquota é realmente abaixo de 0,5%, construa InfDPSNt004 (ou InfDPSNt009, conforme o layout) manualmente.`,
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
