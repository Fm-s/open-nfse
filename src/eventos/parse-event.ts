import { InvalidXmlError } from '../errors/validation.js';
import type { Signature } from '../nfse/domain.js';
import type {
  AmbienteGeradorEvento,
  JustificativaCancelamento,
  JustificativaSubstituicao,
  TipoAmbienteDps,
  TipoEventoNfse,
} from '../nfse/enums.js';
import { ATTR_PREFIX, type XmlObject, parseXml } from '../xml/parser.js';

/**
 * `<evento>` retornado pela Receita após o processamento de um pedido de
 * registro de evento. Carrega o pedido original + metadados de processamento +
 * assinatura da Sefin.
 */
export interface EventoProcessado {
  readonly versao: string;
  readonly infEvento: InfEvento;
  readonly signature: Signature;
}

export interface InfEvento {
  readonly Id: string;
  readonly verAplic?: string;
  readonly ambGer: AmbienteGeradorEvento;
  readonly nSeqEvento: string;
  readonly dhProc: Date;
  readonly nDFe: string;
  readonly pedRegEvento: PedRegEvento;
}

export interface PedRegEvento {
  readonly versao: string;
  readonly infPedReg: InfPedRegEvento;
  readonly signature?: Signature;
}

/** Identificação do autor — CNPJ ou CPF. */
export type AutorEventoParsed = { readonly CNPJAutor: string } | { readonly CPFAutor: string };

/** Detalhe do evento — union entre as variantes comumente retornadas. */
export type DetalheEvento =
  | {
      readonly e101101: {
        readonly xDesc: string;
        readonly cMotivo: JustificativaCancelamento;
        readonly xMotivo: string;
      };
    }
  | {
      readonly e105102: {
        readonly xDesc: string;
        readonly cMotivo: JustificativaSubstituicao;
        readonly xMotivo?: string;
        readonly chSubstituta: string;
      };
    };

export interface InfPedRegEvento {
  readonly Id: string;
  readonly tpAmb: TipoAmbienteDps;
  readonly verAplic: string;
  readonly dhEvento: Date;
  readonly autor: AutorEventoParsed;
  readonly chNFSe: string;
  readonly nPedRegEvento: string;
  readonly tipoEvento: TipoEventoNfse;
  readonly detalhe: DetalheEvento;
}

export function parseEventoXml(xml: string): EventoProcessado {
  let tree: XmlObject;
  try {
    tree = parseXml(xml);
  } catch (cause) {
    throw new InvalidXmlError('falha ao parsear XML do evento', { cause });
  }
  const root = tree.evento;
  if (!isObject(root)) {
    throw new InvalidXmlError('elemento raiz <evento> ausente');
  }
  return parseEvento(root);
}

function parseEvento(node: XmlObject): EventoProcessado {
  return {
    versao: requireAttr(node, 'versao'),
    infEvento: parseInfEvento(requireChild(node, 'infEvento')),
    signature: parseSignature(requireChild(node, 'Signature')),
  };
}

function parseInfEvento(node: XmlObject): InfEvento {
  return {
    Id: requireAttr(node, 'Id'),
    ...optionalAssign('verAplic', optionalText(node, 'verAplic')),
    ambGer: requireText(node, 'ambGer') as AmbienteGeradorEvento,
    nSeqEvento: requireText(node, 'nSeqEvento'),
    dhProc: coerceDate(requireText(node, 'dhProc')),
    nDFe: requireText(node, 'nDFe'),
    pedRegEvento: parsePedRegEvento(requireChild(node, 'pedRegEvento')),
  };
}

function parsePedRegEvento(node: XmlObject): PedRegEvento {
  const sig = optionalChild(node, 'Signature');
  return {
    versao: requireAttr(node, 'versao'),
    infPedReg: parseInfPedReg(requireChild(node, 'infPedReg')),
    ...optionalAssign('signature', sig ? parseSignature(sig) : undefined),
  };
}

