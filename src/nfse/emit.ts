import { TipoAmbiente } from '../ambiente.js';
import type { CepValidator } from '../cep/types.js';
import type { A1Certificate } from '../certificate/types.js';
import { NetworkError } from '../errors/http.js';
import {
  type MensagemProcessamento,
  ReceitaRejectionError,
  receitaRejectionFromPostError,
  UnreadableAuthorizedNfseError,
} from '../errors/receita.js';
import { LayoutMismatchError } from '../errors/validation.js';
import { validateCnpj, validateCpf } from '../fiscal/validate-cpf-cnpj.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import type { Logger } from '../logging.js';
import type { RetryPolicy } from '../retry/policy.js';
import {
  MissingRetryStoreError,
  type PendingEmission,
  pendingEmissionId,
  type RetryStore,
} from '../retry/store.js';
import { defaultIsTransient } from '../retry/transient.js';
import { parseXml, TEXT_NODE, type XmlNode, type XmlObject } from '../xml/parser.js';
import { type BuildDpsParamsFor, buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import { collectCepsFromDps, collectIdentifiersFromDps } from './collect-from-dps.js';
import type { DPS, DpsFor, NfseFor } from './domain.js';
import { type DpsCounter, MissingDpsCounterError } from './dps-counter.js';
import type { DpsStatusResult } from './fetch-dps-status.js';
import { assertParamsLayout, assertSameLayout, type Layout } from './layout.js';
import { parseNfseXml } from './parse-xml.js';
import { signDpsXml } from './sign-xml.js';
import { validateDpsXml } from './validate-xml.js';

export interface EmitOptions {
  /**
   * Quando `true`, a pipeline só constrói e assina o XML — sem enviar para a
   * Receita. Útil para previews, testes locais e inspeção offline.
   */
  readonly dryRun?: boolean;
  /**
   * Pula a validação XSD local (RTC v1.01) antes de assinar. Default `false`.
   * A validação roda antes da assinatura: se o XML estiver malformado, o erro
   * aparece localmente com linha + descrição ao invés de virar rejeição da
   * Receita depois de um round-trip. Só desligue para debugging ou quando
   * estiver intencionalmente gerando XML fora do padrão.
   */
  readonly skipValidation?: boolean;
  /**
   * Pula a validação de CEP (formato + lookup na API externa). Default
   * `false`. Quando habilitada, cada endereço da DPS (prest/toma/interm/obra/
   * atvEvento/RTC-dest/fornec) é verificado — a API default é o ViaCEP.
   */
  readonly skipCepValidation?: boolean;
  /**
   * Pula a validação de dígito verificador de CPF/CNPJ. Default `false`.
   * Apenas identificadores do tipo CNPJ e CPF são validados; NIF e cNaoNIF
   * são ignorados (não têm DV brasileiro).
   */
  readonly skipCpfCnpjValidation?: boolean;
  /**
   * Validador de CEP custom. Se omitido, o validador default (ViaCEP) é
   * usado. Passe um custom para usar outra API, banco local ou mock em tests.
   */
  readonly cepValidator?: CepValidator;
}

/** Resultado do modo dry-run — retorna o XML assinado sem enviar. */
export interface DpsDryRunResult {
  readonly dryRun: true;
  readonly xmlDpsAssinado: string;
  readonly xmlDpsGZipB64: string;
}

/**
 * Resultado do POST /nfse síncrono. `L` estreita `nfse` ao layout do cliente
 * (`NfseClient<'nt009'>` → `NfseNt009`); sem argumento é a união `NFSe`. O
 * estreitamento é checado em runtime: uma NFS-e retornada de outro layout que
 * a DPS enviada vira `UnreadableAuthorizedNfseError` (nunca um DTO mal tipado).
 */
export interface NfseEmitResult<L extends Layout = Layout> {
  readonly dryRun?: false;
  readonly chaveAcesso: string;
  readonly idDps: string;
  readonly xmlNfse: string;
  readonly nfse: NfseFor<L>;
  readonly alertas: readonly MensagemProcessamento[];
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}

interface SefinPostSuccessBody {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly idDps: string;
  readonly chaveAcesso: string;
  readonly nfseXmlGZipB64: string;
  readonly alertas?: readonly Partial<MensagemProcessamento>[];
}

interface SefinPostErrorBody {
  readonly tipoAmbiente?: 1 | 2;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: string;
  readonly idDPS?: string;
  readonly erros?: readonly Partial<MensagemProcessamento>[];
}

type SefinPostBody = SefinPostSuccessBody | SefinPostErrorBody;

/**
 * Escape hatch para quando você já tem um `DPS` completo e quer controlar
 * inteiramente a pipeline. `nDPS` precisa estar preenchido; o counter do
 * cliente **não** é chamado. Sem tratamento transiente — falhas de rede
 * viram exceção.
 *
 * O caminho padrão é `emitSeguro` / `NfseClient.emitir(params)`.
 *
 * `expectedLayout` (passado pelo `NfseClient`) rejeita com
 * `LayoutMismatchError` uma DPS de outro layout antes de qualquer trabalho.
 * `logger` recebe os `warn` do parser (`nfse.parse.unexpected_field`).
 *
 * NFS-e autorizada cuja resposta não pode ser interpretada →
 * `UnreadableAuthorizedNfseError` (carrega `chaveAcesso`/`xmlNfse`; não reemita).
 */
export async function emitDpsPronta<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DpsFor<L>,
  options: EmitOptions & { dryRun: true },
  expectedLayout?: Layout,
  logger?: Logger,
): Promise<DpsDryRunResult>;
export async function emitDpsPronta<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DpsFor<L>,
  options?: EmitOptions & { dryRun?: false },
  expectedLayout?: Layout,
  logger?: Logger,
): Promise<NfseEmitResult<L>>;
export async function emitDpsPronta<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DpsFor<L>,
  options?: EmitOptions,
  expectedLayout?: Layout,
  logger?: Logger,
): Promise<NfseEmitResult<L> | DpsDryRunResult> {
  if (expectedLayout !== undefined) assertSameLayout(expectedLayout, dps);
  // Pré-validações, em ordem de custo crescente: primeiro as sync baratas
  // (CPF/CNPJ DV), depois as locais pesadas (XSD contra a RTC v1.01), por
  // último o lookup externo de CEP — que pode bater em viacep.com.br.
  if (!options?.skipCpfCnpjValidation) {
    runIdentifierValidation(dps);
  }
  const xmlUnsigned = buildDpsXml(dps);
  if (!options?.skipValidation) {
    await validateDpsXml(xmlUnsigned, { layout: dps.layout });
  }
  if (!options?.skipCepValidation) {
    await runCepValidation(dps, options?.cepValidator);
  }
  const xmlSigned = signDpsXml(xmlUnsigned, certificate);
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSigned);

  if (options?.dryRun) {
    return { dryRun: true, xmlDpsAssinado: xmlSigned, xmlDpsGZipB64: dpsXmlGZipB64 };
  }

  const body = await httpClient.post<SefinPostBody | undefined>(
    '/nfse',
    { dpsXmlGZipB64 },
    { acceptedStatuses: [400] },
  );

  return toEmitResult(successBodyOrThrow(body), dps.layout as L, logger);
}

