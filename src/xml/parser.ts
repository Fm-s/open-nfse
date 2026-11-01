import { type X2jOptions, XMLParser } from 'fast-xml-parser';

export const ATTR_PREFIX = '@_';
export const TEXT_NODE = '#text';

const XML_PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const ENTITY_REF = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g;

/** Produção `Char` do XML 1.0 (§2.2). */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/**
 * Decodifica, numa única passada, as 5 entidades predefinidas do XML e as
 * referências numéricas (`&#231;`, `&#xE7;`) — XML 1.0 §4.1/§4.6: `&#231;` e
 * `ç` são o mesmo texto. Uma passada só: `&amp;#231;` vira o texto `&#231;`,
 * nunca `ç`. É leniente como o resto do parser: referência a um code point
 * fora de `Char` (`&#0;`, surrogates, `> 0x10FFFF`) e entidades nomeadas
 * desconhecidas (`&nbsp;`) ficam literais em vez de lançar.
 */
export function decodeXmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    ENTITY_REF,
    (ref, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
      if (name !== undefined) return XML_PREDEFINED_ENTITIES[name] ?? ref;
      const code = hex !== undefined ? Number.parseInt(hex, 16) : Number(dec);
      return isXmlChar(code) ? String.fromCodePoint(code) : ref;
    },
  );
}

// Substitui o decoder padrão do fast-xml-parser, que (sem `htmlEntities`) deixa
// as referências numéricas literais. Entidades declaradas em DOCTYPE são
// ignoradas de propósito (`addInputEntities` no-op): NFS-e não usa DTD, e não
// expandi-las fecha a porta para XXE e entity bombs. CDATA não passa por aqui.
const entityDecoder: NonNullable<X2jOptions['entityDecoder']> = {
  decode: decodeXmlEntities,
  reset: () => {},
  setXmlVersion: () => {},
  setExternalEntities: () => {},
  addInputEntities: () => {},
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_NODE,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  // Precisa ficar ligado: é o que faz o parser chamar o `entityDecoder` em
  // textos e atributos.
  processEntities: true,
  entityDecoder,
});

export type XmlNode = string | XmlObject | XmlNode[];

export interface XmlObject {
  readonly [key: string]: XmlNode | undefined;
}

export function parseXml(xml: string): XmlObject {
  return parser.parse(xml) as XmlObject;
}
