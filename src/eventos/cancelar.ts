import type { A1Certificate } from '../certificate/types.js';
import { RuleViolationError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';
import type { Logger } from '../logging.js';
import type { DPS, DpsFor, Substituicao } from '../nfse/domain.js';
import { type EmitOptions, emitDpsProntaSeguro, type NfseEmitResult } from '../nfse/emit.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  type TipoAmbienteDps,
} from '../nfse/enums.js';
import { assertLayout, type Layout, unknownLayout } from '../nfse/layout.js';
import type { RetryPolicy } from '../retry/policy.js';
import {
  MissingRetryStoreError,
  type PendingEmission,
  type PendingEvent,
  type PendingEventKind,
  pendingEventId,
  type RetryStore,
} from '../retry/store.js';
import { defaultIsTransient } from '../retry/transient.js';
import { type AutorEvento, buildCancelamentoXml } from './build-event-xml.js';
import { type EventoResult, postEvento } from './post-evento.js';
import { signPedRegEventoXml } from './sign-event.js';

// -----------------------------------------------------------------------------
// cancelar — evento 101101
// -----------------------------------------------------------------------------

export interface CancelarParams {
  readonly chaveAcesso: string;
  readonly autor: AutorEvento;
  readonly cMotivo: JustificativaCancelamento;
  readonly xMotivo: string;
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

/**
 * `layout` (opcional; o `NfseClient` passa o seu) é gravado no `PendingEvent`
 * persistido em falha transiente. Valor desconhecido → `InvalidLayoutError`.
 */
export async function cancelar(
  httpClient: HttpClient,
  certificate: A1Certificate,
  retryPolicy: RetryPolicy,
  params: CancelarParams,
  layout?: Layout,
): Promise<CancelarResult> {
  // Chamador JS: layout desconhecido não vai parar no PendingEvent.
  if (layout !== undefined) assertLayout(layout);
  // Evento 101101: e101101/xMotivo é obrigatório (1-1); cMotivo=9 (Outros) sem
  // descrição é o caso mais comum de omissão. (E0078 é regra da DPS/subst, não
  // deste evento — o campo aqui é evento/.../e101101/xMotivo.)
  if (params.cMotivo === JustificativaCancelamento.Outros && !params.xMotivo?.trim()) {
    throw new RuleViolationError(
      'cMotivo=9 (Outros) exige xMotivo não-vazio (evento 101101)',
      'e101101/xMotivo',
    );
  }
  // TSMotivo (tiposSimples_v1.01.xsd:355) — minLength 15, maxLength 255.
  // xMotivo é required em CancelarParams, então sempre checa.
  validarTSMotivo(params.xMotivo);

  const isTransient = params.isTransient ?? defaultIsTransient;

  const xmlPedido = buildCancelamentoXml(params);
  // Sign up-front so that, if the POST fails transiently, the persisted
  // entry carries genuinely signed XML — `replayPendingEvents` re-POSTs
  // with `xmlJaAssinado: true`, so unsigned XML in the store would be
  // rejected by SEFIN's signature check on every retry.
  const xmlAssinado = signPedRegEventoXml(xmlPedido, certificate);

  try {
    const r = await postEvento(httpClient, certificate, params.chaveAcesso, xmlAssinado, {
      xmlJaAssinado: true,
    });
    return { status: 'ok', evento: dropInternal(r) };
  } catch (err) {
    const error = toError(err);
    if (!isTransient(error)) {
      throw error; // regra fiscal — caller loga e segue
    }
    const now = new Date();
    const notBefore = retryPolicy.computeNotBefore(error, now, {
      attempt: 1,
      firstAttemptAt: now,
    });
    const pending = buildPendingEvent({
      ...(layout !== undefined ? { layout } : {}),
      kind: 'cancelamento_simples',
      chaveNfse: params.chaveAcesso,
      tipoEvento: '101101',
      cMotivo: params.cMotivo,
      xMotivo: params.xMotivo,
      xmlAssinado,
      error,
      transient: true,
      now,
      ...(notBefore ? { notBefore } : {}),
    });
    await savePending(params.retryStore, pending);
    return { status: 'retry_pending', pending, error };
  }
}

// -----------------------------------------------------------------------------
// substituir — emite a nova DPS com <subst>; o sistema gera o 105102 server-side
// -----------------------------------------------------------------------------

/**
 * Parâmetros da substituição. A substituição é dirigida 100% pela DPS: não há
 * `autor`/`tpAmb`/`verAplic`/`dhEvento` porque o contribuinte não registra um
 * evento — apenas emite a nova DPS. As opções de emissão (`skip*Validation`,
 * `cepValidator`) são repassadas ao emit; `retryStore`/`isTransient` controlam
 * a resiliência a falhas transientes (idêntico a `emitir`).
 */
export interface SubstituirParams<L extends Layout = Layout> extends Omit<EmitOptions, 'dryRun'> {
  /** Chave da NFS-e a ser substituída (a antiga). */
  readonly chaveOriginal: string;
  /**
   * Nova DPS (substituta). Se `infDPS.subst` não estiver preenchido, é
   * auto-completado com `chaveOriginal` + `cMotivo`/`xMotivo`. Se já estiver,
   * `chSubstda`/`cMotivo`/`xMotivo` devem ser idênticos a
   * `chaveOriginal`/`cMotivo`/`xMotivo` — divergência lança
   * `RuleViolationError` (rule `infDPS/subst`) antes de qualquer envio.
   */
  readonly novaDps: DpsFor<L>;
  readonly cMotivo: JustificativaSubstituicao;
  readonly xMotivo?: string;
  /**
   * Store para persistir a emissão pendente se o `POST /nfse` falhar
   * transitoriamente. Se omitido e o caminho transiente for acionado, lança
   * `MissingRetryStoreError` para forçar decisão consciente.
   */
  readonly retryStore?: RetryStore;
  /** Classificador custom de transiência. Default: `defaultIsTransient`. */
  readonly isTransient?: (err: unknown) => boolean;
}

/**
 * Resultado da substituição — discriminated union sobre `status`, idêntico em
 * forma ao `EmitirResult`. Enviar a nova DPS com `infDPS/subst` para
 * `POST /nfse` faz o **sistema** gerar o evento 105102 (autor=MEmis) cancelando
 * a original (atômico). Como há um único write:
 *
 * - `'ok'` — nota substituta autorizada (`novaNfse`); a original foi cancelada
 *   server-side pelo 105102.
 * - `'retry_pending'` — falha **transiente** no `POST /nfse`; a emissão foi
 *   persistida no `retryStore` para replay idempotente via `replayPendingEvents`
 *   (dedup por `infDPS.Id`). Nada foi alterado no SEFIN ainda.
 *
 * Rejeição **permanente** (regra fiscal / validação local) **lança** exceção.
 * `UnreadableAuthorizedNfseError` = substituta **autorizada** cuja resposta não
 * pôde ser interpretada (não reemita). `L` estreita `novaNfse` ao layout.
 */
export type SubstituirResult<L extends Layout = Layout> =
  | { readonly status: 'ok'; readonly novaNfse: NfseEmitResult<L> }
  | {
      readonly status: 'retry_pending';
      readonly pending: PendingEmission;
      readonly error: Error;
    };

/**
 * `layout` (opcional; o `NfseClient` passa o seu): quando presente, `novaDps`
 * de outro layout é rejeitada com `LayoutMismatchError` antes de qualquer
 * trabalho; valor desconhecido → `InvalidLayoutError`. `logger` (opcional)
 * recebe os `warn` do parser da NFS-e substituta.
 */
export async function substituir<L extends Layout = Layout>(
  httpClient: HttpClient,
  certificate: A1Certificate,
  retryPolicy: RetryPolicy,
  params: SubstituirParams<L>,
  layout?: L,
  logger?: Logger,
): Promise<SubstituirResult<L>> {
  // Chamador JS: layout desconhecido → InvalidLayoutError (não um LayoutMismatchError enganoso).
  if (layout !== undefined) assertLayout(layout);
  // O <subst> efetivamente enviado: o da DPS (se presente, precisa concordar com
  // os params) ou o montado a partir dos params. Os guards abaixo rodam sobre ele.
  const subst = resolverSubst(params);

  // Rule E0078 — cMotivo=99 exige xMotivo populado. Pré-check local para evitar
  // round-trip + queima de nDPS num emit que seria rejeitado.
  if (subst.cMotivo === JustificativaSubstituicao.Outros && !subst.xMotivo?.trim()) {
    throw new RuleViolationError(
      'cMotivo=99 (Outros) exige xMotivo não-vazio — per E0078',
      'E0078',
    );
  }
  // TSMotivo — 15 a 255 chars + pattern TSString quando presente (xMotivo é
  // opcional em subst).
  if (subst.xMotivo !== undefined) {
    validarTSMotivo(subst.xMotivo);
  }
  // TSChaveNFSe — chSubstda precisa ter a forma da chave antes de comparar
  // posições (chamador JS sem chaveOriginal, chave truncada etc.).
  assertChSubstdaTSChaveNFSe(subst.chSubstda);
  // Rule E0042 — Cód.Mun./Tipo de Inscrição/Inscrição da chave substituída
  // devem corresponder exatamente aos do Id desta DPS.
  assertChSubstdaCorrespondeAoIdDps(subst.chSubstda, params.novaDps.infDPS.Id);

  const dpsComSubst = comSubst(params.novaDps, subst);

  // Único write do contribuinte: a DPS com <subst> via POST /nfse. O Sistema
  // Nacional NFS-e gera, de forma atômica com a emissão, o evento 105102
  // (autor=MEmis) que cancela a NFS-e original, e retorna a substituta. O
  // contribuinte NÃO registra um pedRegEvento 105102 — ver doc do método.
  // Transiente → retry_pending (persistido). Permanente → throw.
  const emitOptions: Omit<EmitOptions, 'dryRun'> = {
    ...(params.skipValidation !== undefined ? { skipValidation: params.skipValidation } : {}),
    ...(params.skipCepValidation !== undefined
      ? { skipCepValidation: params.skipCepValidation }
      : {}),
    ...(params.skipCpfCnpjValidation !== undefined
      ? { skipCpfCnpjValidation: params.skipCpfCnpjValidation }
      : {}),
    ...(params.cepValidator ? { cepValidator: params.cepValidator } : {}),
  };

  const r = await emitDpsProntaSeguro<L>(
    httpClient,
    certificate,
    // ensureSubstPopulated preserva o layout de `novaDps` (DpsFor<L>).
    dpsComSubst as DpsFor<L>,
    {
      retryStore: params.retryStore,
      retryPolicy,
      ...(params.isTransient ? { isTransient: params.isTransient } : {}),
      ...(layout !== undefined ? { expectedLayout: layout } : {}),
      ...(logger ? { logger } : {}),
    },
    emitOptions,
  );

  return r.status === 'ok'
    ? { status: 'ok', novaNfse: r.nfse }
    : { status: 'retry_pending', pending: r.pending, error: r.error };
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

/**
 * Resolve o `<subst>` que será enviado. Sem `infDPS.subst` na DPS, monta-o dos
 * params (`chSubstda` = `chaveOriginal`). Com `infDPS.subst` já preenchido, os
 * valores precisam ser idênticos aos params — divergência lança
 * `RuleViolationError` (rule `infDPS/subst`) em vez de enviar em silêncio um
 * `<subst>` diferente do que o chamador declarou (outra chave substituída,
 * outro motivo).
 */
function resolverSubst(params: SubstituirParams): Substituicao {
  const daDps = params.novaDps.infDPS.subst;
  const doParams: Substituicao = {
    chSubstda: params.chaveOriginal,
    cMotivo: params.cMotivo,
    ...(params.xMotivo !== undefined ? { xMotivo: params.xMotivo } : {}),
  };
  if (!daDps) return doParams;
  const divergentes = (['chSubstda', 'cMotivo', 'xMotivo'] as const).filter(
    (campo) => daDps[campo] !== doParams[campo],
  );
  if (divergentes.length > 0) {
    const nomes = divergentes.map((c) =>
      c === 'chSubstda' ? 'chSubstda ≠ chaveOriginal' : `${c} ≠ params.${c}`,
    );
    throw new RuleViolationError(
      `novaDps.infDPS.subst diverge dos parâmetros de substituir (${nomes.join(', ')}). Omita infDPS.subst (é preenchido a partir dos parâmetros) ou informe os mesmos valores.`,
      'infDPS/subst',
    );
  }
  return daDps;
}

function comSubst(dps: DPS, subst: Substituicao): DPS {
  if (dps.infDPS.subst === subst) return dps;
  // Narrowing por layout: o spread de uma union não preserva o discriminante.
  switch (dps.layout) {
    case 'nt004':
      return { ...dps, infDPS: { ...dps.infDPS, subst } };
    case 'nt009':
      return { ...dps, infDPS: { ...dps.infDPS, subst } };
    default:
      return unknownLayout(dps);
  }
}

// TSChaveNFSe (tiposSimples_v1.01.xsd, idêntico nos bundles nt004 e nt009):
// maxLength 50 + pattern `[0-9]{6}([0-9A-Z]{14})[0-9]{30}` (âncoras implícitas no XSD).
const REGEX_TS_CHAVE_NFSE = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;

/**
 * Forma da chave substituída (`subst/chSubstda`, tipo `TSChaveNFSe`). Roda
 * antes da E0042 para que um valor ausente (chamador JS) ou malformado gere
 * erro tipado de formato — não um `TypeError` nem uma E0042 enganosa — mesmo
 * com `skipValidation` (que desliga a validação XSD).
 */
function assertChSubstdaTSChaveNFSe(chSubstda: unknown): asserts chSubstda is string {
  if (typeof chSubstda !== 'string' || !REGEX_TS_CHAVE_NFSE.test(chSubstda)) {
    throw new RuleViolationError(
      `chaveOriginal (subst/chSubstda) deve ser uma chave de NFS-e de 50 posições no formato [0-9]{6}[0-9A-Z]{14}[0-9]{30}, recebido ${JSON.stringify(chSubstda)} — per TSChaveNFSe`,
      'TSChaveNFSe',
    );
  }
}

/**
 * E0042 (Anexo I nt004 `RN DPS_NFS-e:r170` / nt009 `RN DPS_NFS-e 1.01:r179`,
 * Obrig./Rej., executada pela Sefin): a correspondência exata de Cód.Mun. /
 * Tipo de Inscrição / Inscrição entre a chave substituída e o Id desta DPS.
 * Posições pela regra de formação dos XSDs (idêntica nos dois bundles):
 * - chave = `TSIdNFSe` sem "NFS": Cód.Mun.(7) + Amb.Ger.(1) + Tipo Insc.(1) + Inscrição(14) + …
 * - `TSIdDPS`: "DPS" + Cód.Mun.(7) + Tipo Insc.(1) + Inscrição(14) + …
 *
 * A outra metade da E0042 (DV da chave) não é verificada: o algoritmo do DV
 * da chave de NFS-e não está especificado nas fontes oficiais (XSD, Anexos,
 * manuais) — a Sefin continua sendo a autoridade sobre ele.
 */
function assertChSubstdaCorrespondeAoIdDps(chSubstda: string, idDps: string): void {
  const chave = {
    cMun: chSubstda.slice(0, 7),
    tpInsc: chSubstda.slice(8, 9),
    insc: chSubstda.slice(9, 23),
  };
  const id = { cMun: idDps.slice(3, 10), tpInsc: idDps.slice(10, 11), insc: idDps.slice(11, 25) };
  const divergentes = (['cMun', 'tpInsc', 'insc'] as const).filter((c) => chave[c] !== id[c]);
  if (divergentes.length > 0) {
    const rotulo = { cMun: 'Cód.Mun.', tpInsc: 'Tipo de Inscrição', insc: 'Inscrição' } as const;
    throw new RuleViolationError(
      `Chave da NFS-e substituída (${chSubstda}) não corresponde ao Id desta DPS (${idDps}) em ${divergentes.map((c) => rotulo[c]).join(' / ')} — a substituta deve ser do mesmo emitente e município — per E0042`,
      'E0042',
    );
  }
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
  readonly layout?: Layout;
  readonly kind: Exclude<PendingEventKind, 'emission'>;
  readonly chaveNfse: string;
  readonly chaveSubstituta?: string;
  readonly tipoEvento: string;
  readonly cMotivo: string;
  readonly xMotivo?: string;
  readonly xmlAssinado: string;
  readonly error: Error;
  readonly transient: boolean;
  /**
   * Timestamp compartilhado entre `firstAttemptAt` / `lastAttemptAt` e o
   * cálculo de `notBefore` no caller. Required para garantir que os três
   * campos refiram-se ao mesmo instante (sem drift de microssegundos).
   */
  readonly now: Date;
  readonly notBefore?: Date;
  /** Tentativas até agora; default 1 quando omitido. */
  readonly attempts?: number;
}

function buildPendingEvent(input: PendingEventFactoryInput): PendingEvent {
  return {
    id: pendingEventId(input.chaveNfse, input.tipoEvento, input.kind),
    ...(input.layout !== undefined ? { layout: input.layout } : {}),
    kind: input.kind,
    chaveNfse: input.chaveNfse,
    ...(input.chaveSubstituta ? { chaveSubstituta: input.chaveSubstituta } : {}),
    tipoEvento: input.tipoEvento,
    cMotivo: input.cMotivo,
    ...(input.xMotivo ? { xMotivo: input.xMotivo } : {}),
    xmlAssinado: input.xmlAssinado,
    firstAttemptAt: input.now,
    lastAttemptAt: input.now,
    attempts: input.attempts ?? 1,
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
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
 * Pattern de `TSString` (`tiposSimples_v1.01.xsd:19`, idêntico nos bundles
 * nt004 e nt009), base de `TSMotivo`: `[!-ÿ]{1}[ -ÿ]{0,}[!-ÿ]{1}|[!-ÿ]{1}` —
 * só U+0020–U+00FF, sem espaço nas pontas (nem tab/quebra de linha em lugar
 * algum).
 */
const TSSTRING_PATTERN = /^(?:[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ])$/u;

/**
 * Valida que a string bate com `TSMotivo` (tiposSimples_v1.01.xsd:348-356):
 * minLength 15, maxLength 255, sobre a base `TSString`. Lança
 * `RuleViolationError` com rule `TSMotivo` — o XML do evento 101101 não passa
 * por validação XSD local antes do POST, e a rejeição de schema da Sefin é
 * opaca (travessão/aspas curvas coladas de editor de texto são o caso comum).
 */
function validarTSMotivo(xMotivo: string): void {
  const len = xMotivo.length;
  if (len < 15 || len > 255) {
    throw new RuleViolationError(
      `xMotivo deve ter entre 15 e 255 caracteres (atual: ${len}) — per TSMotivo do RTC v1.01`,
      'TSMotivo',
    );
  }
  if (!TSSTRING_PATTERN.test(xMotivo)) {
    throw new RuleViolationError(
      'xMotivo deve conter apenas caracteres de U+0020 a U+00FF (Latin-1: sem travessão “–”, aspas curvas, tab ou quebra de linha) e sem espaço nas pontas — per TSString/TSMotivo do RTC v1.01',
      'TSMotivo',
    );
  }
}