/**
 * Como `emitDpsPronta`, mas com resiliência a transientes: em vez de lançar
 * num erro transiente (rede/timeout/5xx/429), persiste uma `PendingEmission`
 * no `retryStore` e retorna `retry_pending` (replay via `replayPendingEvents`).
 * Rejeição permanente continua lançando. É o caminho usado por `substituir`
 * (a DPS já vem pronta, com `nDPS` explícito — não há counter envolvido).
 */
export async function emitDpsProntaSeguro<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dps: DpsFor<L>,
  deps: {
    readonly retryStore: RetryStore | undefined;
    readonly retryPolicy: RetryPolicy;
    readonly isTransient?: (err: unknown) => boolean;
    /** Layout do cliente: DPS de outro layout → `LayoutMismatchError` antes de qualquer trabalho. */
    readonly expectedLayout?: Layout;
    /** Recebe os `warn` do parser da NFS-e retornada. */
    readonly logger?: Logger;
  },
  options?: Omit<EmitOptions, 'dryRun'>,
): Promise<EmitirResult<L>> {
  if (deps.expectedLayout !== undefined) assertSameLayout(deps.expectedLayout, dps);
  const isTransient = deps.isTransient ?? defaultIsTransient;

  if (!options?.skipCpfCnpjValidation) {
    runIdentifierValidation(dps);
  }
  const xmlUnsigned = buildDpsXml(dps);
  if (!options?.skipValidation) {
    await validateDpsXml(xmlUnsigned, { layout: dps.layout });
  }
  if (!options?.skipCepValidation) {
    await runCepValidation(dps, options?.cepValidator);
  }
  const xmlSigned = signDpsXml(xmlUnsigned, certificate);
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSigned);

  // O parsing da NFS-e fica FORA deste try: depois de um 201 a nota existe, e
  // nenhuma falha de leitura pode cair no caminho transiente/RetryStore.
  let success: SefinPostSuccessBody;
  try {
    const body = await httpClient.post<SefinPostBody | undefined>(
      '/nfse',
      { dpsXmlGZipB64 },
      { acceptedStatuses: [400] },
    );
    success = successBodyOrThrow(body);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isTransient(error)) {
      if (!deps.retryStore) throw new MissingRetryStoreError();
      const now = new Date();
      const notBefore = deps.retryPolicy.computeNotBefore(error, now, {
        attempt: 1,
        firstAttemptAt: now,
      });
      const ident = dps.infDPS.prest.identificador;
      const pending: PendingEmission = {
        id: pendingEmissionId(dps.infDPS.Id),
        kind: 'emission',
        layout: dps.layout,
        idDps: dps.infDPS.Id,
        emitenteCnpj: 'CNPJ' in ident ? ident.CNPJ : '',
        serie: dps.infDPS.serie,
        nDPS: dps.infDPS.nDPS,
        xmlAssinado: xmlSigned,
        firstAttemptAt: now,
        lastAttemptAt: now,
        attempts: 1,
        ...(notBefore ? { notBefore } : {}),
        lastError: {
          message: error.message,
          errorName: error.name,
          transient: true,
        },
      };
      await deps.retryStore.save(pending);
      return { status: 'retry_pending', pending, error };
    }
    throw error;
  }
  return { status: 'ok', nfse: toEmitResult(success, dps.layout as L, deps.logger) };
}

