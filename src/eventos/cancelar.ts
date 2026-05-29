import type { A1Certificate } from '../certificate/types.js';
import { RuleViolationError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';
import type { DPS } from '../nfse/domain.js';
import { type EmitOptions, type NfseEmitResult, emitDpsPronta } from '../nfse/emit.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  type TipoAmbienteDps,
} from '../nfse/enums.js';
import type { RetryPolicy } from '../retry/policy.js';
import {
  MissingRetryStoreError,
  type PendingEvent,
  type PendingEventKind,
  type RetryStore,
  pendingEventId,
} from '../retry/store.js';
import { defaultIsTransient } from '../retry/transient.js';
import { type AutorEvento, buildCancelamentoXml } from './build-event-xml.js';
import { type EventoResult, postEvento } from './post-evento.js';
import { signPedRegEventoXml } from './sign-event.js';

// -----------------------------------------------------------------------------
// cancelar — evento 101101
// -----------------------------------------------------------------------------

export interface CancelarParams {
  readonly chaveAcesso: string;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaCancelamento;
  readonly xMotivo: string;
  readonly tpAmb?: TipoAmbienteDps;
  readonly verAplic?: string;
  readonly dhEvento?: Date;
  /**
   * Store para persistir pendentes se o POST falhar transitoriamente.
   * Se omitido e o caminho transiente for acionado, lança
   * `MissingRetryStoreError` para forçar decisão consciente.
   */
  readonly retryStore?: RetryStore;
  /** Classificador custom. Default: `defaultIsTransient`. */
  readonly isTransient?: (err: unknown) => boolean;
}

/** Estado do resultado de `cancelar` — discriminated union sobre `status`. */
export type CancelarResult =
  | { readonly status: 'ok'; readonly evento: EventoResult }
  | {
      readonly status: 'retry_pending';
      readonly pending: PendingEvent;
      readonly error: Error;
    };

export async function cancelar(
  httpClient: HttpClient,
  certificate: A1Certificate,
  retryPolicy: RetryPolicy,
  params: CancelarParams,
): Promise<CancelarResult> {
  // Rule E0078 — cMotivo=99 exige xMotivo populado.
  if (params.cMotivo === JustificativaCancelamento.Outros && !params.xMotivo?.trim()) {
    throw new RuleViolationError('cMotivo=99 (Outros) exige xMotivo não-vazio', 'E0078');
  }
  // TSMotivo (tiposSimples_v1.01.xsd:355) — minLength 15, maxLength 255.
  // xMotivo é required em CancelarParams, então sempre checa.
  validarTSMotivo(params.xMotivo);

  const isTransient = params.isTransient ?? defaultIsTransient;

  const xmlPedido = buildCancelamentoXml(params);
  // Sign up-front so that, if the POST fails transiently, the persisted
  // entry carries genuinely signed XML — `replayPendingEvents` re-POSTs
  // with `xmlJaAssinado: true`, so unsigned XML in the store would be
  // rejected by SEFIN's signature check on every retry.
  const xmlAssinado = signPedRegEventoXml(xmlPedido, certificate);

  try {
    const r = await postEvento(httpClient, certificate, params.chaveAcesso, xmlAssinado, {
      xmlJaAssinado: true,
    });
    return { status: 'ok', evento: dropInternal(r) };
  } catch (err) {
    const error = toError(err);
    if (!isTransient(error)) {
      throw error; // regra fiscal — caller loga e segue
    }
    const now = new Date();
    const notBefore = retryPolicy.computeNotBefore(error, now, {
      attempt: 1,
      firstAttemptAt: now,
    });
    const pending = buildPendingEvent({
      kind: 'cancelamento_simples',
      chaveNfse: params.chaveAcesso,
      tipoEvento: '101101',
      cMotivo: params.cMotivo,
      xMotivo: params.xMotivo,
      xmlAssinado,
      error,
      transient: true,
      now,
      ...(notBefore ? { notBefore } : {}),
    });
    await savePending(params.retryStore, pending);
    return { status: 'retry_pending', pending, error };
  }
}

// -----------------------------------------------------------------------------
// substituir — emite a nova DPS com <subst>; o sistema gera o 105102 server-side
// -----------------------------------------------------------------------------

/**
 * Parâmetros da substituição. A substituição é dirigida 100% pela DPS: não há
 * `autor`/`tpAmb`/`verAplic`/`dhEvento`/`retryStore` porque o contribuinte não
 * registra um evento — apenas emite a nova DPS. As opções de emissão
 * (`skip*Validation`, `cepValidator`) são repassadas ao `emitDpsPronta`.
 */
export interface SubstituirParams extends Omit<EmitOptions, 'dryRun'> {
  /** Chave da NFS-e a ser substituída (a antiga). */
  readonly chaveOriginal: string;
  /**
   * Nova DPS (substituta). Se `infDPS.subst` não estiver preenchido, é
   * auto-completado com `chaveOriginal` + `cMotivo`/`xMotivo`.
   */
  readonly novaDps: DPS;
  readonly cMotivo: JustificativaSubstituicao;
  readonly xMotivo?: string;
}

/**
 * Resultado da substituição: a NFS-e substituta. Enviar a nova DPS com
 * `infDPS/subst` para `POST /nfse` faz o **sistema** gerar o evento 105102
 * (autor=MEmis) cancelando a original — não há segundo write do contribuinte,
 * portanto não há estados de retry/rollback.
 */
