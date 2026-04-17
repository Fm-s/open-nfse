import { Buffer } from 'node:buffer';
import { gunzipSync, gzipSync } from 'node:zlib';

export function gzipBase64Encode(data: string | Buffer): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return gzipSync(input).toString('base64');
}

export function gzipBase64Decode(b64: string): Buffer {
  return gunzipSync(Buffer.from(b64, 'base64'));
}

export function gzipBase64DecodeToText(b64: string): string {
  return gzipBase64Decode(b64).toString('utf-8');
}
