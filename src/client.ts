import { Agent, type Dispatcher } from 'undici';
import { AMBIENTE_ENDPOINTS, type Ambiente } from './ambiente.js';
import { normalizeProvider } from './certificate/provider.js';
import type { A1Certificate, CertificateInput, CertificateProvider } from './certificate/types.js';
import { fetchByNsu as fetchByNsuInternal } from './dfe/fetch-by-nsu.js';
import type { FetchByNsuOptions, NsuQueryResult } from './dfe/types.js';
import { HttpClient } from './http/client.js';
import { type Logger, noopLogger } from './logging.js';
import type { DPS } from './nfse/domain.js';
import {
  type DpsDryRunResult,
  type EmitLoteResult,
  type EmitManyOptions,
  type NfseEmitResult,
  emit as emitInternal,
  emitMany as emitManyInternal,
} from './nfse/emit.js';
import { fetchByChave as fetchByChaveInternal } from './nfse/fetch-by-chave.js';
import type { NfseQueryResult } from './nfse/types.js';

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
  private state: ClientState | null = null;

  constructor(config: NfseClientConfig) {
    this.ambiente = config.ambiente;
    this.provider = normalizeProvider(config.certificado);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.logger = config.logger ?? noopLogger;
    this.dispatcherOverride = config.dispatcher;
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

  async emitir(dps: DPS): Promise<NfseEmitResult>;
  async emitir(dps: DPS, options: { dryRun: true }): Promise<DpsDryRunResult>;
  async emitir(
    dps: DPS,
    options?: { dryRun?: boolean },
  ): Promise<NfseEmitResult | DpsDryRunResult> {
    const state = await this.ensureState();
    if (options?.dryRun) {
      return emitInternal(state.sefin, state.certificate, dps, { dryRun: true });
    }
    return emitInternal(state.sefin, state.certificate, dps);
  }

  /**
   * Emissão em lote: paraleliza `emitir()` para uma lista de DPS (SEFIN não
   * oferece endpoint de batch — a paralelização acontece no cliente). Cada
   * item vira um `EmitLoteItem` com `status: 'success' | 'failure' | 'skipped'`
   * para que o chamador decida como reagir a falhas parciais.
   */
  async emitirEmLote(dpsList: readonly DPS[], options?: EmitManyOptions): Promise<EmitLoteResult> {
    const state = await this.ensureState();
    return emitManyInternal(state.sefin, state.certificate, dpsList, options);
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
