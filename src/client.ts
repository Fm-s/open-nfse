import { Agent, type Dispatcher } from 'undici';
import { AMBIENTE_ENDPOINTS, type Ambiente } from './ambiente.js';
import type { CepValidator } from './cep/types.js';
import { normalizeProvider } from './certificate/provider.js';
import type { A1Certificate, CertificateInput, CertificateProvider } from './certificate/types.js';
import { consultarDanfse as consultarDanfseInternal } from './danfse/fetch.js';
import { type GerarDanfseOptions, gerarDanfse as gerarDanfseLocal } from './danfse/gerar.js';
import { fetchByNsu as fetchByNsuInternal } from './dfe/fetch-by-nsu.js';
import type { FetchByNsuOptions, NsuQueryResult } from './dfe/types.js';
import { OpenNfseError } from './errors/base.js';
import { NetworkError, NotFoundError, ServerError, TimeoutError } from './errors/http.js';
import { UnreadableAuthorizedNfseError } from './errors/receita.js';
import {
  type CancelarParams,
  type CancelarResult,
  cancelar as cancelarInternal,
  type SubstituirParams,
  type SubstituirResult,
  substituir as substituirInternal,
} from './eventos/cancelar.js';
import type { EventoResult } from './eventos/post-evento.js';
import { postEvento } from './eventos/post-evento.js';
import { signPedRegEventoXml } from './eventos/sign-event.js';
import { HttpClient } from './http/client.js';
import { type Logger, noopLogger } from './logging.js';
import { type BuildDpsParams, buildDps } from './nfse/build-dps.js';
import type { DpsFor, NFSe } from './nfse/domain.js';
import type { DpsCounter } from './nfse/dps-counter.js';
import {
  type DpsDryRunResult,
  type EmitirParams,
  type EmitirResult,
  type EmitLoteOptions,
  type EmitLoteResult,
  type EmitOptions,
  embeddedDpsMatches,
  emitDpsPronta as emitDpsProntaInternal,
  emitMany as emitManyInternal,
  emitSeguro,
  fetchEmissionByDpsStatus,
  type NfseEmitResult,
  replayEmission,
  unreadableAuthorizedNfse,
} from './nfse/emit.js';
import { fetchByChave as fetchByChaveInternal } from './nfse/fetch-by-chave.js';
import {
  type DpsStatusResult,
  existsDpsStatus as existsDpsStatusInternal,
  fetchDpsStatus as fetchDpsStatusInternal,
} from './nfse/fetch-dps-status.js';
import { assertLayout, assertParamsLayout, assertSameLayout, type Layout } from './nfse/layout.js';
import type { NfseQueryResult } from './nfse/types.js';
import {
  createInMemoryParametrosCache,
  type ParametrosCache,
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
import { createDefaultRetryPolicy, makeSafePolicy, type RetryPolicy } from './retry/policy.js';
import {
  isPendingEmission,
  type PendingEmission,
  type PendingEvent,
  type RetryStore,
} from './retry/store.js';
import { defaultIsTransient } from './retry/transient.js';

/**
 * Resultado de cada entrada em `replayPendingEvents`.
 *
 * - `success` — evento aceito.
 * - `success_emission` — emissão autorizada. Com `reconciledFrom` preenchido,
 *   o re-POST foi rejeitado de forma permanente (ex.: E0014 — série/número já
 *   existe; E1235 — schema, após a virada de layout), mas `GET /dps/{id}`
 *   confirmou que a DPS **já tinha** virado NFS-e; `emission` foi montado a
 *   partir de `GET /nfse/{chave}` (`alertas` vazio). `reconciledFrom` é a
 *   rejeição do re-POST.
 * - `success_emission_unreadable` — NFS-e **autorizada** cuja resposta não pôde
 *   ser interpretada; `error` (`UnreadableAuthorizedNfseError`) carrega
 *   `chaveAcesso`/`idDps`/`xmlNfse`. A entrada sai do store. Não reemita.
 * - `still_pending` — falha transiente (do re-POST ou da reconciliação); a
 *   entrada fica no store.
 * - `failed_permanent` — rejeição permanente e nenhuma NFS-e gerada a partir
 *   da DPS (`GET /dps/{id}` → 404), a NFS-e achada nasceu de **outra** DPS
 *   com o mesmo `infDPS.Id` (colisão de numeração; logada em
 *   `nfse.replay.reconcile_mismatch`), ou a reconciliação não pôde ser feita
 *   (falha permanente da consulta, logada em `nfse.replay.reconcile_failed`).
 *   A entrada sai do store; `error` é a rejeição do re-POST.
 */
export type ReplayItem =
  | { readonly id: string; readonly status: 'success'; readonly evento: EventoResult }
  | {
      readonly id: string;
      readonly status: 'success_emission';
      readonly emission: NfseEmitResult;
      /** Rejeição permanente do re-POST que disparou a reconciliação via `GET /dps/{id}`. */
      readonly reconciledFrom?: Error;
    }
  | {
      readonly id: string;
      readonly status: 'success_emission_unreadable';
      readonly error: UnreadableAuthorizedNfseError;
    }
  | { readonly id: string; readonly status: 'still_pending'; readonly error: Error }
  | { readonly id: string; readonly status: 'failed_permanent'; readonly error: Error };

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function dropInternal(r: EventoResult & { xmlAssinado: string }): EventoResult {
  const { xmlAssinado: _drop, ...rest } = r;
  void _drop;
  return rest;
}

function isRetryableError(err: Error): boolean {
  return defaultIsTransient(err);
}

/**
 * Detecta se um XML de evento já foi assinado. Usado em
 * `replayPendingEvents` para resgatar entradas legadas — a v0.7.2/v0.7.3
 * persistia eventos sem assinatura no caminho transiente (bug corrigido
 * em 0.8.0); detectamos e re-assinamos antes do POST para não perder a
 * operação.
 *
 * A detecção checa **três marcadores XMLDSig independentes** para
 * minimizar falso-positivos em dados controlados pelo usuário (xMotivo,
 * por exemplo). Falso-positivo aqui significa "POSTar XML não-assinado
 * achando que está assinado" → SEFIN rejeita → entrada deletada → perda
 * da operação. Vale ser conservador.
 */
function isEventoXmlSigned(xml: string | undefined | null): boolean {
  if (typeof xml !== 'string' || xml.length === 0) return false;
  return (
    xml.includes('http://www.w3.org/2000/09/xmldsig#') &&
    xml.includes('<SignatureValue>') &&
    xml.includes('<X509Certificate>')
  );
}

export interface EmitenteConfig {
  /** CNPJ do emitente (14 caracteres sem máscara; alfanumérico maiúsculo aceito — IN RFB nº 2.229/2024). */
  readonly cnpj: string;
  /** Inscrição Municipal no município emissor. */
  readonly inscricaoMunicipal: string;
  /** Código IBGE do município emissor (7 dígitos). Ex.: `2111300` = São Luís/MA, `3550308` = São Paulo/SP. */
  readonly codigoMunicipio: string;
}

export interface NfseClientConfig<L extends Layout = Layout> {
  /**
   * Layout (leiaute) das DPS que este cliente emite: `'nt004'` (produção) ou
   * `'nt009'` (NT 009). **Obrigatório, sem default.** Tipa os métodos de
   * emissão (`emitir`, `emitirDpsPronta`, `emitirEmLote`, `substituir`) —
   * uma DPS de outro layout não compila, e em runtime (chamador JS) lança
   * `LayoutMismatchError` antes de consumir `nDPS` ou tocar a rede. Os métodos
   * de leitura aceitam documentos de qualquer layout.
   */
  readonly layout: L;
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
  /**
   * Política de retry — decide o `notBefore` para cada erro transiente
   * (respeitando `Retry-After` quando o servidor envia). Se omitida, a
   * lib usa `createDefaultRetryPolicy()` (default 60s para 429/503 sem
   * header, cap de 1h para valores absurdos).
   */
  readonly retryPolicy?: RetryPolicy;
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

export class NfseClient<L extends Layout = Layout> {
  /** Layout configurado (ver `NfseClientConfig.layout`). */
  readonly layout: L;
  private readonly ambiente: Ambiente;
  private readonly provider: CertificateProvider;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly dispatcherOverride: Dispatcher | undefined;
  private readonly cepValidator: CepValidator | undefined;
  private readonly retryStore: RetryStore | undefined;
  private readonly dpsCounter: DpsCounter | undefined;
  private readonly parametrosCache: ParametrosCache;
  private readonly retryPolicy: RetryPolicy;
  private state: ClientState | null = null;
  private statePromise: Promise<ClientState> | null = null;
  private closed = false;

  constructor(config: NfseClientConfig<L>) {
    // Chamadores JS podem omitir ou errar o layout — falha cedo, no construtor.
    this.layout = assertLayout(config.layout) as L;
    this.ambiente = config.ambiente;
    this.provider = normalizeProvider(config.certificado);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.logger = config.logger ?? noopLogger;
    this.dispatcherOverride = config.dispatcher;
    this.cepValidator = config.cepValidator;
    this.retryStore = config.retryStore;
    this.dpsCounter = config.dpsCounter;
    this.parametrosCache = config.parametrosCache ?? createInMemoryParametrosCache();
    // Wrap defensively so a buggy custom policy can't mask the original
    // fiscal error in catch paths. See makeSafePolicy + RetryPolicy contract.
    this.retryPolicy = makeSafePolicy(
      config.retryPolicy ?? createDefaultRetryPolicy(),
      this.logger,
    );
  }

  async fetchByChave(chaveAcesso: string): Promise<NfseQueryResult> {
    const state = await this.ensureState();
    return fetchByChaveInternal(state.sefin, chaveAcesso, this.logger);
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
   * - `{ status: 'retry_pending', pending }` — falha transiente (rede / timeout
   *   / 5xx / 429); salvo no `RetryStore` para replay via `replayPendingEvents()`.
   *
   * Lança em falhas permanentes (rejeição fiscal, validação offline). Nesses
   * casos o `nDPS` foi consumido mas a nota foi definitivamente rejeitada —
   * o caller loga e segue. Exceção: `UnreadableAuthorizedNfseError` = a nota
   * foi **autorizada** mas a resposta não pôde ser interpretada — persista
   * `chaveAcesso`/`xmlNfse` do erro e **não reemita**.
   *
   * Os guards puros (layout divergente vindo de chamador JS, inputs exclusivos
   * do outro layout, regras do `buildDps`) rodam antes de qualquer I/O —
   * inclusive o carregamento do certificado.
   *
   * **Não envolva esta chamada num retry loop próprio para 429 / 5xx.** Cada
   * `emitir()` consome um `nDPS` antes do POST; um wrapper externo que recapta
   * e retenta queima números da série e cria buracos permanentes. A lib já
   * persiste o pendente no `RetryStore` com o XML assinado — o replay re-posta
   * o mesmo `infDPS.Id` (não cria nota nova) e reconcilia via `GET /dps/{id}`
   * uma rejeição E0014/E1235 de DPS já autorizada. Use `replayPendingEvents()`
   * (tipicamente num cron) para retomar.
   *
   * Para emitir uma DPS já montada manualmente (bypass counter + retry flow),
   * use `emitirDpsPronta(dps)`.
   */
  async emitir(params: EmitirParams<L> & { dryRun: true }): Promise<DpsDryRunResult>;
  async emitir(params: EmitirParams<L> & { dryRun?: false }): Promise<EmitirResult<L>>;
  async emitir(params: EmitirParams<L>): Promise<EmitirResult<L> | DpsDryRunResult> {
    // Como emitirDpsPronta/emitirEmLote/substituir: layout antes de qualquer
    // I/O (o provider de certificado pode ser um KMS remoto). O buildDps
    // descartável aplica também os guards do builder — inclusive `ajusteBC`/
    // `ibsCbs` num cliente nt004 — sem tocar rede nem counter.
    assertParamsLayout(this.layout, params);
    buildDps({ ...params, layout: this.layout, nDPS: params.nDPS ?? '1' } as BuildDpsParams);
    const state = await this.ensureState();
    const cepValidator = params.cepValidator ?? this.cepValidator;
    const mergedParams: EmitirParams<L> = {
      ...params,
      ...(cepValidator ? { cepValidator } : {}),
    };
    const deps = {
      httpClient: state.sefin,
      certificate: state.certificate,
      dpsCounter: this.dpsCounter,
      retryStore: this.retryStore,
      retryPolicy: this.retryPolicy,
      layout: this.layout,
      logger: this.logger,
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
   *
   * A DPS precisa ser do layout do cliente — senão `LayoutMismatchError`.
   */
  async emitirDpsPronta(
    dps: DpsFor<L>,
    options?: EmitOptions & { dryRun?: false },
  ): Promise<NfseEmitResult<L>>;
  async emitirDpsPronta(
    dps: DpsFor<L>,
    options: EmitOptions & { dryRun: true },
  ): Promise<DpsDryRunResult>;
  async emitirDpsPronta(
    dps: DpsFor<L>,
    options?: EmitOptions,
  ): Promise<NfseEmitResult<L> | DpsDryRunResult> {
    assertSameLayout(this.layout, dps);
    const state = await this.ensureState();
    const merged = this.mergeEmitOptions(options);
    if (options?.dryRun === true) {
      return emitDpsProntaInternal<L>(
        state.sefin,
        state.certificate,
        dps,
        { ...merged, dryRun: true },
        this.layout,
        this.logger,
      );
    }
    return emitDpsProntaInternal<L>(
      state.sefin,
      state.certificate,
      dps,
      { ...merged, dryRun: false },
      this.layout,
      this.logger,
    );
  }

  /**
   * Emissão em lote: paraleliza `emitirDpsPronta()` para uma lista de DPS já
   * montadas (SEFIN não oferece endpoint de batch — a paralelização acontece
   * no cliente, com cap de concorrência). Cada item vira um `EmitLoteItem`
   * com `status: 'success' | 'failure' | 'skipped'`.
   *
   * **Não usa `DpsCounter` nem `RetryStore`.** Cada DPS deve vir com `nDPS`
   * já preenchido pelo caller, e falhas (incluindo 429 / 5xx) são reportadas
   * como `{ status: 'failure', dps, error }` sem persistência automática.
   * Se o caller quer retry transparente do pipeline `emitir(params)`, ele
   * deve orquestrar `emitir(...)` calls manualmente. Esta API é deliberadamente
   * mais baixa-nível para casos onde o caller já controla o sequencial.
   *
   * Em 429 a falha é capturada como `failure` com `error instanceof
   * TooManyRequestsError`; o caller pode inspecionar `error.getRetryAfterMs()`
   * para decidir quando re-emitir os itens que falharam (mesmo `nDPS`, logo
   * mesmo `infDPS.Id`: uma DPS que na verdade já foi autorizada volta como
   * rejeição E0014 — confira com `fetchDpsStatus(idDps)` antes de tratar como
   * falha).
   *
   * Todas as DPS precisam ser do layout do cliente: um único item de outro
   * layout rejeita o lote inteiro com `LayoutMismatchError` antes do primeiro
   * envio.
   *
   * Item `success_unreadable`: NFS-e **autorizada** cuja resposta não pôde ser
   * interpretada (`error.chaveAcesso`/`error.xmlNfse`) — conta em
   * `successCount`, não aborta o lote (`stopOnError`) e não deve ser reemitida.
   */
  async emitirEmLote(
    dpsList: readonly DpsFor<L>[],
    options?: EmitLoteOptions,
  ): Promise<EmitLoteResult<L>> {
    for (const dps of dpsList) assertSameLayout(this.layout, dps);
    const state = await this.ensureState();
    const mergedCepValidator = options?.cepValidator ?? this.cepValidator;
    const merged: EmitLoteOptions = {
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
    return emitManyInternal<L>(
      state.sefin,
      state.certificate,
      dpsList,
      merged,
      this.layout,
      this.logger,
    );
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
    return cancelarInternal(state.sefin, state.certificate, this.retryPolicy, merged, this.layout);
  }

  /**
   * Substitui uma NFS-e: emite a nova DPS com `infDPS/subst` apontando para a
   * `chaveOriginal` (auto-preenchido se ausente; se a `novaDps` já trouxer
   * `subst`, ele deve ser idêntico a `chaveOriginal`/`cMotivo`/`xMotivo`, senão
   * `RuleViolationError` com rule `infDPS/subst`) via `POST /nfse`. O **Sistema
   * Nacional NFS-e** gera, de forma atômica com a emissão, o evento 105102
   * (Cancelamento por Substituição, autor=MEmis) que cancela a original, e
   * retorna a NFS-e substituta em `{ novaNfse }`.
   *
   * O contribuinte **não** registra um pedRegEvento 105102 (autor=MEmis na
   * planilha Tipo Eventos do Anexo II); a Sefin rejeita o pedido com autor
   * inválido (E0813) e, com o 105102 já vinculado à NFS-e pelo sistema, como
   * redundante (E0845). Ref.: Manual dos Contribuintes — API Sistema Nacional
   * NFS-e v1.2 §1.3.2.
   *
   * Pré-checks locais (lançam `RuleViolationError` antes de qualquer envio):
   * E0078 (`cMotivo=99` exige `xMotivo`), `TSMotivo` (15–255 chars no pattern
   * `TSString`) e E0042 (Cód.Mun./Tipo de Inscrição/Inscrição da chave
   * substituída iguais aos do `infDPS.Id` da nova DPS).
   *
   * Resultado discriminado (igual a `emitir`): `'ok'` (`novaNfse`) ou
   * `'retry_pending'` — falha transiente no `POST /nfse` persistida no
   * `retryStore` para replay via `replayPendingEvents` (dedup por `infDPS.Id`).
   * Rejeição **permanente** (regra fiscal) lança exceção. `novaDps` de outro
   * layout → `LayoutMismatchError` antes de qualquer envio.
   */
  async substituir(params: SubstituirParams<L>): Promise<SubstituirResult<L>> {
    assertSameLayout(this.layout, params.novaDps);
    const state = await this.ensureState();
    const retryStore = params.retryStore ?? this.retryStore;
    const merged: SubstituirParams<L> = {
      ...params,
      ...(retryStore ? { retryStore } : {}),
    };
    return substituirInternal(
      state.sefin,
      state.certificate,
      this.retryPolicy,
      merged,
      this.layout,
      this.logger,
    );
  }

  /**
   * Re-POSTa cada `PendingEvent` do store (ver `ReplayItem` para os status).
   * Em sucesso, o item é removido do store. Em falha transiente, permanece com
   * `lastAttemptAt`/`notBefore`/`attempts` atualizados. Entradas com
   * `notBefore` no futuro são puladas sem aparecer no resultado.
   *
   * **Emissões — reconciliação antes de deletar.** Uma DPS que o SEFIN já
   * converteu em NFS-e (o POST original deu timeout depois do commit) não
   * volta como sucesso no re-POST, e sim como rejeição permanente: E0014
   * (série/número já existe) ou, depois de uma virada de layout, E1235 (schema
   * — o XML `nt004` persistido não valida no `nt009`). Por isso, numa rejeição
   * permanente de emissão a lib consulta `GET /dps/{idDps}` antes de remover a
   * entrada:
   * - NFS-e encontrada → baixa-a (`GET /nfse/{chave}`), confere que a DPS
   *   embutida nela é a persistida (`SignatureValue`, ou `dhEmi` sem
   *   assinatura) e devolve `success_emission` com `reconciledFrom` = a
   *   rejeição;
   * - NFS-e de **outra** DPS com o mesmo `infDPS.Id` (colisão de série/nDPS —
   *   E0014 legítimo) → `failed_permanent` + `warn`
   *   `nfse.replay.reconcile_mismatch`;
   * - 404 → `failed_permanent` (nenhuma NFS-e saiu dessa DPS; reemitir é
   *   seguro);
   * - falha transiente na consulta → `still_pending` (a entrada fica; nunca se
   *   deleta sem saber);
   * - outra falha permanente na consulta → `failed_permanent` com a rejeição
   *   original + `warn` `nfse.replay.reconcile_failed`.
   *
   * Resposta 201 (ou NFS-e baixada na reconciliação) que o parser não consegue
   * ler → `success_emission_unreadable` com `UnreadableAuthorizedNfseError`
   * (a nota existe; a entrada sai do store). Os `warn` do parser
   * (`nfse.parse.unexpected_field`) vão para o `logger` do cliente.
   *
   * **Layout.** O XML é re-POSTado como foi assinado — a lib não converte
   * entre layouts. Uma emissão com `entry.layout` diferente do layout do
   * cliente gera `warn` `nfse.replay.layout_divergente`. Drene o store com o
   * cliente do layout antigo **antes** da virada (ver guia de migração 0.12).
   *
   * **Contrato: single-threaded.** Esta função NÃO é segura para execução
   * concorrente — dois processos chamando-a ao mesmo tempo veriam a mesma
   * lista, retentariam os mesmos itens, e dobrariam o consumo de
   * rate-limit do SEFIN. Garanta exclusão mútua no caller (e.g., um cron
   * single-instance, lock distribuído via Redis se múltiplos workers
   * compartilham o mesmo `RetryStore`).
   *
   * **Cuidado com rotação de certificado.** O XML persistido foi assinado
   * com o certificado A1 vigente no momento da emissão original. Se você
   * rotacionar o certificado (renovação anual, troca de fornecedor) antes
   * que pendentes drenem, a assinatura ainda é tecnicamente válida desde
   * que o certificado antigo não esteja expirado ou revogado. Mas se a
   * janela de validade do antigo passou, SEFIN rejeita a assinatura como
   * permanente → pendente deletado, operação perdida. Drene o RetryStore
   * via `replayPendingEvents` antes de instalar o novo certificado.
   *
   * Consumidores tipicamente chamam isso em um cron a cada 1–5 min.
   */
  async replayPendingEvents(override?: RetryStore): Promise<ReplayItem[]> {
    const state = await this.ensureState();
    const store = override ?? this.retryStore;
    if (!store) return [];
    const pending = await store.list();
    const now = new Date();
    const results: ReplayItem[] = [];
    for (const entry of pending) {
      if (entry.notBefore && entry.notBefore > now) {
        continue; // not yet eligible — skip silently, will reappear next sweep
      }
      if (isPendingEmission(entry)) {
        results.push(await this.replayEmissionEntry(state, store, entry));
        continue;
      }
      try {
        // Evento de cancelamento/substituição — re-POST no endpoint de eventos.
        // Defensivo: entradas persistidas em 0.7.2/0.7.3 podem ter sido
        // gravadas com XML não-assinado (bug corrigido em 0.8.0). Detectamos
        // e re-assinamos para não perder a operação — re-assinar é seguro
        // porque SEFIN deduplica por (chave + tipoEvento)
        // independente da assinatura.
        let xmlToPost = entry.xmlAssinado;
        if (!isEventoXmlSigned(xmlToPost)) {
          this.logger.warn(
            'Pending event entry sem XMLDSig — re-assinando antes do replay (provavelmente dado legado de v0.7.x; pré-fix). Considere drenar o RetryStore antes de atualizar para evitar este caminho.',
            {
              id: entry.id,
              chaveNfse: entry.chaveNfse,
              tipoEvento: entry.tipoEvento,
            },
          );
          try {
            xmlToPost = signPedRegEventoXml(xmlToPost, state.certificate);
          } catch (signErr) {
            // Re-sign failed (malformed legacy XML, cert problem, etc.).
            // Continue with the unsigned bytes — SEFIN will reject as a
            // permanent signature error and the catch below will delete
            // the entry. This is no worse than pre-rescue behavior; the
            // error log gives the consumer a chance to investigate the
            // specific entry before it disappears.
            this.logger.error(
              'Re-assinatura do XML legado falhou — POSTando bytes originais; SEFIN provavelmente rejeitará como permanente e a entrada será deletada do RetryStore.',
              {
                id: entry.id,
                signError: signErr instanceof Error ? signErr.message : String(signErr),
                signErrorName: signErr instanceof Error ? signErr.name : 'unknown',
              },
            );
          }
        }
        const r = await postEvento(state.sefin, state.certificate, entry.chaveNfse, xmlToPost, {
          xmlJaAssinado: true,
        });
        await store.delete(entry.id);
        results.push({ id: entry.id, status: 'success', evento: dropInternal(r) });
      } catch (err) {
        const error = toError(err);
        if (entry.lastError.transient && isRetryableError(error)) {
          await this.keepPending(store, entry, error);
          results.push({ id: entry.id, status: 'still_pending', error });
        } else {
          await store.delete(entry.id);
          results.push({ id: entry.id, status: 'failed_permanent', error });
        }
      }
    }
    return results;
  }

  /** Replay de uma emissão pendente — ver `replayPendingEvents`. */
  private async replayEmissionEntry(
    state: ClientState,
    store: RetryStore,
    entry: PendingEmission,
  ): Promise<ReplayItem> {
    if (entry.layout !== undefined && entry.layout !== this.layout) {
      this.logger.warn('nfse.replay.layout_divergente', {
        id: entry.id,
        entryLayout: entry.layout,
        clientLayout: this.layout,
      });
    }
    let rejection: Error;
    try {
      const emission = await replayEmission(state.sefin, entry.xmlAssinado, this.logger);
      await store.delete(entry.id);
      return { id: entry.id, status: 'success_emission', emission };
    } catch (err) {
      if (err instanceof UnreadableAuthorizedNfseError) {
        // Autorizada (201) mas ilegível: a nota existe — sai do store.
        await store.delete(entry.id);
        return { id: entry.id, status: 'success_emission_unreadable', error: err };
      }
      const error = toError(err);
      if (entry.lastError.transient && isRetryableError(error)) {
        await this.keepPending(store, entry, error);
        return { id: entry.id, status: 'still_pending', error };
      }
      rejection = error;
    }
    return this.reconcileRejectedEmission(state, store, entry, rejection);
  }

  /**
   * Rejeição permanente no re-POST de uma emissão: antes de deletar, pergunta
   * ao SEFIN (`GET /dps/{id}`) se a DPS já virou NFS-e — o caso clássico é o
   * POST original que deu timeout depois do commit (re-POST → E0014, ou E1235
   * depois da virada de layout).
   */
  private async reconcileRejectedEmission(
    state: ClientState,
    store: RetryStore,
    entry: PendingEmission,
    rejection: Error,
  ): Promise<ReplayItem> {
    let status: DpsStatusResult;
    try {
      status = await fetchDpsStatusInternal(state.sefin, entry.idDps);
    } catch (err) {
      const lookupError = toError(err);
      if (lookupError instanceof NotFoundError) {
        // Nenhuma NFS-e gerada a partir desta DPS: rejeição definitiva.
        await store.delete(entry.id);
        return { id: entry.id, status: 'failed_permanent', error: rejection };
      }
      if (isRetryableError(lookupError)) {
        // Sem saber se a nota existe, não deleta.
        this.logger.warn('nfse.replay.reconcile_pending', {
          id: entry.id,
          rejection: rejection.message,
          error: lookupError.message,
        });
        await this.keepPending(store, entry, lookupError);
        return { id: entry.id, status: 'still_pending', error: lookupError };
      }
      this.logger.warn('nfse.replay.reconcile_failed', {
        id: entry.id,
        idDps: entry.idDps,
        rejection: rejection.message,
        error: lookupError.message,
        errorName: lookupError.name,
      });
      await store.delete(entry.id);
      return { id: entry.id, status: 'failed_permanent', error: rejection };
    }

    try {
      const emission = await fetchEmissionByDpsStatus(state.sefin, status, this.logger);
      const mismatch = await this.rejectForeignNfse(store, entry, rejection, emission);
      if (mismatch) return mismatch;
      await store.delete(entry.id);
      this.logger.info('nfse.replay.reconciled', {
        id: entry.id,
        chaveAcesso: emission.chaveAcesso,
        rejection: rejection.message,
      });
      return { id: entry.id, status: 'success_emission', emission, reconciledFrom: rejection };
    } catch (err) {
      if (err instanceof UnreadableAuthorizedNfseError) {
        const mismatch = await this.rejectForeignNfse(store, entry, rejection, err);
        if (mismatch) return mismatch;
        await store.delete(entry.id);
        return { id: entry.id, status: 'success_emission_unreadable', error: err };
      }
      const fetchError = toError(err);
      if (isRetryableError(fetchError)) {
        await this.keepPending(store, entry, fetchError);
        return { id: entry.id, status: 'still_pending', error: fetchError };
      }
      // GET /dps confirmou a NFS-e, mas o XML não pôde ser baixado: a nota
      // existe — reporta com a chave em vez de failed_permanent.
      const error = unreadableAuthorizedNfse(
        {
          chaveAcesso: status.chaveAcesso,
          idDps: status.idDps,
          tipoAmbiente: status.tipoAmbiente,
          versaoAplicativo: status.versaoAplicativo,
          dataHoraProcessamento: status.dataHoraProcessamento,
          cause: fetchError,
        },
        this.logger,
      );
      await store.delete(entry.id);
      return { id: entry.id, status: 'success_emission_unreadable', error };
    }
  }

  /**
   * Reconciliação: a NFS-e baixada nasceu de outra DPS com o mesmo
   * `infDPS.Id`? (E0014 legítimo — série/nDPS reaproveitados.) Nesse caso a
   * entrada sai como `failed_permanent` com a rejeição do re-POST: o serviço
   * pendente **não** foi faturado. Sem XML ou sem como comparar, confia no
   * `GET /dps` (devolve `undefined`).
   */
  private async rejectForeignNfse(
    store: RetryStore,
    entry: PendingEmission,
    rejection: Error,
    found: { readonly chaveAcesso: string; readonly xmlNfse?: string | undefined },
  ): Promise<ReplayItem | undefined> {
    if (found.xmlNfse === undefined) return undefined;
    if (embeddedDpsMatches(found.xmlNfse, entry.xmlAssinado) !== false) return undefined;
    this.logger.warn('nfse.replay.reconcile_mismatch', {
      id: entry.id,
      idDps: entry.idDps,
      chaveAcesso: found.chaveAcesso,
      rejection: rejection.message,
    });
    await store.delete(entry.id);
    return { id: entry.id, status: 'failed_permanent', error: rejection };
  }

  /**
   * Mantém a entrada no store após uma falha transiente no replay.
   *
   * Always refresh `lastAttemptAt` so observability/audit queries reflect the
   * most recent attempt. Increment `attempts` so policies doing
   * exponential/linear backoff see the right count. Recompute `notBefore`
   * from the fresh error — when the policy returns `undefined` (NetworkError,
   * TimeoutError, generic 5xx without a Retry-After header), preserve the
   * previous `notBefore` (which is necessarily in the past at this point).
   * Same id, idempotent save.
   */
  private async keepPending(store: RetryStore, entry: PendingEvent, error: Error): Promise<void> {
    const newAttemptAt = new Date();
    // Defesa contra entry.attempts corrompido (NaN/Infinity/negativo
    // vindo de um RetryStore que não respeitou o contrato do tipo).
    // Se inválido, tratamos como "primeira tentativa registrada" (= 1)
    // e o incremento abaixo leva para 2.
    const prevAttempts =
      typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) && entry.attempts >= 1
        ? entry.attempts
        : 1;
    const newAttempts = prevAttempts + 1;
    // firstAttemptAt pode estar undefined em entrada corrompida —
    // fallback para o `now` atual para que o RetryContext não
    // propague undefined para policies customizadas.
    const newNotBefore = this.retryPolicy.computeNotBefore(error, newAttemptAt, {
      attempt: newAttempts,
      firstAttemptAt: entry.firstAttemptAt ?? newAttemptAt,
    });
    await store.save({
      ...entry,
      lastAttemptAt: newAttemptAt,
      attempts: newAttempts,
      ...(newNotBefore ? { notBefore: newNotBefore } : {}),
    });
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
   * Gera o DANFSe (PDF) para uma NFS-e. Por default usa o **renderer local**
   * (offline puro) — a NT 008/2026 suspende a API oficial de geração do
   * DANFSe em **03/08/2026**; a geração passa a ser responsabilidade dos
   * sistemas emissores.
   *
   * Estratégias:
   * - `'local'` (default) — só o renderer local (offline puro).
   * - `'auto'` — **deprecated (NT 008)**: online-first com fallback local em
   *   erros transientes (rede/5xx/timeout). Após 03/08/2026 o caminho online
   *   falha sempre e toda chamada paga um round-trip perdido antes do
   *   fallback.
   * - `'online'` — **deprecated (NT 008)**: só o ADN; lança em qualquer
   *   falha. Após 03/08/2026 falha sempre.
   *
   * No caminho online, erros de autorização (`ForbiddenError`,
   * `UnauthorizedError`), chave inválida (`InvalidChaveAcessoError`) ou chave
   * inexistente (`NotFoundError`) **não** caem para local — eles sobem para o
   * caller, que tipicamente precisa corrigir (cert expirado, CNPJ sem
   * permissão, typo na chave).
   *
   * As opções de layout (`urlConsultaPublica`, `observacoes`, `ambiente`) são
   * aplicadas apenas pelo renderer local; no caminho online são ignoradas.
   */
  async gerarDanfse(
    nfse: NFSe,
    options?: GerarDanfseOptions & { strategy?: 'auto' | 'online' | 'local' },
  ): Promise<Buffer> {
    const strategy = options?.strategy ?? 'local';
    const state = await this.ensureState();
    if (strategy === 'local') {
      return gerarDanfseLocal(nfse, options);
    }
    this.warnDanfseOnlineDeprecated(strategy);
    if (strategy === 'online') {
      return consultarDanfseInternal(state.danfse, nfse.infNFSe.chaveAcesso);
    }
    try {
      return await consultarDanfseInternal(state.danfse, nfse.infNFSe.chaveAcesso);
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
   *
   * @deprecated A NT 008/2026 suspende a API oficial de geração do DANFSe em
   * **03/08/2026** — após essa data este método falha sempre. Use
   * `gerarDanfse(nfse)` (renderer local, default desde v0.10.1). Mantido até
   * a remoção do endpoint para quem ainda precisa do PDF oficial do ADN.
   */
  async consultarDanfse(chaveAcesso: string): Promise<Buffer> {
    this.warnDanfseOnlineDeprecated('online');
    const state = await this.ensureState();
    return consultarDanfseInternal(state.danfse, chaveAcesso);
  }

  // NT 008/2026: caminho online do DANFSe morre em 03/08/2026 — avisar quem
  // ainda depende dele antes que vire erro em produção.
  private warnDanfseOnlineDeprecated(strategy: 'auto' | 'online'): void {
    this.logger.warn('danfse.online.deprecated', {
      strategy,
      motivo: 'NT 008/2026 — API oficial de geração do DANFSe suspensa em 2026-08-03',
      acao: "use gerarDanfse(nfse) com o renderer local (strategy 'local', default)",
    });
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