function isSuccessBody(body: SefinPostBody): body is SefinPostSuccessBody {
  return (
    typeof (body as SefinPostSuccessBody).chaveAcesso === 'string' &&
    typeof (body as SefinPostSuccessBody).nfseXmlGZipB64 === 'string'
  );
}

/**
 * Chave de acesso de um corpo sem a forma completa de sucesso (ex.:
 * `nfseXmlGZipB64` nulo, ou `ChaveAcesso` em PascalCase por um proxy). Só a
 * SEFIN atribui chave, e só a uma NFS-e gerada — então o corpo atesta uma
 * nota autorizada, ainda que ilegível.
 */
function chaveAutorizada(body: object): string | undefined {
  const b = body as Record<string, unknown>;
  const chave = b.chaveAcesso ?? b.ChaveAcesso;
  return typeof chave === 'string' && chave.length > 0 ? chave : undefined;
}

/**
 * Classifica a resposta do `POST /nfse`: corpo de sucesso → devolvido (o
 * parsing da NFS-e é feito à parte por `toEmitResult`, fora do caminho de
 * retry); 400 com corpo de rejeição → lança `ReceitaRejectionError` (regra de
 * negócio). Corpo sem mensagens de erro mas com chave de acesso → tratado como
 * sucesso (a nota existe; o XML ausente vira `UnreadableAuthorizedNfseError`
 * em `toEmitResult`). Corpo vazio → `NetworkError` (transiente: o resultado é
 * desconhecido, então `emitSeguro` persiste e o replay reconcilia via
 * `GET /dps/{id}`). Corpo de erro irreconhecível cai num
 * `ReceitaRejectionError('UNKNOWN')` com o JSON bruto. Único ponto de verdade
 * — `emitDpsPronta`, `emitSeguro` e `replayEmission` compartilham esta
 * classificação.
 */
function successBodyOrThrow(body: SefinPostBody | null | undefined): SefinPostSuccessBody {
  if (body == null || typeof body !== 'object') {
    throw new NetworkError(
      'POST /nfse respondeu sem corpo — a NFS-e pode ter sido gerada; reconcilie por GET /dps/{id}',
    );
  }
  if (isSuccessBody(body)) return body;
  const rejection = receitaRejectionFromPostError(body);
  if (rejection) throw rejection;
  const chave = chaveAutorizada(body);
  if (chave !== undefined) {
    // nfseXmlGZipB64 inválido falha na decodificação dentro de toEmitResult.
    return { ...(body as SefinPostSuccessBody), chaveAcesso: chave };
  }
  throw new ReceitaRejectionError({
    mensagens: [
      {
        codigo: 'UNKNOWN',
        descricao: `Corpo de erro sem mensagens reconhecíveis: ${JSON.stringify(body)}`,
      },
    ],
  });
}

