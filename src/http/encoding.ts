import { Buffer } from 'node:buffer';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Limite máximo de expansão na descompressão. NFS-e XMLs reais têm ~5-15 KB,
 * DPS XMLs ficam abaixo disso. 50 MB é ordens de grandeza acima do razoável
 * e ainda assim blinda contra gzip-bomb (1 KB → 1 GB) vindo de reverse
 * proxies mal configurados ou responses corrompidas.
 */
const MAX_GUNZIP_OUTPUT_BYTES = 50 * 1024 * 1024;

export function gzipBase64Encode(data: string | Buffer): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return gzipSync(input).toString('base64');
}

export function gzipBase64Decode(b64: string): Buffer {
  return gunzipSync(Buffer.from(b64, 'base64'), { maxOutputLength: MAX_GUNZIP_OUTPUT_BYTES });
}

export function gzipBase64DecodeToText(b64: string): string {
  return gzipBase64Decode(b64).toString('utf-8');
}
