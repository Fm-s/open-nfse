import { Agent, type Dispatcher } from 'undici';
import { AMBIENTE_ENDPOINTS, type Ambiente } from './ambiente.js';
import type { CepValidator } from './cep/types.js';
import { normalizeProvider } from './certificate/provider.js';
import type { A1Certificate, CertificateInput, CertificateProvider } from './certificate/types.js';
import { fetchDanfse as fetchDanfseInternal } from './danfse/fetch.js';
import { type GerarDanfseOptions, gerarDanfse as gerarDanfseLocal } from './danfse/gerar.js';
import { fetchByNsu as fetchByNsuInternal } from './dfe/fetch-by-nsu.js';
import type { FetchByNsuOptions, NsuQueryResult } from './dfe/types.js';
import { OpenNfseError } from './errors/base.js';
import { NetworkError, ServerError, TimeoutError } from './errors/http.js';
import {
  type CancelarParams,
  type CancelarResult,
  type SubstituirParams,
  type SubstituirResult,
  cancelar as cancelarInternal,
  substituir as substituirInternal,
} from './eventos/cancelar.js';
import { defaultIsTransient } from './eventos/classify-error.js';
import type { EventoResult } from './eventos/post-evento.js';
import { postEvento } from './eventos/post-evento.js';
import { type PendingEvent, type RetryStore, isPendingEmission } from './eventos/retry-store.js';
import { HttpClient } from './http/client.js';
import { type Logger, noopLogger } from './logging.js';
import type { DPS } from './nfse/domain.js';
import type { NFSe } from './nfse/domain.js';
import type { DpsCounter } from './nfse/dps-counter.js';
import {
  type DpsDryRunResult,
  type EmitLoteResult,
  type EmitManyOptions,
  type EmitOptions,
  type EmitirParams,
  type EmitirResult,
  type NfseEmitResult,
  emitDpsPronta as emitDpsProntaInternal,
  emitMany as emitManyInternal,
  emitSeguro,
  replayEmission,
} from './nfse/emit.js';
import { fetchByChave as fetchByChaveInternal } from './nfse/fetch-by-chave.js';
import {
  type DpsStatusResult,
  existsDpsStatus as existsDpsStatusInternal,
  fetchDpsStatus as fetchDpsStatusInternal,
} from './nfse/fetch-dps-status.js';
import type { NfseQueryResult } from './nfse/types.js';
import {
  type ParametrosCache,
  createInMemoryParametrosCache,
} from './parametros-municipais/cache.js';
import {
  type ConsultaOptions,
  fetchAliquota,
  fetchBeneficio,
  fetchConvenio,
  fetchHistoricoAliquotas,
  fetchRegimesEspeciais,
  fetchRetencoes,
} from './parametros-municipais/fetch.js';
import type {
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
} from './parametros-municipais/types.js';

export type ReplayItem =
  | { readonly id: string; readonly status: 'success'; readonly evento: EventoResult }
  | {
      readonly id: string;
      readonly status: 'success_emission';
      readonly emission: NfseEmitResult;
    }
  | { readonly id: string; readonly status: 'still_pending'; readonly error: Error }
  | { readonly id: string; readonly status: 'failed_permanent'; readonly error: Error };

function dropInternal(r: EventoResult & { xmlAssinado: string }): EventoResult {
  const { xmlAssinado: _drop, ...rest } = r;
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
   * Store para eventos pendentes de retry. Necessário para `emitir()` e
   * `substituir()` persistirem falhas transientes/rollbacks. Se omitido, a lib
   * lança `MissingRetryStoreError` quando o caminho transiente é acionado.
   */
  readonly retryStore?: RetryStore;
  /**
   * Provedor atômico do próximo `nDPS`. Obrigatório para `emitir(params)` —
   * o novo fluxo consulta esse provider depois das validações offline
   * passarem. `emitirDpsPronta(dps)` não usa.
   */
  readonly dpsCounter?: DpsCounter;
  /**
   * Cache opcional para respostas da API de Parâmetros Municipais. Se omitido
   * e `useCache` não for `false` em cada chamada, a lib usa um
   * `createInMemoryParametrosCache()` implícito. Para cache compartilhada
   * entre processos, passe uma impl de Redis/Memcached.
   */
  readonly parametrosCache?: ParametrosCache;
}

export interface FetchByNsuParams extends FetchByNsuOptions {
  readonly ultimoNsu: number;
}

interface ClientState {
  readonly dispatcher: Dispatcher;
  readonly sefin: HttpClient;
  readonly adn: HttpClient;
  readonly parametros: HttpClient;
  readonly danfse: HttpClient;
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
  private readonly dpsCounter: DpsCounter | undefined;
  private readonly parametrosCache: ParametrosCache;
  private state: ClientState | null = null;
  private statePromise: Promise<ClientState> | null = null;
  private closed = false;