/**
 * Converte o corpo de sucesso (NFS-e **já autorizada**) em `NfseEmitResult`.
 * Qualquer falha ao decodificar/parsear o XML — ou NFS-e de layout diferente de
 * `expectedLayout` (o da DPS enviada) — vira `UnreadableAuthorizedNfseError`
 * com `chaveAcesso`/`idDps`/`xmlNfse`, para o caller nunca tratar uma nota
 * existente como emissão falha. `expectedLayout` omitido (replay: o store pode
 * ter pendentes de outro layout) devolve a união.
 */
function toEmitResult<L extends Layout>(
  body: SefinPostSuccessBody,
  expectedLayout: L | undefined,
  logger: Logger | undefined,
  options?: { readonly logUnreadable?: boolean },
): NfseEmitResult<L> {
  const meta = {
    chaveAcesso: body.chaveAcesso,
    idDps: body.idDps,
    alertas: (body.alertas ?? []).flatMap(normalizeAlerta),
    tipoAmbiente: body.tipoAmbiente === 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
    versaoAplicativo: body.versaoAplicativo,
    dataHoraProcessamento: new Date(body.dataHoraProcessamento),
  };
  let xmlNfse: string | undefined;
  try {
    xmlNfse = gzipBase64DecodeToText(body.nfseXmlGZipB64);
    const nfse = parseNfseXml(xmlNfse, logger ? { logger } : undefined);
    if (expectedLayout !== undefined && nfse.layout !== expectedLayout) {
      throw new LayoutMismatchError(expectedLayout, nfse.layout);
    }
    // Estreitamento checado logo acima (ou L = Layout quando não há expectativa).
    return { ...meta, xmlNfse, nfse: nfse as NfseFor<L> };
  } catch (cause) {
    const dadosNota = { ...meta, ...(xmlNfse !== undefined ? { xmlNfse } : {}), cause };
    throw options?.logUnreadable === false
      ? new UnreadableAuthorizedNfseError(dadosNota)
      : unreadableAuthorizedNfse(dadosNota, logger);
  }
}

/** Monta o `UnreadableAuthorizedNfseError` e o registra em `error` (a nota existe). */
export function unreadableAuthorizedNfse(
  options: ConstructorParameters<typeof UnreadableAuthorizedNfseError>[0],
  logger: Logger | undefined,
): UnreadableAuthorizedNfseError {
  const error = new UnreadableAuthorizedNfseError(options);
  logUnreadableAuthorizedNfse(error, logger);
  return error;
}

/** `error` `nfse.emit.authorized_unreadable` — só depois de saber que a nota é desta DPS. */
export function logUnreadableAuthorizedNfse(
  error: UnreadableAuthorizedNfseError,
  logger: Logger | undefined,
): void {
  logger?.error('nfse.emit.authorized_unreadable', {
    chaveAcesso: error.chaveAcesso,
    idDps: error.idDps,
    error: error.cause instanceof Error ? error.cause.message : String(error.cause),
  });
}

// ---------------------------------------------------------------------------
// Emissão em lote — SEFIN não tem endpoint de batch; paralelizamos no cliente.
// ---------------------------------------------------------------------------

export interface EmitLoteOptions {
  /** Máximo de requisições concorrentes. Default: 4. */
  readonly concurrency?: number;
  /**
   * Interromper o lote assim que uma DPS falhar. As DPS ainda não processadas
   * aparecem no resultado com `status: 'skipped'`. Default: `false` (coletar
   * todas e deixar o caller decidir como reagir).
   */
  readonly stopOnError?: boolean;
  /** Propagado para cada `emitDpsPronta()` do lote. Ver `EmitOptions.skipValidation`. */
  readonly skipValidation?: boolean;
  /** Propagado. Ver `EmitOptions.skipCepValidation`. */
  readonly skipCepValidation?: boolean;
  /** Propagado. Ver `EmitOptions.skipCpfCnpjValidation`. */
  readonly skipCpfCnpjValidation?: boolean;
  /**
   * Validador de CEP compartilhado pelo lote. Crie uma instância única com
   * cache externo para deduplicar lookups entre as DPS. Ver `createViaCepValidator`.
   */
  readonly cepValidator?: CepValidator;
}

/**
 * Item do lote. `success_unreadable` = NFS-e **autorizada** cuja resposta não
 * pôde ser interpretada (`error.chaveAcesso`/`error.xmlNfse`) — não é falha,
 * não reemita.
 */
export type EmitLoteItem<L extends Layout = Layout> =
  | {
      readonly status: 'success';
      readonly dps: DpsFor<L>;
      readonly result: NfseEmitResult<L>;
    }
  | {
      readonly status: 'success_unreadable';
      readonly dps: DpsFor<L>;
      readonly error: UnreadableAuthorizedNfseError;
    }
  | { readonly status: 'failure'; readonly dps: DpsFor<L>; readonly error: Error }
  | { readonly status: 'skipped'; readonly dps: DpsFor<L> };

