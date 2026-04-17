import { Agent, type Dispatcher } from 'undici';
import { AMBIENTE_ENDPOINTS, type Ambiente } from './ambiente.js';
import type { CepValidator } from './cep/types.js';
import { normalizeProvider } from './certificate/provider.js';
import type { A1Certificate, CertificateInput, CertificateProvider } from './certificate/types.js';
import { fetchByNsu as fetchByNsuInternal } from './dfe/fetch-by-nsu.js';
import type { FetchByNsuOptions, NsuQueryResult } from './dfe/types.js';
import {
  type CancelarParams,
  type SubstituirParams,
  type SubstituirResult,
  cancelar as cancelarInternal,
  substituir as substituirInternal,
} from './eventos/cancelar.js';
import { defaultIsTransient } from './eventos/classify-error.js';
import type { EventoResult } from './eventos/post-evento.js';
import { postEvento } from './eventos/post-evento.js';
import type { PendingEvent, RetryStore } from './eventos/retry-store.js';
import { HttpClient } from './http/client.js';
import { type Logger, noopLogger } from './logging.js';
import type { DPS } from './nfse/domain.js';
import {
  type DpsDryRunResult,
  type EmitLoteResult,
  type EmitManyOptions,
  type EmitOptions,
  type NfseEmitResult,
  emit as emitInternal,
  emitMany as emitManyInternal,
} from './nfse/emit.js';
import { fetchByChave as fetchByChaveInternal } from './nfse/fetch-by-chave.js';
import type { NfseQueryResult } from './nfse/types.js';

export type ReplayItem =
  | { readonly id: string; readonly status: 'success'; readonly evento: EventoResult }
  | { readonly id: string; readonly status: 'still_pending'; readonly error: Error }
  | { readonly id: string; readonly status: 'failed_permanent'; readonly error: Error };

function dropInternal(r: EventoResult & { xmlPedidoAssinado: string }): EventoResult {
  const { xmlPedidoAssinado: _drop, ...rest } = r;
  void _drop;
  return rest;
}

function isRetryableError(err: Error): boolean {
  return defaultIsTransient(err);
}

export interface EmitenteConfig {
  /** CNPJ do emitente (14 dígitos, sem máscara). */
  readonly cnpj: string;
  /** Inscrição Municipal no município emissor. */
  readonly inscricaoMunicipal: string;
  /** Código IBGE do município emissor (7 dígitos). Ex.: `2111300` = São Luís/MA, `3550308` = São Paulo/SP. */
  readonly codigoMunicipio: string;
}

export interface NfseClientConfig {
  readonly ambiente: Ambiente;
  readonly certificado: CertificateInput;
  readonly emitente?: EmitenteConfig;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
  /**
   * Advanced / testing hook. When set, used as the HTTP dispatcher instead of
   * building an mTLS Agent from `certificado` (e.g. pass undici's `MockAgent`).
   * Normal consumers should never need this.
   */
  readonly dispatcher?: Dispatcher;
  /**
   * Validador de CEP usado nas emissões deste cliente. Se omitido, a lib usa
   * o `createViaCepValidator()` internamente (consulta viacep.com.br com
   * cache em memória). Passe um custom para trocar o provedor (BrasilAPI,
   * banco local, mock em tests).
   */
  readonly cepValidator?: CepValidator;
  /**
   * Store para eventos pendentes de retry. Necessário para `substituir()`
   * persistir transientes/rollbacks. Se omitido, a lib lança
   * `MissingRetryStoreError` quando o caminho transiente é acionado.
   */
  readonly retryStore?: RetryStore;
}

export interface FetchByNsuParams extends FetchByNsuOptions {
  readonly ultimoNsu: number;
}

interface ClientState {
  readonly dispatcher: Dispatcher;
  readonly sefin: HttpClient;
  readonly adn: HttpClient;
  readonly ownsDispatcher: boolean;
  readonly certificate: A1Certificate;
}

