import { TipoAmbiente } from '../ambiente.js';
import type { CepValidator } from '../cep/types.js';
import type { A1Certificate } from '../certificate/types.js';
import {
  type MensagemProcessamento,
  ReceitaRejectionError,
  receitaRejectionFromPostError,
} from '../errors/receita.js';
import { defaultIsTransient } from '../eventos/classify-error.js';
import {
  MissingRetryStoreError,
  type PendingEmission,
  type RetryStore,
  pendingEmissionId,
} from '../eventos/retry-store.js';
import { validateCnpj, validateCpf } from '../fiscal/validate-cpf-cnpj.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import { type BuildDpsParams, buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import { collectCepsFromDps, collectIdentifiersFromDps } from './collect-from-dps.js';
import type { DPS, NFSe } from './domain.js';
import { type DpsCounter, MissingDpsCounterError } from './dps-counter.js';
import { parseNfseXml } from './parse-xml.js';
import { signDpsXml } from './sign-xml.js';
import { validateDpsXml } from './validate-xml.js';

export interface EmitOptions {
  /**
   * Quando `true`, a pipeline só constrói e assina o XML — sem enviar para a
   * Receita. Útil para previews, testes locais e inspeção offline.
   */
  readonly dryRun?: boolean;
  /**
   * Pula a validação XSD local (RTC v1.01) antes de assinar. Default `false`.
   * A validação roda antes da assinatura: se o XML estiver malformado, o erro
   * aparece localmente com linha + descrição ao invés de virar rejeição da
   * Receita depois de um round-trip. Só desligue para debugging ou quando
   * estiver intencionalmente gerando XML fora do padrão.
   */
  readonly skipValidation?: boolean;
  /**
   * Pula a validação de CEP (formato + lookup na API externa). Default
   * `false`. Quando habilitada, cada endereço da DPS (prest/toma/interm/obra/
   * atvEvento/RTC-dest/fornec) é verificado — a API default é o ViaCEP.
   */
  readonly skipCepValidation?: boolean;
  /**
   * Pula a validação de dígito verificador de CPF/CNPJ. Default `false`.
   * Apenas identificadores do tipo CNPJ e CPF são validados; NIF e cNaoNIF
   * são ignorados (não têm DV brasileiro).
   */
  readonly skipCpfCnpjValidation?: boolean;
  /**
   * Validador de CEP custom. Se omitido, o validador default (ViaCEP) é
   * usado. Passe um custom para usar outra API, banco local ou mock em tests.
   */
  readonly cepValidator?: CepValidator;
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

/**
 * Escape hatch para quando você já tem um `DPS` completo e quer controlar
 * inteiramente a pipeline. `nDPS` precisa estar preenchido; o counter do
 * cliente **não** é chamado. Sem tratamento transiente — falhas de rede
 * viram exceção.
 *
 * O caminho padrão é `emitSeguro` / `NfseClient.emitir(params)`.
 */
export async function emitDpsPronta(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options: EmitOptions & { dryRun: true },
): Promise<DpsDryRunResult>;
export async function emitDpsPronta(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options?: EmitOptions & { dryRun?: false },
): Promise<NfseEmitResult>;
export async function emitDpsPronta(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DPS,
  options?: EmitOptions,
): Promise<NfseEmitResult | DpsDryRunResult> {
  // Pré-validações, em ordem de custo crescente: primeiro as sync baratas
  // (CPF/CNPJ DV), depois as locais pesadas (XSD contra a RTC v1.01), por
  // último o lookup externo de CEP — que pode bater em viacep.com.br.
  if (!options?.skipCpfCnpjValidation) {
    runIdentifierValidation(dps);
  }
  const xmlUnsigned = buildDpsXml(dps);
  if (!options?.skipValidation) {
    await validateDpsXml(xmlUnsigned);
  }
  if (!options?.skipCepValidation) {
    await runCepValidation(dps, options?.cepValidator);
  }
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
  /** Propagado para cada `emit()` do lote. Ver `EmitOptions.skipValidation`. */
  readonly skipValidation?: boolean;
  /** Propagado. Ver `EmitOptions.skipCepValidation`. */
  readonly skipCepValidation?: boolean;
  /** Propagado. Ver `EmitOptions.skipCpfCnpjValidation`. */
  readonly skipCpfCnpjValidation?: boolean;
  /**
   * Validador de CEP compartilhado pelo lote. Crie uma instância única com
   * cache externo para deduplicar lookups entre as DPS. Ver `createViaCepValidator`.
   */
  readonly cepValidator?: CepValidator;
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
  const perEmitOptions: EmitOptions & { dryRun: false } = {
    dryRun: false,
    ...(options?.skipValidation !== undefined ? { skipValidation: options.skipValidation } : {}),
    ...(options?.skipCepValidation !== undefined
      ? { skipCepValidation: options.skipCepValidation }
      : {}),
    ...(options?.skipCpfCnpjValidation !== undefined
      ? { skipCpfCnpjValidation: options.skipCpfCnpjValidation }
      : {}),
    ...(options?.cepValidator !== undefined ? { cepValidator: options.cepValidator } : {}),
  };
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
        const result = await emitDpsPronta(httpClient, certificate, dps, perEmitOptions);
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

function runIdentifierValidation(dps: DPS): void {
  for (const { type, value } of collectIdentifiersFromDps(dps)) {
    if (type === 'CNPJ') validateCnpj(value);
    else validateCpf(value);
  }
}

let _defaultCepValidator: CepValidator | undefined;

async function runCepValidation(dps: DPS, override?: CepValidator): Promise<void> {
  const ceps = collectCepsFromDps(dps);
  if (ceps.length === 0) return;
  const validator = override ?? (await getDefaultCepValidator());
  // sequencial — o cache interno no validator garante que CEPs repetidos
  // custam O(1). Paralelizar aqui pode violar rate-limit do ViaCEP em lote.
  for (const { cep } of ceps) {
    await validator.validate(cep);
  }
}

async function getDefaultCepValidator(): Promise<CepValidator> {
  if (!_defaultCepValidator) {
    const { createViaCepValidator } = await import('../cep/viacep.js');
    _defaultCepValidator = createViaCepValidator();
  }
  return _defaultCepValidator;
}

// ---------------------------------------------------------------------------
// Emissão segura — fluxo primário de v0.4+.
// Counter é consultado APENAS depois que todas as validações offline passam;
// falhas transitórias no POST viram retry_pending no RetryStore.
// ---------------------------------------------------------------------------

/**
 * Parâmetros de alto nível para `emitSeguro`. Equivalente a `BuildDpsParams`
 * sem o campo `nDPS` (fornecido pelo `DpsCounter`), mais os flags de emissão.
 *
 * Passe `nDPS` explícito para override manual (útil para `dryRun` sem queimar
 * um número ou replay determinístico em testes).
 */
export interface EmitirParams extends Omit<BuildDpsParams, 'nDPS'>, EmitOptions {
  /**
   * Override manual do `nDPS`. Quando presente, o `DpsCounter` não é
   * consultado. Obrigatório em `dryRun` (sem isso o preview consumiria
   * um número do counter à toa).
   */
  readonly nDPS?: string;
}

/**
 * Resultado discriminado de `emitSeguro`.
 *
 * - `ok` — autorizada, `nfse` contém a NFS-e parseada.
 * - `retry_pending` — erro transiente (rede/timeout/5xx); salvo no
 *   `RetryStore` para replay idempotente via `replayPendingEvents`.
 *
 * Erros **permanentes** (rejeição de regra fiscal, validação local) lançam
 * exceção — o caller sabe que o nDPS foi consumido mas a nota foi
 * definitivamente rejeitada.
 */
export type EmitirResult =
  | { readonly status: 'ok'; readonly nfse: NfseEmitResult }
  | {
      readonly status: 'retry_pending';
      readonly pending: PendingEmission;
      readonly error: Error;
    };

interface EmitSeguroDeps {
  readonly httpClient: HttpClient;
  readonly certificate: A1Certificate;
  readonly dpsCounter: DpsCounter | undefined;
  readonly retryStore: RetryStore | undefined;
  readonly isTransient?: (err: unknown) => boolean;
}

export async function emitSeguro(
  deps: EmitSeguroDeps,
  params: EmitirParams,
): Promise<EmitirResult | DpsDryRunResult> {
  const isTransient = deps.isTransient ?? defaultIsTransient;

  // 1. Monta DPS com nDPS placeholder para validação (XSD não distingue
  //    valor específico — só valida contra pattern [1-9][0-9]{0,14}).
  const placeholderOrExplicit = params.nDPS ?? '1';
  const dpsParaValidar = buildDps({ ...params, nDPS: placeholderOrExplicit });

  // 2. Validações offline. Ordem: CPF/CNPJ (sync) → XSD (WASM) → CEP (HTTP).
  if (!params.skipCpfCnpjValidation) {
    runIdentifierValidation(dpsParaValidar);
  }
  const xmlPlaceholder = buildDpsXml(dpsParaValidar);
  if (!params.skipValidation) {
    await validateDpsXml(xmlPlaceholder);
  }
  if (!params.skipCepValidation) {
    await runCepValidation(dpsParaValidar, params.cepValidator);
  }

  // 3. Dry-run: use o placeholder (ou o nDPS explícito) — não consome counter.
  if (params.dryRun) {
    const xmlSigned = signDpsXml(xmlPlaceholder, deps.certificate);
    const xmlDpsGZipB64 = gzipBase64Encode(xmlSigned);
    return { dryRun: true, xmlDpsAssinado: xmlSigned, xmlDpsGZipB64 };
  }

  // 4. Obtém o nDPS real — override explícito ou counter.
  let nDpsReal: string;
  if (params.nDPS !== undefined) {
    nDpsReal = params.nDPS;
  } else {
    if (!deps.dpsCounter) throw new MissingDpsCounterError();
    nDpsReal = await deps.dpsCounter.next({
      emitenteCnpj: params.emitente.cnpj,
      serie: params.serie,
    });
  }

  // 5. Rebuild com nDPS real + sign. Não re-valido XSD — estrutura é
  //    idêntica, só o valor numérico mudou (e já sabemos que bate no pattern).
  const dpsReal = buildDps({ ...params, nDPS: nDpsReal });
  const xmlUnsigned = buildDpsXml(dpsReal);
  const xmlSigned = signDpsXml(xmlUnsigned, deps.certificate);
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSigned);

  // 6. POST. Transiente → retryStore. Permanente → throw.
  try {
    const body = await deps.httpClient.post<SefinPostBody>(
      '/nfse',
      { dpsXmlGZipB64 },
      { acceptedStatuses: [400] },
    );

    if (isSuccessBody(body)) {
      return { status: 'ok', nfse: toEmitResult(body) };
    }

    // 400 com corpo de rejeição — permanente (regra de negócio violada).
    const rejection = receitaRejectionFromPostError(body);
    if (rejection) throw rejection;
    throw new ReceitaRejectionError({
      mensagens: [{ codigo: 'UNKNOWN', descricao: 'Corpo de erro sem mensagens reconhecíveis.' }],
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isTransient(error)) {
      if (!deps.retryStore) throw new MissingRetryStoreError();
      const now = new Date();
      const pending: PendingEmission = {
        id: pendingEmissionId(dpsReal.infDPS.Id),
        kind: 'emission',
        idDps: dpsReal.infDPS.Id,
        emitenteCnpj: params.emitente.cnpj,
        serie: params.serie,
        nDPS: nDpsReal,
        xmlAssinado: xmlSigned,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lastError: {
          message: error.message,
          errorName: error.name,
          transient: true,
        },
      };
      await deps.retryStore.save(pending);
      return { status: 'retry_pending', pending, error };
    }
    throw error;
  }
}

/**
 * Replay de uma emissão pendente — re-POSTa o XML assinado diretamente em
 * `/nfse`. SEFIN deduplica via `infDPS.Id`, então retentar é idempotente.
 */
export async function replayEmission(
  httpClient: HttpClient,
  xmlSignedDps: string,
): Promise<NfseEmitResult> {
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSignedDps);
  const body = await httpClient.post<SefinPostBody>(
    '/nfse',
    { dpsXmlGZipB64 },
    { acceptedStatuses: [400] },
  );
  if (isSuccessBody(body)) return toEmitResult(body);
  const rejection = receitaRejectionFromPostError(body);
  if (rejection) throw rejection;
  throw new ReceitaRejectionError({
    mensagens: [{ codigo: 'UNKNOWN', descricao: 'replay: corpo sem mensagens.' }],
  });
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