export interface SubstituirResult {
  readonly novaNfse: NfseEmitResult;
}

export async function substituir(
  httpClient: HttpClient,
  certificate: A1Certificate,
  params: SubstituirParams,
): Promise<SubstituirResult> {
  // Rule E0078 — cMotivo=99 exige xMotivo populado. Pré-check local para evitar
  // round-trip + queima de nDPS num emit que seria rejeitado.
  if (params.cMotivo === JustificativaSubstituicao.Outros && !params.xMotivo?.trim()) {
    throw new RuleViolationError('cMotivo=99 (Outros) exige xMotivo não-vazio', 'E0078');
  }
  // TSMotivo — 15 a 255 chars quando presente (xMotivo é opcional em subst).
  if (params.xMotivo !== undefined) {
    validarTSMotivo(params.xMotivo);
  }

  // Auto-preenche infDPS.subst (chSubstda = chave original) se ausente.
  const dpsComSubst = ensureSubstPopulated(
    params.novaDps,
    params.chaveOriginal,
    params.cMotivo,
    params.xMotivo,
  );

  // Único write do contribuinte: a DPS com <subst> via POST /nfse. O Sistema
  // Nacional NFS-e gera, de forma atômica com a emissão, o evento 105102
  // (autor=MEmis) que cancela a NFS-e original, e retorna a substituta. O
  // contribuinte NÃO registra um pedRegEvento 105102 — ver doc do método.
  // Falha aqui → throw (nada foi alterado no SEFIN; caller retenta limpo).
  const emitOptions: Omit<EmitOptions, 'dryRun'> = {
    ...(params.skipValidation !== undefined ? { skipValidation: params.skipValidation } : {}),
    ...(params.skipCepValidation !== undefined
      ? { skipCepValidation: params.skipCepValidation }
      : {}),
    ...(params.skipCpfCnpjValidation !== undefined
      ? { skipCpfCnpjValidation: params.skipCpfCnpjValidation }
      : {}),
    ...(params.cepValidator ? { cepValidator: params.cepValidator } : {}),
  };

  const novaNfse = await emitDpsPronta(httpClient, certificate, dpsComSubst, emitOptions);
  return { novaNfse };
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function ensureSubstPopulated(
  dps: DPS,
  chaveOriginal: string,
  cMotivo: JustificativaSubstituicao,
  xMotivo: string | undefined,
): DPS {
  if (dps.infDPS.subst) return dps;
  return {
    ...dps,
    infDPS: {
      ...dps.infDPS,
      subst: {
        chSubstda: chaveOriginal,
        cMotivo,
        ...(xMotivo ? { xMotivo } : {}),
      },
    },
  };
}

function dropInternal(r: EventoResult & { xmlAssinado: string }): EventoResult {
  const { xmlAssinado: _drop, ...rest } = r;
  void _drop;
  return rest;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

interface PendingEventFactoryInput {
  readonly kind: Exclude<PendingEventKind, 'emission'>;
  readonly chaveNfse: string;
  readonly chaveSubstituta?: string;
  readonly tipoEvento: string;
  readonly cMotivo: string;
  readonly xMotivo?: string;
  readonly xmlAssinado: string;
  readonly error: Error;
  readonly transient: boolean;
  /**
   * Timestamp compartilhado entre `firstAttemptAt` / `lastAttemptAt` e o
   * cálculo de `notBefore` no caller. Required para garantir que os três
   * campos refiram-se ao mesmo instante (sem drift de microssegundos).
   */
  readonly now: Date;
  readonly notBefore?: Date;
  /** Tentativas até agora; default 1 quando omitido. */
  readonly attempts?: number;
}

function buildPendingEvent(input: PendingEventFactoryInput): PendingEvent {
  return {
    id: pendingEventId(input.chaveNfse, input.tipoEvento, input.kind),
    kind: input.kind,
    chaveNfse: input.chaveNfse,
    ...(input.chaveSubstituta ? { chaveSubstituta: input.chaveSubstituta } : {}),
    tipoEvento: input.tipoEvento,
    cMotivo: input.cMotivo,
    ...(input.xMotivo ? { xMotivo: input.xMotivo } : {}),
    xmlAssinado: input.xmlAssinado,
    firstAttemptAt: input.now,
    lastAttemptAt: input.now,
    attempts: input.attempts ?? 1,
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    lastError: {
      message: input.error.message,
      errorName: input.error.name,
      transient: input.transient,
    },
  };
}

async function savePending(store: RetryStore | undefined, pending: PendingEvent): Promise<void> {
  if (!store) throw new MissingRetryStoreError();
  await store.save(pending);
}

/**
 * Valida que a string bate com `TSMotivo` (tiposSimples_v1.01.xsd:355):
 * minLength 15, maxLength 255. Lança `RuleViolationError` com rule `TSMotivo`
 * — evita round-trip + rejeição server-side de payload curto.
 */
function validarTSMotivo(xMotivo: string): void {
  const len = xMotivo.length;
  if (len < 15 || len > 255) {
    throw new RuleViolationError(
      `xMotivo deve ter entre 15 e 255 caracteres (atual: ${len}) — per TSMotivo do RTC v1.01`,
      'TSMotivo',
    );
  }
}