export class NfseClient {
  private readonly ambiente: Ambiente;
  private readonly provider: CertificateProvider;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly dispatcherOverride: Dispatcher | undefined;
  private readonly cepValidator: CepValidator | undefined;
  private readonly retryStore: RetryStore | undefined;
  private state: ClientState | null = null;

  constructor(config: NfseClientConfig) {
    this.ambiente = config.ambiente;
    this.provider = normalizeProvider(config.certificado);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.logger = config.logger ?? noopLogger;
    this.dispatcherOverride = config.dispatcher;
    this.cepValidator = config.cepValidator;
    this.retryStore = config.retryStore;
  }

  async fetchByChave(chaveAcesso: string): Promise<NfseQueryResult> {
    const state = await this.ensureState();
    return fetchByChaveInternal(state.sefin, chaveAcesso);
  }

  async fetchByNsu(params: FetchByNsuParams): Promise<NsuQueryResult> {
    const state = await this.ensureState();
    const { ultimoNsu, ...options } = params;
    return fetchByNsuInternal(state.adn, ultimoNsu, options);
  }

  async emitir(dps: DPS, options?: EmitOptions & { dryRun?: false }): Promise<NfseEmitResult>;
  async emitir(dps: DPS, options: EmitOptions & { dryRun: true }): Promise<DpsDryRunResult>;
  async emitir(dps: DPS, options?: EmitOptions): Promise<NfseEmitResult | DpsDryRunResult> {
    const state = await this.ensureState();
    const merged = this.mergeEmitOptions(options);
    if (options?.dryRun === true) {
      return emitInternal(state.sefin, state.certificate, dps, { ...merged, dryRun: true });
    }
    return emitInternal(state.sefin, state.certificate, dps, { ...merged, dryRun: false });
  }

