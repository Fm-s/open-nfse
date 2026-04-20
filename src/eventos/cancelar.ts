import type { A1Certificate } from '../certificate/types.js';
import { RuleViolationError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';
import type { DPS } from '../nfse/domain.js';
import { type NfseEmitResult, emitDpsPronta } from '../nfse/emit.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  type TipoAmbienteDps,
} from '../nfse/enums.js';
import { type AutorEvento, buildCancelamentoXml, buildSubstituicaoXml } from './build-event-xml.js';
import { defaultIsTransient } from './classify-error.js';
import { type EventoResult, postEvento } from './post-evento.js';
import {
  MissingRetryStoreError,
  type PendingEvent,
  type PendingEventKind,
  type RetryStore,
  pendingEventId,
} from './retry-store.js';

// -----------------------------------------------------------------------------
// cancelar — evento 101101
// -----------------------------------------------------------------------------

export interface CancelarParams {
  readonly chaveAcesso: string;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaCancelamento;
  readonly xMotivo: string;
  readonly nPedRegEvento?: string;
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
  const nPedRegEvento = (params.nPedRegEvento ?? '1').padStart(3, '0');

  const xmlPedido = buildCancelamentoXml({ ...params, nPedRegEvento });

  try {
    const r = await postEvento(httpClient, certificate, params.chaveAcesso, xmlPedido);
    return { status: 'ok', evento: dropInternal(r) };
  } catch (err) {
    const error = toError(err);
    if (!isTransient(error)) {
      throw error; // regra fiscal — caller loga e segue
    }
    const pending = buildPendingEvent({
      kind: 'cancelamento_simples',
      chaveNfse: params.chaveAcesso,
      tipoEvento: '101101',
      nPedRegEvento,
      cMotivo: params.cMotivo,
      xMotivo: params.xMotivo,
      xmlAssinado: xmlPedido,
      error,
      transient: true,
    });
    await savePending(params.retryStore, pending);
    return { status: 'retry_pending', pending, error };
  }
}

// -----------------------------------------------------------------------------
// substituir — emite nova DPS com <subst>, cancela a original via 105102
// -----------------------------------------------------------------------------

export interface SubstituirParams {
  /** Chave da NFS-e a ser substituída (a antiga). */
  readonly chaveOriginal: string;
  /** Nova DPS a ser emitida. Se não tiver `subst` preenchido, será auto-completado. */
  readonly novaDps: DPS;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaSubstituicao;
  readonly xMotivo?: string;
  readonly nPedRegEvento?: string;
  readonly tpAmb?: TipoAmbienteDps;
  readonly verAplic?: string;
  readonly dhEvento?: Date;
  /**
   * Store para persistir eventos pendentes quando cancelamento transitório
   * falhar. Se omitido e um erro transiente ocorrer, lança
   * `MissingRetryStoreError` para forçar o consumidor a decidir conscientemente.
   */
  readonly retryStore?: RetryStore;
  /** Classificador custom. Default: `defaultIsTransient`. */
  readonly isTransient?: (err: unknown) => boolean;
}

/** Estado do resultado da substituição — discriminated union sobre `status`. */
export type SubstituirResult =
  | {
      readonly status: 'ok';
      readonly novaNfse: NfseEmitResult;
      readonly cancelamento: EventoResult;
    }
  | {
      readonly status: 'retry_pending';
      readonly novaNfse: NfseEmitResult;
      readonly pending: PendingEvent;
      readonly cancelamentoError: Error;
    }
  | {
      readonly status: 'rolled_back';
      readonly novaNfse: NfseEmitResult;
      readonly cancelamentoError: Error;
      readonly rollback: EventoResult;
    }
  | {
      readonly status: 'rollback_pending';
      readonly novaNfse: NfseEmitResult;
      readonly cancelamentoError: Error;
      readonly rollbackError: Error;
      readonly pendingRollback: PendingEvent;
    };

