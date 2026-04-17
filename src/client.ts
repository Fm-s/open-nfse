import { Agent, type Dispatcher } from 'undici';
import { AMBIENTE_ENDPOINTS, type Ambiente } from './ambiente.js';
import { normalizeProvider } from './certificate/provider.js';
import type { CertificateInput, CertificateProvider } from './certificate/types.js';
import { fetchByNsu as fetchByNsuInternal } from './dfe/fetch-by-nsu.js';
import type { FetchByNsuOptions, NsuQueryResult } from './dfe/types.js';
import { HttpClient } from './http/client.js';
import { type Logger, noopLogger } from './logging.js';
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

  async close(): Promise<void> {
    if (this.state?.ownsDispatcher) {
      await this.state.dispatcher.close();
    }
    this.state = null;
  }

  private async ensureState(): Promise<ClientState> {
    if (this.state) return this.state;

    const endpoints = AMBIENTE_ENDPOINTS[this.ambiente];
    let dispatcher: Dispatcher;
    let ownsDispatcher: boolean;

    if (this.dispatcherOverride) {
      dispatcher = this.dispatcherOverride;
      ownsDispatcher = false;
    } else {
      const cert = await this.provider.load();
      dispatcher = new Agent({
        allowH2: false,
        connect: {
          key: cert.keyPem,
          cert: cert.certPem,
          ALPNProtocols: ['http/1.1'],
        },
      });
      ownsDispatcher = true;
    }

    this.state = {
      dispatcher,
      ownsDispatcher,
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