  /**
   * Emissão em lote: paraleliza `emitir()` para uma lista de DPS (SEFIN não
   * oferece endpoint de batch — a paralelização acontece no cliente). Cada
   * item vira um `EmitLoteItem` com `status: 'success' | 'failure' | 'skipped'`
   * para que o chamador decida como reagir a falhas parciais.
   */
  async emitirEmLote(dpsList: readonly DPS[], options?: EmitManyOptions): Promise<EmitLoteResult> {
    const state = await this.ensureState();
    const mergedCepValidator = options?.cepValidator ?? this.cepValidator;
    const merged: EmitManyOptions = {
      ...(options?.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(options?.stopOnError !== undefined ? { stopOnError: options.stopOnError } : {}),
      ...(options?.skipValidation !== undefined ? { skipValidation: options.skipValidation } : {}),
      ...(options?.skipCepValidation !== undefined
        ? { skipCepValidation: options.skipCepValidation }
        : {}),
      ...(options?.skipCpfCnpjValidation !== undefined
        ? { skipCpfCnpjValidation: options.skipCpfCnpjValidation }
        : {}),
      ...(mergedCepValidator !== undefined ? { cepValidator: mergedCepValidator } : {}),
    };
    return emitManyInternal(state.sefin, state.certificate, dpsList, merged);
  }

  private mergeEmitOptions(options: EmitOptions | undefined): EmitOptions {
    const cepValidator = options?.cepValidator ?? this.cepValidator;
    return {
      ...(options?.skipValidation !== undefined ? { skipValidation: options.skipValidation } : {}),
      ...(options?.skipCepValidation !== undefined
        ? { skipCepValidation: options.skipCepValidation }
        : {}),
      ...(options?.skipCpfCnpjValidation !== undefined
        ? { skipCpfCnpjValidation: options.skipCpfCnpjValidation }
        : {}),
      ...(cepValidator !== undefined ? { cepValidator } : {}),
    };
  }

  /**
   * Cancela uma NFS-e via evento 101101. Cancelamento simples — sem vínculo
   * de substituição. Para substituição use `substituir()`.
   */
  async cancelar(params: CancelarParams): Promise<EventoResult> {
    const state = await this.ensureState();
    return cancelarInternal(state.sefin, state.certificate, params);
  }

  /**
   * Substitui uma NFS-e: emite a nova (com `subst` auto-preenchido se
   * ausente) e cancela a original via evento 105102. Retorna um resultado
   * discriminado sobre `status`:
   *
   *  - `'ok'` — ambas as etapas completaram.
   *  - `'retry_pending'` — emit ok, cancel falhou transitoriamente; gravamos
   *    o pendente em `retryStore` para replay posterior.
   *  - `'rolled_back'` — emit ok, cancel falhou permanentemente; rollback
   *    cancelou a nova via evento 101101. Nota: audit trail fica fragmentado.
   *  - `'rollback_pending'` — pior caso, rollback também falhou; o pendente
   *    de rollback é salvo em `retryStore` para replay.
   *
   * Lança direto apenas quando a emissão (step 1) falha — nesse caso nada
   * foi alterado no SEFIN e o caller pode retentar limpo.
   */
  async substituir(params: SubstituirParams): Promise<SubstituirResult> {
    const state = await this.ensureState();
    const retryStore = params.retryStore ?? this.retryStore;
    const merged: SubstituirParams = {
      ...params,
      ...(retryStore ? { retryStore } : {}),
    };
    return substituirInternal(state.sefin, state.certificate, merged);
  }

  /**
   * Re-POSTs each `PendingEvent` in the store. SEFIN deduplication on
   * (chave + tipoEvento + nPedRegEvento) garante idempotência: itens já
   * processados retornam o mesmo resultado ou uma rejeição determinística.
   * Em sucesso, o item é removido do store. Em falha transiente, permanece.
   * Em falha permanente, também é removido e o erro é retornado no item.
   *
   * Consumidores tipicamente chamam isso em um cron (a cada 1–5 min).
   */
  async replayPendingEvents(override?: RetryStore): Promise<ReplayItem[]> {
    const state = await this.ensureState();
    const store = override ?? this.retryStore;
    if (!store) return [];
    const pending = await store.list();
    const results: ReplayItem[] = [];
    for (const entry of pending) {
      try {
        const r = await postEvento(
          state.sefin,
          state.certificate,
          entry.chaveNfse,
          entry.xmlPedidoAssinado,
          { xmlJaAssinado: true },
        );
        await store.delete(entry.id);
        results.push({ id: entry.id, status: 'success', evento: dropInternal(r) });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const transient = entry.lastError.transient && isRetryableError(error);
        if (!transient) {
          await store.delete(entry.id);
        }
        results.push({
          id: entry.id,
          status: transient ? 'still_pending' : 'failed_permanent',
          error,
        });
      }
    }
    return results;
  }

  async close(): Promise<void> {
    if (this.state?.ownsDispatcher) {
      await this.state.dispatcher.close();
    }
    this.state = null;
  }

  private async ensureState(): Promise<ClientState> {
    if (this.state) return this.state;

    const endpoints = AMBIENTE_ENDPOINTS[this.ambiente];
    // Always load the certificate: mTLS uses it as the client identity, and
    // emission signs the DPS with the same key/cert. When the user injects
    // their own dispatcher (e.g. MockAgent in tests), we skip the Agent build
    // but still need the cert for signing.
    const certificate = await this.provider.load();

    let dispatcher: Dispatcher;
    let ownsDispatcher: boolean;

    if (this.dispatcherOverride) {
      dispatcher = this.dispatcherOverride;
      ownsDispatcher = false;
    } else {
      dispatcher = new Agent({
        allowH2: false,
        connect: {
          key: certificate.keyPem,
          cert: certificate.certPem,
          ALPNProtocols: ['http/1.1'],
        },
      });
      ownsDispatcher = true;
    }

    this.state = {
      dispatcher,
      ownsDispatcher,
      certificate,
      sefin: new HttpClient({
        baseUrl: endpoints.sefin,
        dispatcher,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
      adn: new HttpClient({
        baseUrl: endpoints.adn,
        dispatcher,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
    };
    return this.state;
  }
}
