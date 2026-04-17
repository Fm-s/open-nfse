import { XMLParser } from 'fast-xml-parser';

export const ATTR_PREFIX = '@_';
export const TEXT_NODE = '#text';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_NODE,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  processEntities: true,
});

export type XmlNode = string | XmlObject | XmlNode[];

export interface XmlObject {
  readonly [key: string]: XmlNode | undefined;
}

export function parseXml(xml: string): XmlObject {
  return parser.parse(xml) as XmlObject;
}