export interface EmitLoteResult<L extends Layout = Layout> {
  readonly items: readonly EmitLoteItem<L>[];
  /** Notas autorizadas: itens `success` **e** `success_unreadable`. */
  readonly successCount: number;
  readonly failureCount: number;
  readonly skippedCount: number;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * `expectedLayout` (passado pelo `NfseClient`) checa **o lote inteiro** antes
 * do primeiro envio: um único item de outro layout rejeita tudo com
 * `LayoutMismatchError`. `logger` recebe os `warn` do parser de cada NFS-e.
 */
export async function emitMany<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  dpsList: readonly DpsFor<L>[],
  options?: EmitLoteOptions,
  expectedLayout?: Layout,
  logger?: Logger,
): Promise<EmitLoteResult<L>> {
  if (expectedLayout !== undefined) {
    for (const dps of dpsList) assertSameLayout(expectedLayout, dps);
  }
  const concurrency = Math.max(1, Math.floor(options?.concurrency ?? DEFAULT_CONCURRENCY));
  const stopOnError = options?.stopOnError ?? false;
  const perEmitOptions: EmitOptions & { dryRun: false } = {
    dryRun: false,
    ...(options?.skipValidation !== undefined ? { skipValidation: options.skipValidation } : {}),
    ...(options?.skipCepValidation !== undefined
      ? { skipCepValidation: options.skipCepValidation }
      : {}),
    ...(options?.skipCpfCnpjValidation !== undefined
      ? { skipCpfCnpjValidation: options.skipCpfCnpjValidation }
      : {}),
    ...(options?.cepValidator !== undefined ? { cepValidator: options.cepValidator } : {}),
  };
  const items: EmitLoteItem<L>[] = new Array(dpsList.length);
  let nextIndex = 0;
  let aborted = false;

  async function worker(): Promise<void> {
    while (true) {
      if (aborted) return;
      const i = nextIndex++;
      if (i >= dpsList.length) return;
      const dps = dpsList[i] as DpsFor<L>;
      try {
        const result = await emitDpsPronta<L>(
          httpClient,
          certificate,
          dps,
          perEmitOptions,
          undefined,
          logger,
        );
        items[i] = { status: 'success', dps, result };
      } catch (cause) {
        // Autorizada, mas ilegível: a nota existe — não é falha nem aborta o lote.
        if (cause instanceof UnreadableAuthorizedNfseError) {
          items[i] = { status: 'success_unreadable', dps, error: cause };
          continue;
        }
        const error = cause instanceof Error ? cause : new Error(String(cause));
        items[i] = { status: 'failure', dps, error };
        if (stopOnError) aborted = true;
      }
    }
  }

  const workerCount = Math.min(concurrency, dpsList.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  for (let i = 0; i < dpsList.length; i++) {
    if (!items[i]) items[i] = { status: 'skipped', dps: dpsList[i] as DpsFor<L> };
  }

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  for (const item of items) {
    if (item.status === 'success' || item.status === 'success_unreadable') successCount++;
    else if (item.status === 'failure') failureCount++;
    else skippedCount++;
  }
  return { items, successCount, failureCount, skippedCount };
}

function runIdentifierValidation(dps: DPS): void {
  for (const { type, value } of collectIdentifiersFromDps(dps)) {
    if (type === 'CNPJ') validateCnpj(value);
    else validateCpf(value);
  }
}

let _defaultCepValidator: CepValidator | undefined;

async function runCepValidation(dps: DPS, override?: CepValidator): Promise<void> {
  const ceps = collectCepsFromDps(dps);
  if (ceps.length === 0) return;
  const validator = override ?? (await getDefaultCepValidator());
  // sequencial — o cache interno no validator garante que CEPs repetidos
  // custam O(1). Paralelizar aqui pode violar rate-limit do ViaCEP em lote.
  for (const { cep } of ceps) {
    await validator.validate(cep);
  }
}

async function getDefaultCepValidator(): Promise<CepValidator> {
  if (!_defaultCepValidator) {
    const { createViaCepValidator } = await import('../cep/viacep.js');
    _defaultCepValidator = createViaCepValidator();
  }
  return _defaultCepValidator;
}

// ---------------------------------------------------------------------------
// Emissão segura — fluxo primário de v0.4+.
// Counter é consultado APENAS depois que todas as validações offline passam;
// falhas transitórias no POST viram retry_pending no RetryStore.
// ---------------------------------------------------------------------------

/**
 * Parâmetros de alto nível para `emitSeguro`. Equivalente a `BuildDpsParams`
 * do layout `L` sem `nDPS` (fornecido pelo `DpsCounter`) e sem `layout`
 * (vem do cliente), mais os flags de emissão.
 *
 * Passe `nDPS` explícito para override manual (útil para `dryRun` sem queimar
 * um número ou replay determinístico em testes).
 */
export type EmitirParams<L extends Layout = Layout> =
  // Distributivo em `L`: `EmitirParams<Layout>` é a união dos membros por
  // layout. Um `Omit` direto sobre a união manteria só as chaves comuns e
  // perderia os campos exclusivos do nt009 (`ajusteBC`, `ibsCbs`).
  L extends Layout
    ? Omit<BuildDpsParamsFor<L>, 'nDPS' | 'layout'> &
        EmitOptions & {
          /**
           * Override manual do `nDPS`. Quando presente, o `DpsCounter` não é
           * consultado. Obrigatório em `dryRun` (sem isso o preview consumiria
           * um número do counter à toa).
           *
           * **Não preencher com zeros à esquerda** — o `Id` da DPS é composto a
           * partir desta string, então `'1'` e `'00001'` produzem `Id`s
           * distintos para o mesmo número sequencial.
           */
          readonly nDPS?: string;
        }
    : never;

/**
 * Resultado discriminado de `emitSeguro`.
 *
 * - `ok` — autorizada, `nfse` contém a NFS-e parseada.
 * - `retry_pending` — erro transiente (rede/timeout/5xx); salvo no
 *   `RetryStore` para replay via `replayPendingEvents`.
 *
 * Erros **permanentes** (rejeição de regra fiscal, validação local) lançam
 * exceção — o caller sabe que o nDPS foi consumido mas a nota foi
 * definitivamente rejeitada. Exceção à parte: `UnreadableAuthorizedNfseError`
 * = nota **autorizada** cuja resposta não pôde ser interpretada (não reemita).
 */
export type EmitirResult<L extends Layout = Layout> =
  | { readonly status: 'ok'; readonly nfse: NfseEmitResult<L> }
  | {
      readonly status: 'retry_pending';
      readonly pending: PendingEmission;
      readonly error: Error;
    };

interface EmitSeguroDeps {
  readonly httpClient: HttpClient;
  readonly certificate: A1Certificate;
  readonly dpsCounter: DpsCounter | undefined;
  readonly retryStore: RetryStore | undefined;
  readonly retryPolicy: RetryPolicy;
  readonly isTransient?: (err: unknown) => boolean;
  /** Recebe os `warn` do parser da NFS-e retornada. */
  readonly logger?: Logger;
}

/**
 * O layout da DPS vem de `deps.layout` (o do cliente) — `params` não o carrega.
 */
export async function emitSeguro<L extends Layout>(
  deps: EmitSeguroDeps & { readonly layout: L },
  params: EmitirParams<L>,
): Promise<EmitirResult<L> | DpsDryRunResult> {
  assertParamsLayout(deps.layout, params);
  const isTransient = deps.isTransient ?? defaultIsTransient;
  const montarDps = (nDPS: string): DPS => buildDps({ ...params, layout: deps.layout, nDPS });

  // 1. Monta DPS com nDPS placeholder para validação (XSD não distingue
  //    valor específico — só valida contra pattern [1-9][0-9]{0,14}).
  const placeholderOrExplicit = params.nDPS ?? '1';
  const dpsParaValidar = montarDps(placeholderOrExplicit);

  // 2. Validações offline. Ordem: CPF/CNPJ (sync) → XSD (WASM) → CEP (HTTP).
  if (!params.skipCpfCnpjValidation) {
    runIdentifierValidation(dpsParaValidar);
  }
  const xmlPlaceholder = buildDpsXml(dpsParaValidar);
  if (!params.skipValidation) {
    await validateDpsXml(xmlPlaceholder, { layout: dpsParaValidar.layout });
  }
  if (!params.skipCepValidation) {
    await runCepValidation(dpsParaValidar, params.cepValidator);
  }

  // 3. Dry-run: use o placeholder (ou o nDPS explícito) — não consome counter.
  if (params.dryRun) {
    const xmlSigned = signDpsXml(xmlPlaceholder, deps.certificate);
    const xmlDpsGZipB64 = gzipBase64Encode(xmlSigned);
    return { dryRun: true, xmlDpsAssinado: xmlSigned, xmlDpsGZipB64 };
  }

  // 4. Obtém o nDPS real — override explícito ou counter.
  let nDpsReal: string;
  if (params.nDPS !== undefined) {
    nDpsReal = params.nDPS;
  } else {
    if (!deps.dpsCounter) throw new MissingDpsCounterError();
    nDpsReal = await deps.dpsCounter.next({
      emitenteCnpj: params.emitente.cnpj,
      serie: params.serie,
    });
  }

  // 5. Rebuild com nDPS real + sign. Não re-valido XSD — estrutura é
  //    idêntica, só o valor numérico mudou (e já sabemos que bate no pattern).
  const dpsReal = montarDps(nDpsReal);
  const xmlUnsigned = buildDpsXml(dpsReal);
  const xmlSigned = signDpsXml(xmlUnsigned, deps.certificate);
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSigned);

  // 6. POST. Transiente → retryStore. Permanente → throw. O parsing da NFS-e
  //    fica FORA do try: após um 201 a nota existe, e falha de leitura nunca
  //    pode virar retry_pending (nem com um isTransient custom).
  let success: SefinPostSuccessBody;
  try {
    const body = await deps.httpClient.post<SefinPostBody | undefined>(
      '/nfse',
      { dpsXmlGZipB64 },
      { acceptedStatuses: [400] },
    );

    // Sucesso → segue; 400 com corpo de rejeição → throw permanente.
    success = successBodyOrThrow(body);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isTransient(error)) {
      if (!deps.retryStore) throw new MissingRetryStoreError();
      const now = new Date();
      const notBefore = deps.retryPolicy.computeNotBefore(error, now, {
        attempt: 1,
        firstAttemptAt: now,
      });
      const pending: PendingEmission = {
        id: pendingEmissionId(dpsReal.infDPS.Id),
        kind: 'emission',
        layout: dpsReal.layout,
        idDps: dpsReal.infDPS.Id,
        emitenteCnpj: params.emitente.cnpj,
        serie: params.serie,
        nDPS: nDpsReal,
        xmlAssinado: xmlSigned,
        firstAttemptAt: now,
        lastAttemptAt: now,
        attempts: 1,
        ...(notBefore ? { notBefore } : {}),
        lastError: {
          message: error.message,
          errorName: error.name,
          transient: true,
        },
      };
      await deps.retryStore.save(pending);
      return { status: 'retry_pending', pending, error };
    }
    throw error;
  }
  return { status: 'ok', nfse: toEmitResult(success, deps.layout, deps.logger) };
}