export async function substituir(
  httpClient: HttpClient,
  certificate: A1Certificate,
  params: SubstituirParams,
): Promise<SubstituirResult> {
  // Rule E0078 — cMotivo=99 exige xMotivo populado. Pré-check local para
  // evitar round-trip + queima de nDPS num emit que seria rejeitado.
  if (params.cMotivo === JustificativaSubstituicao.Outros && !params.xMotivo?.trim()) {
    throw new RuleViolationError('cMotivo=99 (Outros) exige xMotivo não-vazio', 'E0078');
  }
  // TSMotivo — 15 a 255 chars quando presente (xMotivo é opcional em subst).
  if (params.xMotivo !== undefined) {
    validarTSMotivo(params.xMotivo);
  }

  const isTransient = params.isTransient ?? defaultIsTransient;

  // Auto-preenche subst na nova DPS se não estiver presente.
  const dpsComSubst = ensureSubstPopulated(
    params.novaDps,
    params.chaveOriginal,
    params.cMotivo,
    params.xMotivo,
  );

  // Step 1 — emit new. Se falhar, throw (nada a reconciliar).
  const novaNfse = await emitDpsPronta(httpClient, certificate, dpsComSubst);

  // Step 2 — cancelar por substituição (105102) sobre a chave original.
  const nPedRegEvento = (params.nPedRegEvento ?? '1').padStart(3, '0');
  const xmlCancel = buildSubstituicaoXml({
    chaveOriginal: params.chaveOriginal,
    chaveSubstituta: novaNfse.chaveAcesso,
    autor: params.autor,
    cMotivo: params.cMotivo,
    nPedRegEvento,
    ...(params.xMotivo ? { xMotivo: params.xMotivo } : {}),
    ...(params.tpAmb ? { tpAmb: params.tpAmb } : {}),
    ...(params.verAplic ? { verAplic: params.verAplic } : {}),
    ...(params.dhEvento ? { dhEvento: params.dhEvento } : {}),
  });

  let cancelamentoErr: Error | undefined;
  let xmlCancelAssinado: string | undefined;
  try {
    const r = await postEvento(httpClient, certificate, params.chaveOriginal, xmlCancel);
    return { status: 'ok', novaNfse, cancelamento: dropInternal(r) };
  } catch (err) {
    cancelamentoErr = toError(err);
    // Se o postEvento assinou antes de falhar, recuperamos para retry. Caso
    // contrário, o passo de re-assinatura no replay gera assinatura nova (o
    // nPedReg garante dedup).
    xmlCancelAssinado = undefined;
  }

  // Step 2 falhou.
  if (isTransient(cancelamentoErr)) {
    // Persistir para retry.
    const pending = buildPendingEvent({
      kind: 'cancelamento_por_substituicao',
      chaveNfse: params.chaveOriginal,
      chaveSubstituta: novaNfse.chaveAcesso,
      tipoEvento: '105102',
      nPedRegEvento,
      cMotivo: params.cMotivo,
      ...(params.xMotivo ? { xMotivo: params.xMotivo } : {}),
      xmlAssinado: xmlCancelAssinado ?? xmlCancel,
      error: cancelamentoErr,
      transient: true,
    });
    await savePending(params.retryStore, pending);
    return { status: 'retry_pending', novaNfse, pending, cancelamentoError: cancelamentoErr };
  }

  // Step 2 permanentemente falhou → rollback da nova via 101101.
  const xmlRollback = buildCancelamentoXml({
    chaveAcesso: novaNfse.chaveAcesso,
    autor: params.autor,
    cMotivo: JustificativaCancelamento.ErroEmissao,
    xMotivo:
      `Rollback automático — cancelamento por substituição da chave ${params.chaveOriginal} falhou permanentemente: ${cancelamentoErr.message}`.slice(
        0,
        255,
      ),
    nPedRegEvento: '1',
    ...(params.tpAmb ? { tpAmb: params.tpAmb } : {}),
    ...(params.verAplic ? { verAplic: params.verAplic } : {}),
  });

  let rollbackErr: Error | undefined;
  let xmlRollbackAssinado: string | undefined;
  try {
    const r = await postEvento(httpClient, certificate, novaNfse.chaveAcesso, xmlRollback);
    return {
      status: 'rolled_back',
      novaNfse,
      cancelamentoError: cancelamentoErr,
      rollback: dropInternal(r),
    };
  } catch (err) {
    rollbackErr = toError(err);
    xmlRollbackAssinado = undefined;
  }

  const pendingRollback = buildPendingEvent({
    kind: 'rollback_cancelamento',
    chaveNfse: novaNfse.chaveAcesso,
    tipoEvento: '101101',
    nPedRegEvento: '001',
    cMotivo: JustificativaCancelamento.ErroEmissao,
    xMotivo: `Rollback de substituição — chave original ${params.chaveOriginal}`,
    xmlAssinado: xmlRollbackAssinado ?? xmlRollback,
    error: rollbackErr,
    transient: isTransient(rollbackErr),
  });
  await savePending(params.retryStore, pendingRollback);
  return {
    status: 'rollback_pending',
    novaNfse,
    cancelamentoError: cancelamentoErr,
    rollbackError: rollbackErr,
    pendingRollback,
  };
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
  readonly nPedRegEvento: string;
  readonly cMotivo: string;
  readonly xMotivo?: string;
  readonly xmlAssinado: string;
  readonly error: Error;
  readonly transient: boolean;
}

function buildPendingEvent(input: PendingEventFactoryInput): PendingEvent {
  const now = new Date();
  return {
    id: pendingEventId(input.chaveNfse, input.tipoEvento, input.nPedRegEvento),
    kind: input.kind,
    chaveNfse: input.chaveNfse,
    ...(input.chaveSubstituta ? { chaveSubstituta: input.chaveSubstituta } : {}),
    tipoEvento: input.tipoEvento,
    nPedRegEvento: input.nPedRegEvento,
    cMotivo: input.cMotivo,
    ...(input.xMotivo ? { xMotivo: input.xMotivo } : {}),
    xmlAssinado: input.xmlAssinado,
    firstAttemptAt: now,
    lastAttemptAt: now,
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
