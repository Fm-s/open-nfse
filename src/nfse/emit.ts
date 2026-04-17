import { TipoAmbiente } from '../ambiente.js';
import type { A1Certificate } from '../certificate/types.js';
import {
  type MensagemProcessamento,
  ReceitaRejectionError,
  receitaRejectionFromPostError,
} from '../errors/receita.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import { buildDpsXml } from './build-xml.js';
import type { DPS, NFSe } from './domain.js';
import { parseNfseXml } from './parse-xml.js';
import { signDpsXml } from './sign-xml.js';

export interface EmitOptions {
  /**
   * Quando `true`, a pipeline só constrói e assina o XML — sem enviar para a
   * Receita. Útil para previews, testes locais e inspeção offline.
   */
  readonly dryRun?: boolean;
}

/** Resultado do modo dry-run — retorna o XML assinado sem enviar. */
export interface DpsDryRunResult {
  readonly dryRun: true;
  readonly xmlDpsAssinado: string;
  readonly xmlDpsGZipB64: string;
}

/** Resultado do POST /nfse síncrono. */
export interface NfseEmitResult {
  readonly dryRun?: false;
  readonly chaveAcesso: string;
  readonly idDps: string;
  readonly xmlNfse: string;
  readonly nfse: NFSe;
  readonly alertas: readonly MensagemProcessamento[];
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}

interface SefinPostSuccessBody {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly idDps: string;
  readonly chaveAcesso: string;
  readonly nfseXmlGZipB64: string;
  readonly alertas?: readonly Partial<MensagemProcessamento>[];
}

interface SefinPostErrorBody {
  readonly tipoAmbiente?: 1 | 2;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: string;
  readonly idDPS?: string;
  readonly erros?: readonly Partial<MensagemProcessamento>[];
}

type SefinPostBody = SefinPostSuccessBody | SefinPostErrorBody;

export async function emit(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options: { dryRun: true },
): Promise<DpsDryRunResult>;
export async function emit(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options?: { dryRun?: false },
): Promise<NfseEmitResult>;
export async function emit(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options?: EmitOptions,
): Promise<NfseEmitResult | DpsDryRunResult> {
  const xmlUnsigned = buildDpsXml(dps);
  const xmlSigned = signDpsXml(xmlUnsigned, certificate);
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSigned);

  if (options?.dryRun) {
    return { dryRun: true, xmlDpsAssinado: xmlSigned, xmlDpsGZipB64: dpsXmlGZipB64 };
  }

  const body = await httpClient.post<SefinPostBody>(
    '/nfse',
    { dpsXmlGZipB64 },
    { acceptedStatuses: [400] },
  );

  if (isSuccessBody(body)) {
    return toEmitResult(body);
  }

  const rejection = receitaRejectionFromPostError(body);
  if (rejection) throw rejection;

  throw new ReceitaRejectionError({
    mensagens: [{ codigo: 'UNKNOWN', descricao: 'Corpo de erro sem mensagens reconhecíveis.' }],
  });
}

function isSuccessBody(body: SefinPostBody): body is SefinPostSuccessBody {
  return (
    typeof (body as SefinPostSuccessBody).chaveAcesso === 'string' &&
    typeof (body as SefinPostSuccessBody).nfseXmlGZipB64 === 'string'
  );
}

function toEmitResult(body: SefinPostSuccessBody): NfseEmitResult {
  const xmlNfse = gzipBase64DecodeToText(body.nfseXmlGZipB64);
  return {
    chaveAcesso: body.chaveAcesso,
    idDps: body.idDps,
    xmlNfse,
    nfse: parseNfseXml(xmlNfse),
    alertas: (body.alertas ?? []).flatMap(normalizeAlerta),
    tipoAmbiente: body.tipoAmbiente === 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
    versaoAplicativo: body.versaoAplicativo,
    dataHoraProcessamento: new Date(body.dataHoraProcessamento),
  };
}

// ---------------------------------------------------------------------------
// Emissão em lote — SEFIN não tem endpoint de batch; paralelizamos no cliente.
// ---------------------------------------------------------------------------

export interface EmitManyOptions {
  /** Máximo de requisições concorrentes. Default: 4. */
  readonly concurrency?: number;
  /**
   * Interromper o lote assim que uma DPS falhar. As DPS ainda não processadas
   * aparecem no resultado com `status: 'skipped'`. Default: `false` (coletar
   * todas e deixar o caller decidir como reagir).
   */
  readonly stopOnError?: boolean;
}

export type EmitLoteItem =
  | { readonly status: 'success'; readonly dps: DPS; readonly result: NfseEmitResult }
  | { readonly status: 'failure'; readonly dps: DPS; readonly error: Error }
  | { readonly status: 'skipped'; readonly dps: DPS };

export interface EmitLoteResult {
  readonly items: readonly EmitLoteItem[];
  readonly successCount: number;
  readonly failureCount: number;
  readonly skippedCount: number;
}

const DEFAULT_CONCURRENCY = 4;

export async function emitMany(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dpsList: readonly DPS[],
  options?: EmitManyOptions,
): Promise<EmitLoteResult> {
  const concurrency = Math.max(1, Math.floor(options?.concurrency ?? DEFAULT_CONCURRENCY));
  const stopOnError = options?.stopOnError ?? false;
  const items: EmitLoteItem[] = new Array(dpsList.length);
  let nextIndex = 0;
  let aborted = false;

  async function worker(): Promise<void> {
    while (true) {
      if (aborted) return;
      const i = nextIndex++;
      if (i >= dpsList.length) return;
      const dps = dpsList[i] as DPS;
      try {
        const result = await emit(httpClient, certificate, dps);
        items[i] = { status: 'success', dps, result };
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        items[i] = { status: 'failure', dps, error };
        if (stopOnError) aborted = true;
      }
    }
  }

  const workerCount = Math.min(concurrency, dpsList.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  for (let i = 0; i < dpsList.length; i++) {
    if (!items[i]) items[i] = { status: 'skipped', dps: dpsList[i] as DPS };
  }

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  for (const item of items) {
    if (item.status === 'success') successCount++;
    else if (item.status === 'failure') failureCount++;
    else skippedCount++;
  }
  return { items, successCount, failureCount, skippedCount };
}

function normalizeAlerta(raw: Partial<MensagemProcessamento>): MensagemProcessamento[] {
  const codigo = typeof raw.codigo === 'string' && raw.codigo.length > 0 ? raw.codigo : undefined;
  const descricao =
    typeof raw.descricao === 'string' && raw.descricao.length > 0 ? raw.descricao : undefined;
  if (!codigo && !descricao) return [];
  return [
    {
      codigo: codigo ?? 'UNKNOWN',
      descricao: descricao ?? '(sem descrição)',
      ...(typeof raw.complemento === 'string' && raw.complemento.length > 0
        ? { complemento: raw.complemento }
        : {}),
    },
  ];
}
