import { InvalidXmlError } from '../errors/validation.js';
import type { Signature } from '../nfse/domain.js';
import type {
  AmbienteGeradorEvento,
  JustificativaAnaliseFiscalCancelamento,
  JustificativaAnaliseFiscalCancelamentoDeferido,
  JustificativaAnaliseFiscalCancelamentoIndeferido,
  JustificativaCancelamento,
  JustificativaSubstituicao,
  MotivoRejeicaoNfse,
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

/** Informações comuns aos eventos de rejeição (202205 / 203206 / 204207). */
export interface InfoEventoRejeicao {
  readonly cMotivo: MotivoRejeicaoNfse;
  readonly xMotivo?: string;
}

/** Informações do evento de anulação de rejeição (205208). */
export interface InfoEventoAnulacaoRejeicao {
  readonly CPFAgTrib: string;
  readonly idEvManifRej: string;
  readonly xMotivo: string;
}

/**
 * Detalhe do evento — discriminated union cobrindo todos os 16 tipos definidos
 * em `tiposEventos_v1.01.xsd` + uma variante `unknown` que preserva o nó XML
 * bruto para variantes que a lib ainda não modelou (defensivo — a Receita
 * pode adicionar novos tipos por Nota Técnica).
 *
 * Narrow via `in` operator:
 * ```ts
 * if ('e101101' in detalhe) { ... detalhe.e101101.xMotivo ... }
 * ```
 */
export type DetalheEvento =
  // Cancelamentos
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
    }
  // Análise fiscal
  | {
      readonly e101103: {
        readonly xDesc: string;
        readonly cMotivo: JustificativaAnaliseFiscalCancelamento;
        readonly xMotivo: string;
      };
    }
  | {
      readonly e105104: {
        readonly xDesc: string;
        readonly CPFAgTrib: string;
        readonly nProcAdm?: string;
        readonly cMotivo: JustificativaAnaliseFiscalCancelamentoDeferido;
        readonly xMotivo: string;
      };
    }
  | {
      readonly e105105: {
        readonly xDesc: string;
        readonly CPFAgTrib: string;
        readonly nProcAdm?: string;
        readonly cMotivo: JustificativaAnaliseFiscalCancelamentoIndeferido;
        readonly xMotivo: string;
      };
    }
  // Confirmações — payload mínimo (só xDesc)
  | { readonly e202201: { readonly xDesc: string } }
  | { readonly e203202: { readonly xDesc: string } }
  | { readonly e204203: { readonly xDesc: string } }
  | { readonly e205204: { readonly xDesc: string } }
  // Rejeições (P/T/I) — compartilham infRej
  | { readonly e202205: { readonly xDesc: string; readonly infRej: InfoEventoRejeicao } }
  | { readonly e203206: { readonly xDesc: string; readonly infRej: InfoEventoRejeicao } }
  | { readonly e204207: { readonly xDesc: string; readonly infRej: InfoEventoRejeicao } }
  // Anulação de rejeição
  | {
      readonly e205208: {
        readonly xDesc: string;
        readonly infAnRej: InfoEventoAnulacaoRejeicao;
      };
    }
  // Eventos por ofício (305xxx)
  | {
      readonly e305101: {
        readonly xDesc: string;
        readonly CPFAgTrib: string;
        readonly nProcAdm: string;
        readonly xProcAdm: string;
      };
    }
  | {
      readonly e305102: {
        readonly xDesc: string;
        readonly CPFAgTrib: string;
        readonly xMotivo: string;
        readonly codEvento: string;
      };
    }
  | {
      readonly e305103: {
        readonly xDesc: string;
        readonly CPFAgTrib: string;
        readonly idBloqOfic: string;
      };
    }
  // Fallback para variantes futuras não modeladas
  | {
      readonly unknown: {
        readonly elementName: string;
        readonly tipoEvento: string;
        readonly raw: XmlObject;
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
  // Tentativa em ordem dos tipos conhecidos — o XSD garante que só um está
  // presente (xs:choice). Ao encontrar, parse com o shape tipado.
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
  const e101103 = optionalChild(node, 'e101103');
  if (e101103) {
    return {
      tipoEvento: '101103' as TipoEventoNfse,
      detalhe: {
        e101103: {
          xDesc: requireText(e101103, 'xDesc'),
          cMotivo: requireText(e101103, 'cMotivo') as JustificativaAnaliseFiscalCancelamento,
          xMotivo: requireText(e101103, 'xMotivo'),
        },
      },
    };
  }
  const e105104 = optionalChild(node, 'e105104');
  if (e105104) {
    const nProcAdm = optionalText(e105104, 'nProcAdm');
    return {
      tipoEvento: '105104' as TipoEventoNfse,
      detalhe: {
        e105104: {
          xDesc: requireText(e105104, 'xDesc'),
          CPFAgTrib: requireText(e105104, 'CPFAgTrib'),
          ...(nProcAdm !== undefined ? { nProcAdm } : {}),
          cMotivo: requireText(
            e105104,
            'cMotivo',
          ) as JustificativaAnaliseFiscalCancelamentoDeferido,
          xMotivo: requireText(e105104, 'xMotivo'),
        },
      },
    };
  }
  const e105105 = optionalChild(node, 'e105105');
  if (e105105) {
    const nProcAdm = optionalText(e105105, 'nProcAdm');
    return {
      tipoEvento: '105105' as TipoEventoNfse,
      detalhe: {
        e105105: {
          xDesc: requireText(e105105, 'xDesc'),
          CPFAgTrib: requireText(e105105, 'CPFAgTrib'),
          ...(nProcAdm !== undefined ? { nProcAdm } : {}),
          cMotivo: requireText(
            e105105,
            'cMotivo',
          ) as JustificativaAnaliseFiscalCancelamentoIndeferido,
          xMotivo: requireText(e105105, 'xMotivo'),
        },
      },
    };
  }
  // Confirmações — todas têm o mesmo shape (só xDesc).
  for (const [elem, codigo] of [
    ['e202201', '202201'],
    ['e203202', '203202'],
    ['e204203', '204203'],
    ['e205204', '205204'],
  ] as const) {
    const child = optionalChild(node, elem);
    if (child) {
      return {
        tipoEvento: codigo as TipoEventoNfse,
        detalhe: { [elem]: { xDesc: requireText(child, 'xDesc') } } as DetalheEvento,
      };
    }
  }
  // Rejeições P/T/I — compartilham o shape xDesc + infRej.
  for (const [elem, codigo] of [
    ['e202205', '202205'],
    ['e203206', '203206'],
    ['e204207', '204207'],
  ] as const) {
    const child = optionalChild(node, elem);
    if (child) {
      const infRej = requireChild(child, 'infRej');
      const xMotivoInfRej = optionalText(infRej, 'xMotivo');
      return {
        tipoEvento: codigo as TipoEventoNfse,
        detalhe: {
          [elem]: {
            xDesc: requireText(child, 'xDesc'),
            infRej: {
              cMotivo: requireText(infRej, 'cMotivo') as MotivoRejeicaoNfse,
              ...(xMotivoInfRej !== undefined ? { xMotivo: xMotivoInfRej } : {}),
            },
          },
        } as DetalheEvento,
      };
    }
  }
  const e205208 = optionalChild(node, 'e205208');
  if (e205208) {
    const infAnRej = requireChild(e205208, 'infAnRej');
    return {
      tipoEvento: '205208' as TipoEventoNfse,
      detalhe: {
        e205208: {
          xDesc: requireText(e205208, 'xDesc'),
          infAnRej: {
            CPFAgTrib: requireText(infAnRej, 'CPFAgTrib'),
            idEvManifRej: requireText(infAnRej, 'idEvManifRej'),
            xMotivo: requireText(infAnRej, 'xMotivo'),
          },
        },
      },
    };
  }
  const e305101 = optionalChild(node, 'e305101');
  if (e305101) {
    return {
      tipoEvento: '305101' as TipoEventoNfse,
      detalhe: {
        e305101: {
          xDesc: requireText(e305101, 'xDesc'),
          CPFAgTrib: requireText(e305101, 'CPFAgTrib'),
          nProcAdm: requireText(e305101, 'nProcAdm'),
          xProcAdm: requireText(e305101, 'xProcAdm'),
        },
      },
    };
  }
  const e305102 = optionalChild(node, 'e305102');
  if (e305102) {
    return {
      tipoEvento: '305102' as TipoEventoNfse,
      detalhe: {
        e305102: {
          xDesc: requireText(e305102, 'xDesc'),
          CPFAgTrib: requireText(e305102, 'CPFAgTrib'),
          xMotivo: requireText(e305102, 'xMotivo'),
          codEvento: requireText(e305102, 'codEvento'),
        },
      },
    };
  }
  const e305103 = optionalChild(node, 'e305103');
  if (e305103) {
    return {
      tipoEvento: '305103' as TipoEventoNfse,
      detalhe: {
        e305103: {
          xDesc: requireText(e305103, 'xDesc'),
          CPFAgTrib: requireText(e305103, 'CPFAgTrib'),
          idBloqOfic: requireText(e305103, 'idBloqOfic'),
        },
      },
    };
  }
  // Fallback — preserva o elemento bruto. Acontece se a Receita introduzir
  // um novo tipo antes da lib atualizar. Busca entre as chaves do nó pelo
  // padrão `e\d{6}`. Caller pode ler `detalhe.unknown.raw`.
  for (const key of Object.keys(node)) {
    if (/^e\d{6}$/.test(key)) {
      const child = optionalChild(node, key);
      if (child) {
        return {
          tipoEvento: key.slice(1) as TipoEventoNfse,
          detalhe: {
            unknown: { elementName: key, tipoEvento: key.slice(1), raw: child },
          },
        };
      }
    }
  }
  throw new InvalidXmlError('evento sem detalhe reconhecido');
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
