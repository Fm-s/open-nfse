import { ValidationError } from '../errors/validation.js';

/** Tipo do item pendente — roteia o replay pro endpoint certo. */
export type PendingEventKind =
  | 'emission'
  | 'cancelamento_simples'
  | 'cancelamento_por_substituicao'
  | 'rollback_cancelamento';

interface PendingBase {
  /** Chave estável de deduplicação no store. */
  readonly id: string;
  /**
   * XML **assinado** (XMLDSig) pronto para re-POST sem re-assinatura.
   * `replayPendingEvents` envia este XML diretamente ao SEFIN; persistir
   * XML sem assinatura causa rejeição imediata na retentativa. SEFIN
   * deduplica via `infDPS.Id` (emissão) ou `chave + tipoEvento + nPedReg`
   * (eventos), então retentar é idempotente quando o XML é íntegro.
   */
  readonly xmlAssinado: string;
  readonly firstAttemptAt: Date;
  readonly lastAttemptAt: Date;
  /**
   * Earliest moment this entry is eligible for replay. When set,
   * `replayPendingEvents` skips entries with `notBefore > now`.
   * Populated from `RetryPolicy.computeNotBefore` (e.g., respecting a
   * 429 / 503 `Retry-After` header). `undefined` means the entry is
   * eligible on the next replay tick — current behavior for all entries
   * created before this field existed.
   */
  readonly notBefore?: Date;
  /**
   * Number of attempts made so far (including the one that just failed).
   * `1` after the first persist, `2` after the first replay attempt, etc.
   * Passed to `RetryPolicy.computeNotBefore` via `RetryContext.attempt`
   * so custom policies can implement attempt-based backoff (exponential,
   * linear, etc.). `undefined` is treated as `1` for entries persisted
   * before this field existed.
   */
  readonly attempts?: number;
  readonly lastError: {
    readonly message: string;
    readonly errorName: string;
    readonly transient: boolean;
  };
}

/** Emissão pendente — SEFIN deduplica via `infDPS.Id` em retries. */
export interface PendingEmission extends PendingBase {
  readonly kind: 'emission';
  /** `infDPS.Id` (45 chars). Chave de idempotência server-side. */
  readonly idDps: string;
  /** CNPJ do emitente, para introspecção/filtros. */
  readonly emitenteCnpj: string;
  readonly serie: string;
  readonly nDPS: string;
}

/** Evento de cancelamento/substituição pendente. */
export interface PendingEventoCancelamento extends PendingBase {
  readonly kind: 'cancelamento_simples' | 'cancelamento_por_substituicao' | 'rollback_cancelamento';
  /** Chave da NFS-e alvo do evento. */
  readonly chaveNfse: string;
  /** Chave da NFS-e substituta — apenas para 105102. */
  readonly chaveSubstituta?: string;
  readonly tipoEvento: string;
  readonly nPedRegEvento: string;
  readonly cMotivo: string;
  readonly xMotivo?: string;
}

export type PendingEvent = PendingEmission | PendingEventoCancelamento;

/**
 * Persistência dos pendentes. A lib fornece uma implementação em memória
 * (`createInMemoryRetryStore`); produção implementa contra seu banco.
 *
 * Operações devem ser **idempotentes** — `save` com mesmo `id` sobrescreve,
 * `delete` com id inexistente não lança.
 *
 * **Contrato de tipos:** ao serializar para banco/JSON, lembre de
 * re-hidratar os campos `Date` (`firstAttemptAt`, `lastAttemptAt`,
 * `notBefore`) na volta de `list()`. A lib compara `notBefore > now`
 * onde `now` é um `Date`; uma string ISO no lugar daria coerção JS
 * imprevisível. Se você persiste em SQL/MongoDB, retorne `Date` objects
 * (não strings) do método `list`.
 */
export interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}

export class MissingRetryStoreError extends ValidationError {
  constructor() {
    super(
      'Falha transiente (rede, timeout, 429, 5xx) detectada mas nenhum RetryStore foi configurado — ' +
        'passe `retryStore` no NfseClient config (ou direto no método de evento) para que a lib possa persistir o pendente e retentá-lo via replayPendingEvents().',
    );
  }
}

/** Store em memória — testes e demos. Não sobrevive restart. */
export function createInMemoryRetryStore(): RetryStore {
  const map = new Map<string, PendingEvent>();
  return {
    async save(entry) {
      map.set(entry.id, entry);
    },
    async list() {
      return Array.from(map.values());
    },
    async delete(id) {
      map.delete(id);
    },
  };
}

/** Id estável para evento (cancelamento/substituição). */
export function pendingEventId(
  chaveNfse: string,
  tipoEvento: string,
  nPedRegEvento: string,
): string {
  return `${chaveNfse}:${tipoEvento}:${nPedRegEvento}`;
}

/** Id estável para emissão. O `idDps` já é único por natureza. */
export function pendingEmissionId(idDps: string): string {
  return `emission:${idDps}`;
}

// Type guards para discriminar em replay.
export function isPendingEmission(p: PendingEvent): p is PendingEmission {
  return p.kind === 'emission';
}
export function isPendingEventoCancelamento(p: PendingEvent): p is PendingEventoCancelamento {
  return p.kind !== 'emission';
}
