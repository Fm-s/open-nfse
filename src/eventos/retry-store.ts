import { ValidationError } from '../errors/validation.js';

/** Tipo do evento pendente — identifica qual pipeline de retry chamar. */
export type PendingEventKind = 'cancelamento_por_substituicao' | 'rollback_cancelamento';

/**
 * Registro de um evento que falhou transitoriamente e deve ser reenviado depois.
 * O `xmlPedidoAssinado` já está pronto para re-POST — a Receita deduplica via
 * (chave + tipoEvento + nPedRegEvento), então o replay é idempotente.
 */
export interface PendingEvent {
  /** Chave estável: sha1(chaveNfse + tipoEvento + nPedRegEvento). */
  readonly id: string;
  readonly kind: PendingEventKind;
  /** Chave da NFS-e alvo do evento (a que está sendo cancelada). */
  readonly chaveNfse: string;
  /** Chave da NFS-e substituta — apenas para 105102. */
  readonly chaveSubstituta?: string;
  readonly tipoEvento: string;
  readonly nPedRegEvento: string;
  readonly cMotivo: string;
  readonly xMotivo?: string;
  /** XML do `<pedRegEvento>` já assinado. Basta recomprimir+POST. */
  readonly xmlPedidoAssinado: string;
  readonly firstAttemptAt: Date;
  readonly lastAttemptAt: Date;
  readonly lastError: {
    readonly message: string;
    readonly errorName: string;
    readonly transient: boolean;
  };
}

/**
 * Persistência dos eventos pendentes. A lib fornece uma implementação em
 * memória (`createInMemoryRetryStore`); em produção o consumidor implementa
 * com backend de escolha (Postgres, Redis, DynamoDB).
 *
 * As três operações devem ser **idempotentes** — `save` com o mesmo `id`
 * deve sobrescrever a entrada anterior, `delete` com id inexistente não
 * deve lançar.
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

/** Store em memória, útil para testes e demos. Não sobrevive restart. */
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

/** Gera o id estável para um evento — usado como chave primária no store. */
export function pendingEventId(
  chaveNfse: string,
  tipoEvento: string,
  nPedRegEvento: string,
): string {
  return `${chaveNfse}:${tipoEvento}:${nPedRegEvento}`;
}
