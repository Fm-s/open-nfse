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
  /** XML já assinado, pronto para re-POST. Replay é idempotente via Id do DPS / (chave+tipoEvento+nPedReg). */
  readonly xmlAssinado: string;
  readonly firstAttemptAt: Date;
  readonly lastAttemptAt: Date;
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
 */
export interface RetryStore {
  save(entry: PendingEvent): Promise<void>;
  list(): Promise<readonly PendingEvent[]>;
  delete(id: string): Promise<void>;
}

export class MissingRetryStoreError extends ValidationError {
  constructor() {
    super(
      'Um evento falhou transitoriamente mas nenhum RetryStore foi configurado — ' +
        'pass a `retryStore` no NfseClient config ou direto no método para que a lib possa persistir o pendente.',
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