/**
 * Replay de uma emissão pendente — re-POSTa o XML assinado diretamente em
 * `/nfse`. Uma DPS já convertida em NFS-e volta como rejeição permanente
 * (E0014 — série/número já existe), não como sucesso: quem decide é o
 * `replayPendingEvents`, que reconcilia via `GET /dps/{id}` +
 * `fetchEmissionByDpsStatus`. Resposta 201 ilegível →
 * `UnreadableAuthorizedNfseError`.
 */
export async function replayEmission(
  httpClient: HttpClient,
  xmlSignedDps: string,
  logger?: Logger,
): Promise<NfseEmitResult> {
  const dpsXmlGZipB64 = gzipBase64Encode(xmlSignedDps);
  const body = await httpClient.post<SefinPostBody | undefined>(
    '/nfse',
    { dpsXmlGZipB64 },
    { acceptedStatuses: [400] },
  );
  return toEmitResult<Layout>(successBodyOrThrow(body), undefined, logger);
}

interface SefinNfseGetBody {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly chaveAcesso: string;
  readonly nfseXmlGZipB64: string;
}

/**
 * Reconciliação do replay: dado o `GET /dps/{id}` que confirmou a NFS-e,
 * baixa-a (`GET /nfse/{chave}`) e monta o mesmo `NfseEmitResult` de uma
 * emissão (`alertas` vazio — o GET não os devolve). XML ilegível →
 * `UnreadableAuthorizedNfseError` **sem** log: a nota pode ser de outra DPS
 * com o mesmo Id, então quem chama loga (`logUnreadableAuthorizedNfse`) só
 * depois de conferir a DPS embutida. Erros HTTP propagam.
 */