  constructor(config: NfseClientConfig) {
    this.ambiente = config.ambiente;
    this.provider = normalizeProvider(config.certificado);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.logger = config.logger ?? noopLogger;
    this.dispatcherOverride = config.dispatcher;
    this.cepValidator = config.cepValidator;
    this.retryStore = config.retryStore;
    this.dpsCounter = config.dpsCounter;
    this.parametrosCache = config.parametrosCache ?? createInMemoryParametrosCache();
  }

  async fetchByChave(chaveAcesso: string): Promise<NfseQueryResult> {
    const state = await this.ensureState();
    return fetchByChaveInternal(state.sefin, chaveAcesso);
  }

  /**
   * `GET /dps/{id}` — consulta a chave de acesso da NFS-e a partir de um
   * `infDPS.Id`. Uso primário: **reconciliação pós-timeout**. Quando um
   * `emitir()` não retornou (processo morreu, timeout, crash), mas você tem o
   * `idDps` persistido, essa chamada revela se a Receita chegou a gerar a
   * NFS-e — evita reemissão duplicada.
   *
   * Lança `NotFoundError` se nenhuma NFS-e foi gerada a partir desse idDps
   * (resposta 404 do SEFIN).
   */
  async fetchDpsStatus(idDps: string): Promise<DpsStatusResult> {
    const state = await this.ensureState();
    return fetchDpsStatusInternal(state.sefin, idDps);
  }

  /**
   * `HEAD /dps/{id}` — variante barata de `fetchDpsStatus` que só retorna
   * `true`/`false` sem baixar o corpo. Para reconciliação em lote, prefere
   * esse método e busque os detalhes via `fetchDpsStatus` só nos que existem.
   */
  async existsDpsStatus(idDps: string): Promise<boolean> {
    const state = await this.ensureState();
    return existsDpsStatusInternal(state.sefin, idDps);
  }

  async fetchByNsu(params: FetchByNsuParams): Promise<NsuQueryResult> {
    const state = await this.ensureState();
    const { ultimoNsu, ...options } = params;
    return fetchByNsuInternal(state.adn, ultimoNsu, options);
  }

  /**
   * Emissão segura — fluxo primário. Recebe params de alto nível (sem `nDPS`);
   * a lib consulta o `DpsCounter` configurado **só depois** de todas as
   * validações offline (CPF/CNPJ, XSD, CEP) passarem, de forma que uma DPS
   * quebrada não queima um número da série.
   *
   * Resultado discriminado:
   * - `{ status: 'ok', nfse }` — autorizada.
   * - `{ status: 'retry_pending', pending }` — falha transiente (rede/5xx);
   *   salvo no `RetryStore` para replay via `replayPendingEvents()`.
   *
   * Lança em falhas permanentes (rejeição fiscal, validação offline). Nesses
   * casos o `nDPS` foi consumido mas a nota foi definitivamente rejeitada —
   * o caller loga e segue.
   *
   * Para emitir uma DPS já montada manualmente (bypass counter + retry flow),
   * use `emitirDpsPronta(dps)`.
   */
  async emitir(params: EmitirParams & { dryRun: true }): Promise<DpsDryRunResult>;
  async emitir(params: EmitirParams & { dryRun?: false }): Promise<EmitirResult>;
  async emitir(params: EmitirParams): Promise<EmitirResult | DpsDryRunResult> {
    const state = await this.ensureState();
    const cepValidator = params.cepValidator ?? this.cepValidator;
    const mergedParams: EmitirParams = {
      ...params,
      ...(cepValidator ? { cepValidator } : {}),
    };
    const deps: Parameters<typeof emitSeguro>[0] = {
      httpClient: state.sefin,
      certificate: state.certificate,
      dpsCounter: this.dpsCounter,
      retryStore: this.retryStore,
    };
    if (mergedParams.dryRun === true) {
      return emitSeguro(deps, { ...mergedParams, dryRun: true });
    }
    return emitSeguro(deps, { ...mergedParams, dryRun: false });
  }