function parseInfPedReg(node: XmlObject): InfPedRegEvento {
  const autor = parseAutor(node);
  const { tipoEvento, detalhe } = parseDetalhe(node);
  return {
    Id: requireAttr(node, 'Id'),
    tpAmb: requireText(node, 'tpAmb') as TipoAmbienteDps,
    verAplic: requireText(node, 'verAplic'),
    dhEvento: coerceDate(requireText(node, 'dhEvento')),
    autor,
    chNFSe: requireText(node, 'chNFSe'),
    nPedRegEvento: requireText(node, 'nPedRegEvento'),
    tipoEvento,
    detalhe,
  };
}

function parseAutor(node: XmlObject): AutorEventoParsed {
  const cnpj = optionalText(node, 'CNPJAutor');
  if (cnpj !== undefined) return { CNPJAutor: cnpj };
  const cpf = optionalText(node, 'CPFAutor');
  if (cpf !== undefined) return { CPFAutor: cpf };
  throw new InvalidXmlError('autor do evento ausente (CNPJAutor/CPFAutor)');
}

function parseDetalhe(node: XmlObject): {
  readonly tipoEvento: TipoEventoNfse;
  readonly detalhe: DetalheEvento;
} {
  const e101101 = optionalChild(node, 'e101101');
  if (e101101) {
    return {
      tipoEvento: '101101' as TipoEventoNfse,
      detalhe: {
        e101101: {
          xDesc: requireText(e101101, 'xDesc'),
          cMotivo: requireText(e101101, 'cMotivo') as JustificativaCancelamento,
          xMotivo: requireText(e101101, 'xMotivo'),
        },
      },
    };
  }
  const e105102 = optionalChild(node, 'e105102');
  if (e105102) {
    const xMotivo = optionalText(e105102, 'xMotivo');
    return {
      tipoEvento: '105102' as TipoEventoNfse,
      detalhe: {
        e105102: {
          xDesc: requireText(e105102, 'xDesc'),
          cMotivo: requireText(e105102, 'cMotivo') as JustificativaSubstituicao,
          ...(xMotivo !== undefined ? { xMotivo } : {}),
          chSubstituta: requireText(e105102, 'chSubstituta'),
        },
      },
    };
  }
  throw new InvalidXmlError('evento sem detalhe reconhecido (e101101/e105102)');
}

function parseSignature(node: XmlObject): Signature {
  const signedInfo = requireChild(node, 'SignedInfo');
  const reference = requireChild(signedInfo, 'Reference');
  const keyInfo = requireChild(node, 'KeyInfo');
  const x509Data = requireChild(keyInfo, 'X509Data');
  return {
    signatureValue: requireText(node, 'SignatureValue').trim(),
    digestValue: requireText(reference, 'DigestValue').trim(),
    x509Certificate: requireText(x509Data, 'X509Certificate').trim(),
    referenceUri: requireAttr(reference, 'URI'),
  };
}

// ---- helpers ----
function isObject(value: unknown): value is XmlObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireAttr(node: XmlObject, name: string): string {
  const v = node[`${ATTR_PREFIX}${name}`];
  if (typeof v !== 'string') throw new InvalidXmlError(`atributo @${name} ausente`);
  return v;
}
function requireChild(node: XmlObject, name: string): XmlObject {
  const child = node[name];
  if (!isObject(child)) throw new InvalidXmlError(`elemento <${name}> ausente`);
  return child;
}
function optionalChild(node: XmlObject, name: string): XmlObject | undefined {
  const child = node[name];
  return isObject(child) ? child : undefined;
}
function requireText(node: XmlObject, name: string): string {
  const v = node[name];
  if (typeof v !== 'string') throw new InvalidXmlError(`elemento <${name}> ausente ou não textual`);
  return v;
}
function optionalText(node: XmlObject, name: string): string | undefined {
  const v = node[name];
  return typeof v === 'string' ? v : undefined;
}
function coerceDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new InvalidXmlError(`data inválida: "${value}"`);
  return d;
}
function optionalAssign<K extends string, V>(
  key: K,
  value: V | undefined,
): { readonly [P in K]?: V } {
  return value === undefined
    ? ({} as { readonly [P in K]?: V })
    : ({ [key]: value } as { readonly [P in K]: V });
}
