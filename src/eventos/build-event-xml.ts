import { XMLBuilder } from 'fast-xml-parser';
import type {
  AmbienteGeradorEvento,
  JustificativaCancelamento,
  JustificativaSubstituicao,
  TipoAmbienteDps,
  TipoEventoNfse,
} from '../nfse/enums.js';
import { ATTR_PREFIX } from '../xml/parser.js';
import { buildEventoPedidoId } from './event-id.js';

const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse';

export interface BuildEventoXmlOptions {
  readonly includeXmlDeclaration?: boolean;
}

/** Identificação do autor do evento — CNPJ ou CPF (discriminated union). */
export type AutorEvento = { readonly CNPJ: string } | { readonly CPF: string };

export interface BuildCancelamentoXmlParams {
  readonly chaveAcesso: string;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaCancelamento;
  readonly xMotivo: string;
  readonly nPedRegEvento?: string;
  readonly tpAmb?: TipoAmbienteDps;
  readonly verAplic?: string;
  readonly dhEvento?: Date;
  /** Ambiente gerador do evento. Default `SefinNacional`. */
  readonly ambGer?: AmbienteGeradorEvento;
}

export interface BuildSubstituicaoXmlParams {
  readonly chaveOriginal: string;
  readonly chaveSubstituta: string;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaSubstituicao;
  readonly xMotivo?: string;
  readonly nPedRegEvento?: string;
  readonly tpAmb?: TipoAmbienteDps;
  readonly verAplic?: string;
  readonly dhEvento?: Date;
  readonly ambGer?: AmbienteGeradorEvento;
}

const DEFAULT_TP_AMB = '2' as TipoAmbienteDps;
const DEFAULT_AMB_GER = '2' as AmbienteGeradorEvento; // SefinNacional
const DEFAULT_VER_APLIC = 'open-nfse/0.2';
const VERSAO_EVENTO = '1.01';
const TIPO_CANCELAMENTO = '101101' as TipoEventoNfse;
const TIPO_CANCELAMENTO_SUBSTITUICAO = '105102' as TipoEventoNfse;

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  suppressEmptyNode: true,
  processEntities: true,
});

/**
 * Constrói o XML de pedido de registro do evento de **cancelamento** (101101).
 * Segue a sequência do `TCInfPedReg` da RTC v1.01 e coloca o detalhe em `<e101101>`.
 */
export function buildCancelamentoXml(
  params: BuildCancelamentoXmlParams,
  options?: BuildEventoXmlOptions,
): string {
  const nPedRegEvento = (params.nPedRegEvento ?? '1').padStart(3, '0');
  const Id = buildEventoPedidoId({
    chaveAcesso: params.chaveAcesso,
    tipoEvento: TIPO_CANCELAMENTO,
    nPedRegEvento,
  });
  const detEvento = {
    e101101: {
      xDesc: 'Cancelamento de NFS-e',
      cMotivo: params.cMotivo,
      xMotivo: params.xMotivo,
    },
  };
  return renderPedRegEvento(Id, params, nPedRegEvento, detEvento, options);
}

/**
 * Constrói o XML de pedido de registro do evento de **cancelamento por substituição** (105102).
 * Requer a chave da NFS-e substituta, que já deve ter sido emitida.
 */
export function buildSubstituicaoXml(
  params: BuildSubstituicaoXmlParams,
  options?: BuildEventoXmlOptions,
): string {
  const nPedRegEvento = (params.nPedRegEvento ?? '1').padStart(3, '0');
  const Id = buildEventoPedidoId({
    chaveAcesso: params.chaveOriginal,
    tipoEvento: TIPO_CANCELAMENTO_SUBSTITUICAO,
    nPedRegEvento,
  });
  const detEvento = {
    e105102: {
      xDesc: 'Cancelamento de NFS-e por Substituicao',
      cMotivo: params.cMotivo,
      ...(params.xMotivo ? { xMotivo: params.xMotivo } : {}),
      chSubstituta: params.chaveSubstituta,
    },
  };
  return renderPedRegEvento(
    Id,
    { ...params, chaveAcesso: params.chaveOriginal },
    nPedRegEvento,
    detEvento,
    options,
  );
}

function renderPedRegEvento(
  Id: string,
  params: {
    readonly chaveAcesso: string;
    readonly autor: AutorEvento;
    readonly tpAmb?: TipoAmbienteDps;
    readonly verAplic?: string;
    readonly dhEvento?: Date;
    readonly ambGer?: AmbienteGeradorEvento;
  },
  nPedRegEvento: string,
  detEvento: object,
  options: BuildEventoXmlOptions | undefined,
): string {
  const autor =
    'CNPJ' in params.autor ? { CNPJAutor: params.autor.CNPJ } : { CPFAutor: params.autor.CPF };

  const root = {
    pedRegEvento: {
      [`${ATTR_PREFIX}xmlns`]: NFSE_NS,
      [`${ATTR_PREFIX}versao`]: VERSAO_EVENTO,
      infPedReg: {
        [`${ATTR_PREFIX}Id`]: Id,
        tpAmb: params.tpAmb ?? DEFAULT_TP_AMB,
        verAplic: params.verAplic ?? DEFAULT_VER_APLIC,
        dhEvento: formatDateTime(params.dhEvento ?? new Date()),
        ...autor,
        chNFSe: params.chaveAcesso,
        nPedRegEvento,
        ...detEvento,
      },
    },
  };
  // ambGer is not part of TCInfPedReg — it lives on TCInfEvento (response side).
  // We therefore ignore params.ambGer here and keep it only for API symmetry.
  void params.ambGer;

  const body = xmlBuilder.build(root) as string;
  return options?.includeXmlDeclaration === false
    ? body
    : `<?xml version="1.0" encoding="UTF-8"?>${body}`;
}

function formatDateTime(d: Date): string {
  // Same rule as DPS: YYYY-MM-DDTHH:MM:SS-03:00 (Brasília, no DST).
  const BR_OFFSET_MIN = -180;
  const shifted = new Date(d.getTime() + BR_OFFSET_MIN * 60_000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}