export async function fetchEmissionByDpsStatus(
  httpClient: HttpClient,
  status: DpsStatusResult,
  logger?: Logger,
): Promise<NfseEmitResult> {
  const raw = await httpClient.get<SefinNfseGetBody>(
    `/nfse/${encodeURIComponent(status.chaveAcesso)}`,
  );
  return toEmitResult<Layout>(
    {
      tipoAmbiente: raw.tipoAmbiente,
      versaoAplicativo: raw.versaoAplicativo,
      dataHoraProcessamento: raw.dataHoraProcessamento,
      idDps: status.idDps,
      chaveAcesso: raw.chaveAcesso,
      nfseXmlGZipB64: raw.nfseXmlGZipB64,
    },
    undefined,
    logger,
    { logUnreadable: false },
  );
}

/**
 * Reconciliação do replay: a NFS-e achada por `GET /dps/{id}` nasceu da DPS
 * persistida no store? O `infDPS.Id` só codifica cMun + CNPJ/CPF + série +
 * nDPS — uma colisão de numeração (contador em memória reiniciado, `nDPS`
 * explícito) faz o GET devolver a nota de **outra** DPS. A NFS-e embute a
 * DPS assinada (`TCDPS` = `infDPS` + `ds:Signature`), então compara:
 * - o `SignatureValue` da DPS (whitespace ignorado), quando os dois lados o têm;
 * - senão, o `infDPS/dhEmi` (como instante), quando os dois lados o têm.
 *
 * `true` = mesma DPS; `false` = outra DPS; `undefined` = não verificável
 * (DPS persistida sem assinatura nem `dhEmi`, como dados legados/stubs, ou
 * XML que não parseia) — o caller segue confiando no `GET /dps`.
 */