  /**
   * Escape hatch — emite uma `DPS` já completamente montada. Não consulta o
   * counter, não usa o `RetryStore`. Falhas viram exceção direta.
   * Útil para replay customizado, testes com nDPS determinístico, ou quando
   * você pré-assina o XML externamente.
   */
  async emitirDpsPronta(
    dps: DPS,
    options?: EmitOptions & { dryRun?: false },
  ): Promise<NfseEmitResult>;
  async emitirDpsPronta(
    dps: DPS,
    options: EmitOptions & { dryRun: true },
  ): Promise<DpsDryRunResult>;
  async emitirDpsPronta(
    dps: DPS,
    options?: EmitOptions,
  ): Promise<NfseEmitResult | DpsDryRunResult> {
    const state = await this.ensureState();
    const merged = this.mergeEmitOptions(options);
    if (options?.dryRun === true) {
      return emitDpsProntaInternal(state.sefin, state.certificate, dps, {
        ...merged,
        dryRun: true,
      });
    }
    return emitDpsProntaInternal(state.sefin, state.certificate, dps, {
      ...merged,
      dryRun: false,
    });
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
   *
   * Retorna resultado discriminado:
   * - `{ status: 'ok', evento }` — cancelamento aceito pela Sefin.
   * - `{ status: 'retry_pending', pending }` — falha transiente; persistido
   *   no `RetryStore` configurado para replay via `replayPendingEvents()`.
   *
   * Lança `ReceitaRejectionError` em rejeições permanentes (prazo expirado,
   * nota já cancelada, regra municipal, etc.) — nesses casos o cancelamento
   * definitivamente não pode proceder sem intervenção manual (outro motivo,
   * análise fiscal, etc.).
   */
  async cancelar(params: CancelarParams): Promise<CancelarResult> {
    const state = await this.ensureState();
    const retryStore = params.retryStore ?? this.retryStore;
    const merged: CancelarParams = {
      ...params,
      ...(retryStore ? { retryStore } : {}),
    };
    return cancelarInternal(state.sefin, state.certificate, merged);
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
        if (isPendingEmission(entry)) {
          // Re-POST direto em /nfse — SEFIN deduplica via infDPS.Id
          const r = await replayEmission(state.sefin, entry.xmlAssinado);
          await store.delete(entry.id);
          results.push({ id: entry.id, status: 'success_emission', emission: r });
        } else {
          // Evento de cancelamento/substituição — re-POST no endpoint de eventos
          const r = await postEvento(
            state.sefin,
            state.certificate,
            entry.chaveNfse,
            entry.xmlAssinado,
            { xmlJaAssinado: true },
          );
          await store.delete(entry.id);
          results.push({ id: entry.id, status: 'success', evento: dropInternal(r) });
        }
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

  // -------------------------------------------------------------------------
  // Parâmetros Municipais — ADN /parametrizacao, read-only, com cache TTL.
  // -------------------------------------------------------------------------

  /** Consulta a alíquota de ISSQN parametrizada para município + serviço + competência. */
  async consultarAliquota(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    options?: ConsultaOptions,
  ): Promise<ConsultaAliquotasResult> {
    const state = await this.ensureState();
    return fetchAliquota(
      state.parametros,
      codigoMunicipio,
      codigoServico,
      competencia,
      this.parametrosCache,
      options,
    );
  }

  /** Histórico completo de alíquotas para município + serviço (independente de competência). */
  async consultarHistoricoAliquotas(
    codigoMunicipio: string,
    codigoServico: string,
    options?: ConsultaOptions,
  ): Promise<ConsultaAliquotasResult> {
    const state = await this.ensureState();
    return fetchHistoricoAliquotas(
      state.parametros,
      codigoMunicipio,
      codigoServico,
      this.parametrosCache,
      options,
    );
  }

  /** Parâmetros de um benefício fiscal municipal (redução, imunidade, alíquota diferenciada, etc.). */
  async consultarBeneficio(
    codigoMunicipio: string,
    numeroBeneficio: string,
    competencia: Date | string,
    options?: ConsultaOptions,
  ): Promise<ConsultaBeneficioResult> {
    const state = await this.ensureState();
    return fetchBeneficio(
      state.parametros,
      codigoMunicipio,
      numeroBeneficio,
      competencia,
      this.parametrosCache,
      options,
    );
  }

  /** Status do convênio do município com a Sefin Nacional. */
  async consultarConvenio(
    codigoMunicipio: string,
    options?: ConsultaOptions,
  ): Promise<ConsultaConvenioResult> {
    const state = await this.ensureState();
    return fetchConvenio(state.parametros, codigoMunicipio, this.parametrosCache, options);
  }

  /** Regimes especiais ativos para município + serviço + competência. */
  async consultarRegimesEspeciais(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    options?: ConsultaOptions,
  ): Promise<ConsultaRegimesEspeciaisResult> {
    const state = await this.ensureState();
    return fetchRegimesEspeciais(
      state.parametros,
      codigoMunicipio,
      codigoServico,
      competencia,
      this.parametrosCache,
      options,
    );
  }

  /** Configuração de retenções de ISSQN do município para uma competência. */
  async consultarRetencoes(
    codigoMunicipio: string,
    competencia: Date | string,
    options?: ConsultaOptions,
  ): Promise<ConsultaRetencoesResult> {
    const state = await this.ensureState();
    return fetchRetencoes(
      state.parametros,
      codigoMunicipio,
      competencia,
      this.parametrosCache,
      options,
    );
  }

  // -------------------------------------------------------------------------
  // DANFSe — PDF gerado local ou baixado do ADN.
  // -------------------------------------------------------------------------

  /**
   * Gera o DANFSe (PDF) para uma NFS-e. Por default tenta baixar o PDF oficial
   * do ADN e, **apenas em falhas transientes** (rede/5xx/timeout), cai no
   * renderer local.
   *
   * Erros de autorização (`ForbiddenError`, `UnauthorizedError`), chave
   * inválida (`InvalidChaveAcessoError`) ou chave inexistente (`NotFoundError`)
   * **não** caem para local — eles sobem para o caller, que tipicamente
   * precisa corrigir (cert expirado, CNPJ sem permissão, typo na chave).
   *
   * Estratégias:
   * - `'auto'` (default) — online-first com fallback local em erros transientes.
   * - `'online'` — só o ADN; lança em qualquer falha.
   * - `'local'` — só o renderer local (offline puro).
   *
   * Quando cair em `'local'`, as opções de layout (`urlConsultaPublica`,
   * `observacoes`, `ambiente`) são aplicadas. No modo online elas são ignoradas.
   */
  async gerarDanfse(
    nfse: NFSe,
    options?: GerarDanfseOptions & { strategy?: 'auto' | 'online' | 'local' },
  ): Promise<Buffer> {
    const strategy = options?.strategy ?? 'auto';
    const state = await this.ensureState();
    if (strategy === 'online') {
      return fetchDanfseInternal(state.danfse, nfse.infNFSe.chaveAcesso);
    }
    if (strategy === 'local') {
      return gerarDanfseLocal(nfse, options);
    }
    try {
      return await fetchDanfseInternal(state.danfse, nfse.infNFSe.chaveAcesso);
    } catch (err) {
      // Só caímos no renderer local quando o ADN está indisponível (rede,
      // timeout, 5xx). Erros de autenticação/autorização/configuração devem
      // propagar — mascará-los com um PDF local degradado esconderia um
      // problema que o caller precisa corrigir (cert expirado, CNPJ sem
      // acesso à nota, etc.).
      if (
        err instanceof NetworkError ||
        err instanceof TimeoutError ||
        err instanceof ServerError
      ) {
        this.logger.warn('danfse.online.fallback', {
          chave: nfse.infNFSe.chaveAcesso,
          error: err.message,
          errorName: err.name,
        });
        return gerarDanfseLocal(nfse, options);
      }
      throw err;
    }
  }

  /**
   * Baixa o DANFSe oficial do ADN (`GET /danfse/{chaveAcesso}`). Só retorna
   * se o PDF veio de fato — erros de rede ou HTTP 4xx/5xx viram exceção.
   * Para fallback automático, use `gerarDanfse(nfse)`.
   */
  async fetchDanfse(chaveAcesso: string): Promise<Buffer> {
    const state = await this.ensureState();
    return fetchDanfseInternal(state.danfse, chaveAcesso);
  }

  /**
   * Libera o dispatcher mTLS (quando a lib construiu um). Idempotente: chamar
   * duas vezes é seguro. Após `close()`, qualquer nova chamada de método do
   * cliente lança `ClientClosedError` — reinstancie o `NfseClient` para voltar
   * a emitir/consultar.
   */
  async close(): Promise<void> {
    this.closed = true;
    const state = this.state;
    this.state = null;
    this.statePromise = null;
    if (state?.ownsDispatcher) {
      await state.dispatcher.close();
    }
  }

  private ensureState(): Promise<ClientState> {
    if (this.closed) {
      return Promise.reject(new ClientClosedError());
    }
    if (this.state) return Promise.resolve(this.state);
    if (this.statePromise) return this.statePromise;
    this.statePromise = this.buildState().catch((err) => {
      // Falha de build (cert corrompido, rede) — limpa o promise para que a
      // próxima chamada possa tentar novamente, ao invés de ficar presa num
      // rejected cached.
      this.statePromise = null;
      throw err;
    });
    return this.statePromise;
  }

  private async buildState(): Promise<ClientState> {
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

    // Se `close()` foi chamado durante o await do provider.load, respeite:
    // não guarde o state e limpe o dispatcher que acabamos de construir.
    if (this.closed) {
      if (ownsDispatcher) await dispatcher.close();
      throw new ClientClosedError();
    }

    const state: ClientState = {
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
      parametros: new HttpClient({
        baseUrl: endpoints.parametrosMunicipais,
        dispatcher,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
      danfse: new HttpClient({
        baseUrl: endpoints.danfse,
        dispatcher,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
    };
    this.state = state;
    return state;
  }
}

/**
 * Lançada quando métodos do cliente são chamados após `close()`. O cliente é
 * single-shot por design — se precisar reconectar, construa um novo
 * `NfseClient`.
 */
export class ClientClosedError extends OpenNfseError {
  constructor() {
    super('NfseClient.close() foi chamado — operações não são mais permitidas nesta instância.');
  }
}