export function embeddedDpsMatches(xmlNfse: string, xmlSignedDps: string): boolean | undefined {
  const persisted = dpsFingerprint(() => asObject(parseXml(xmlSignedDps).DPS));
  const embedded = dpsFingerprint(() => {
    const nfse = asObject(parseXml(xmlNfse).NFSe);
    return asObject(asObject(nfse?.infNFSe)?.DPS);
  });
  if (!persisted || !embedded) return undefined;
  if (persisted.signatureValue !== undefined && embedded.signatureValue !== undefined) {
    return persisted.signatureValue === embedded.signatureValue;
  }
  if (persisted.dhEmi !== undefined && embedded.dhEmi !== undefined) {
    const a = Date.parse(persisted.dhEmi);
    const b = Date.parse(embedded.dhEmi);
    return Number.isNaN(a) || Number.isNaN(b) ? persisted.dhEmi === embedded.dhEmi : a === b;
  }
  return undefined;
}

interface DpsFingerprint {
  readonly signatureValue: string | undefined;
  readonly dhEmi: string | undefined;
}

function dpsFingerprint(getDps: () => XmlObject | undefined): DpsFingerprint | undefined {
  let dps: XmlObject | undefined;
  try {
    dps = getDps();
  } catch {
    return undefined;
  }
  if (!dps) return undefined;
  // O parser não decodifica referências numéricas (`&#13;`, `&#xD;`), que
  // serializadores .NET/Java usam para o CR da quebra de linha do base64:
  // decodifica-as antes de remover o whitespace, senão a mesma assinatura
  // serializada de outro jeito pareceria outra DPS.
  const signature = decodeCharRefs(textOf(asObject(dps.Signature)?.SignatureValue) ?? '').replace(
    /\s+/g,
    '',
  );
  const dhEmi = textOf(asObject(dps.infDPS)?.dhEmi)?.trim();
  return {
    signatureValue: signature ? signature : undefined,
    dhEmi: dhEmi ? dhEmi : undefined,
  };
}

function decodeCharRefs(text: string): string {
  return text.replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, (ref, hex?: string, dec?: string) => {
    const code = hex !== undefined ? Number.parseInt(hex, 16) : Number(dec);
    return code <= 0x10ffff ? String.fromCodePoint(code) : ref;
  });
}

function asObject(node: XmlNode | undefined): XmlObject | undefined {
  return node !== undefined && typeof node === 'object' && !Array.isArray(node)
    ? (node as XmlObject)
    : undefined;
}

function textOf(node: XmlNode | undefined): string | undefined {
  if (typeof node === 'string') return node;
  const text = asObject(node)?.[TEXT_NODE];
  return typeof text === 'string' ? text : undefined;
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function normalizeAlerta(raw: Partial<MensagemProcessamento>): MensagemProcessamento[] {
  const r = raw as Record<string, unknown>;
  const codigo = pickStr(r, 'codigo', 'Codigo');
  const descricao = pickStr(r, 'descricao', 'Descricao');
  if (!codigo && !descricao) return [];
  const complemento = pickStr(r, 'complemento', 'Complemento');
  return [
    {
      codigo: codigo ?? 'UNKNOWN',
      descricao: descricao ?? '(sem descrição)',
      ...(complemento ? { complemento } : {}),
    },
  ];
}
