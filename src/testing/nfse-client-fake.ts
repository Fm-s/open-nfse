import { TipoAmbiente } from '../ambiente.js';
import type { FetchByNsuParams, ReplayItem } from '../client.js';
import { type GerarDanfseOptions, gerarDanfse as gerarDanfseLocal } from '../danfse/gerar.js';
import type { NsuQueryResult } from '../dfe/types.js';
import { StatusDistribuicao } from '../dfe/types.js';
import { TimeoutError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { buildCancelamentoXml } from '../eventos/build-event-xml.js';
import {
  type CancelarParams,
  type CancelarResult,
  prepararSubstituicao,
  type SubstituirParams,
  type SubstituirResult,
  validarCancelamento,
} from '../eventos/cancelar.js';
import type { EventoResult } from '../eventos/post-evento.js';
import {
  type DpsStatusResult,
  InvalidChaveAcessoError,
  InvalidDpsIdError,
  NotFoundError,
} from '../index.js';
import { buildDps } from '../nfse/build-dps.js';
import { REGEX_CHAVE_ACESSO } from '../nfse/chave-acesso.js';
import type { DPS, DpsFor, NFSe } from '../nfse/domain.js';
import { buildDpsId } from '../nfse/dps-id.js';
import type {
  DpsDryRunResult,
  EmitirParams,
  EmitirResult,
  EmitLoteItem,
  EmitLoteOptions,
  EmitLoteResult,
  EmitOptions,
  NfseEmitResult,
} from '../nfse/emit.js';
import {
  assertLayout,
  assertNoForeignLayoutFields,
  assertParamsLayout,
  assertSameLayout,
  type Layout,
} from '../nfse/layout.js';
import type { NfseQueryResult } from '../nfse/types.js';
import type { ConsultaOptions } from '../parametros-municipais/fetch.js';
import type {
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
} from '../parametros-municipais/types.js';
import type { PendingEmission, RetryStore } from '../retry/store.js';
import { FakeState, type ProgrammedFailure } from './fake-state.js';
import { FakeSeed } from './seed.js';
import { synthChaveAcesso, synthNfse } from './synth.js';

// Chave: mesma pré-validação das leituras do real (TSChaveNFSe ou a forma de
// TSIdNFSe). Id da DPS: espelha TSIdDPS do bundle RTC v1.01-20260727.
const REGEX_ID_DPS = /^DPS[0-9]{7}(?:1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}$/;

/**
 * Dublê em memória do `NfseClient` para testes de consumidores. Expõe a mesma
 * superfície pública, mas:
 *  - **Não abre conexão** com SEFIN/ADN.
 *  - Mantém estado in-memory (emitidas, canceladas, substituídas, parâmetros).
 *  - Oferece API de seed (`fake.seed.*`) e simulação de falhas
 *    (`fake.failNextEmit`, `fake.failNextCancel`).
 *  - **Executa os mesmos guards offline** do real — os de `buildDps`
 *    (CPF/CNPJ, regras de negócio, layout) em `emitir` e os de
 *    `cancelar`/`substituir` (motivo, `TSMotivo`, E0078) — antes de consumir a
 *    falha programada (que simula o POST), assim o consumidor testa o caminho
 *    de validação sem mock adicional. Não roda a validação XSD nem a de CEP.
 *
 * Estrutural-compatível com `NfseClient` — se você tipar suas dependências
 * como `NfseClientLike`, pode injetar qualquer um.
 *
 * Como o real, é genérico no `layout` (obrigatório): os métodos de emissão
 * só aceitam DPS do layout configurado e lançam `LayoutMismatchError` em
 * runtime para DPS de outro layout.
 */
export class NfseClientFake<L extends Layout = Layout> {
  private readonly state = new FakeState();
  readonly seed: FakeSeed;
  /** Layout simulado (ver `NfseClientConfig.layout`). */
  readonly layout: L;
  /** Ambiente simulado. Default `Homologacao`. */
  readonly ambiente: TipoAmbiente;

  constructor(options: { readonly layout: L; readonly ambiente?: TipoAmbiente }) {
    this.layout = assertLayout(options?.layout) as L;
    this.ambiente = options.ambiente ?? TipoAmbiente.Homologacao;
    this.seed = new FakeSeed(this.state);
  }

  private montarDps(params: EmitirParams<L>, nDPS: string): DPS {
    return buildDps({ ...params, layout: this.layout, nDPS });
  }

  // -------------------------------------------------------------------------
  // Simulação de falhas
  // -------------------------------------------------------------------------

  /** Próxima chamada de `emitir()` irá falhar com o erro programado. */
  failNextEmit(failure: ProgrammedFailure): void {
    this.state.nextEmitFailure = failure;
  }

  /** Próxima chamada de `cancelar()` irá falhar com o erro programado. */
  failNextCancel(failure: ProgrammedFailure): void {
    this.state.nextCancelFailure = failure;
  }

  /** Limpa todo o estado (seeds + failures + emissões). */
  reset(): void {
    this.state.reset();
  }

  // -------------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------------

  async fetchByChave(chaveAcesso: string): Promise<NfseQueryResult> {
    if (!REGEX_CHAVE_ACESSO.test(chaveAcesso)) {
      throw new InvalidChaveAcessoError(chaveAcesso);
    }
    const nfse = this.state.emitted.get(chaveAcesso);
    if (!nfse) {
      throw new NotFoundError(`chave ${chaveAcesso} não seedada no fake`);
    }
    return {
      chaveAcesso,
      xmlNfse: nfse.xmlNfse,
      nfse: nfse.nfse,
      tipoAmbiente: nfse.tipoAmbiente,
      versaoAplicativo: nfse.versaoAplicativo,
      dataHoraProcessamento: nfse.dataHoraProcessamento,
    };
  }

  async fetchDpsStatus(idDps: string): Promise<DpsStatusResult> {
    if (!REGEX_ID_DPS.test(idDps)) {
      throw new InvalidDpsIdError(idDps);
    }
    for (const nfse of this.state.emitted.values()) {
      if (nfse.idDps === idDps) {
        return {
          chaveAcesso: nfse.chaveAcesso,
          idDps,
          tipoAmbiente: nfse.tipoAmbiente,
          versaoAplicativo: nfse.versaoAplicativo,
          dataHoraProcessamento: nfse.dataHoraProcessamento,
        };
      }
    }
    throw new NotFoundError(`idDps ${idDps} não encontrado no fake`);
  }

  async existsDpsStatus(idDps: string): Promise<boolean> {
    try {
      await this.fetchDpsStatus(idDps);
      return true;
    } catch (err) {
      if (err instanceof NotFoundError) return false;
      throw err;
    }
  }

  async fetchByNsu(params: FetchByNsuParams): Promise<NsuQueryResult> {
    const { ultimoNsu } = params;
    const docs = this.state.dfe.filter((d) => d.nsu > ultimoNsu);
    const finalNsu = docs.length ? (docs[docs.length - 1]?.nsu ?? ultimoNsu) : ultimoNsu;
    return {
      status:
        docs.length > 0
          ? StatusDistribuicao.DocumentosEncontrados
          : StatusDistribuicao.NenhumDocumento,
      ultimoNsu: finalNsu,
      documentos: [...docs],
      alertas: [],
      erros: [],
      tipoAmbiente: this.ambiente,
      versaoAplicativo: 'NfseClientFake/0.6',
      dataHoraProcessamento: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Emissão
  // -------------------------------------------------------------------------

  async emitir(params: EmitirParams<L> & { dryRun: true }): Promise<DpsDryRunResult>;
  async emitir(params: EmitirParams<L> & { dryRun?: false }): Promise<EmitirResult>;
  async emitir(params: EmitirParams<L>): Promise<EmitirResult | DpsDryRunResult> {
    assertParamsLayout(this.layout, params);
    // Como o emitSeguro: monta (e valida) a DPS com o nDPS placeholder/explícito
    // antes de tocar no sequencial ou na falha programada — esta simula o POST,
    // então guard offline (ex.: LayoutMismatchError, regras de buildDps) e
    // dry-run não a consomem.
    const dpsValidada = this.montarDps(params, params.nDPS ?? '1');

    if (params.dryRun) {
      return {
        dryRun: true,
        xmlDpsAssinado: `<?xml version="1.0"?><DPS versao="1.01"><infDPS Id="${dpsValidada.infDPS.Id}"/></DPS>`,
        xmlDpsGZipB64: 'FAKE_GZIP_B64',
      };
    }

    const failure = this.consumeFailure('emit');
    if (failure?.kind === 'rejection') {
      throw new ReceitaRejectionError({
        mensagens: [
          {
            codigo: failure.codigo,
            descricao: failure.descricao,
            ...(failure.complemento ? { complemento: failure.complemento } : {}),
          },
        ],
      });
    }

    const nDPS = params.nDPS ?? String(this.state.nextSequential++);
    const idDps = buildDpsId({
      cLocEmi: params.emitente.codMunicipio,
      tipoInsc: 'CNPJ',
      inscricaoFederal: params.emitente.cnpj,
      serie: params.serie,
      nDPS,
    });
    const dps = this.montarDps(params, nDPS);

    if (failure?.kind === 'transient') {
      const error = new TimeoutError(5000, {
        cause: new Error(failure.message ?? 'fake transient'),
      });
      const pending: PendingEmission = {
        id: `emission:${idDps}`,
        kind: 'emission',
        layout: this.layout,
        idDps,
        emitenteCnpj: params.emitente.cnpj,
        serie: params.serie,
        nDPS,
        xmlAssinado: '<DPS/>',
        firstAttemptAt: new Date(),
        lastAttemptAt: new Date(),
        lastError: { message: error.message, errorName: error.name, transient: true },
      };
      return { status: 'retry_pending', pending, error };
    }

    const chaveAcesso = synthChaveAcesso(this.state.nextSequential++, params.emitente.cnpj, idDps);
    const nfse = synthNfse(dps, chaveAcesso, this.ambiente);
    const result: NfseEmitResult = {
      chaveAcesso,
      idDps,
      xmlNfse: `<NFSe versao="1.01"><infNFSe Id="NFS${chaveAcesso}"/></NFSe>`,
      nfse,
      alertas: [],
      tipoAmbiente: this.ambiente,
      versaoAplicativo: 'NfseClientFake/0.6',
      dataHoraProcessamento: new Date(),
    };
    this.state.emitted.set(chaveAcesso, result);
    return { status: 'ok', nfse: result };
  }

  async emitirDpsPronta(
    dps: DpsFor<L>,
    options?: EmitOptions & { dryRun?: false },
  ): Promise<NfseEmitResult>;
  async emitirDpsPronta(
    dps: DpsFor<L>,
    options: EmitOptions & { dryRun: true },
  ): Promise<DpsDryRunResult>;
  async emitirDpsPronta(
    dps: DpsFor<L>,
    options?: EmitOptions,
  ): Promise<NfseEmitResult | DpsDryRunResult> {
    assertSameLayout(this.layout, dps);
    // Paridade com o real (buildDpsXml): campo do outro layout → LayoutMismatchError.
    assertNoForeignLayoutFields(dps);
    if (options?.dryRun) {
      return {
        dryRun: true,
        xmlDpsAssinado: `<?xml version="1.0"?><DPS versao="${dps.versao}"><infDPS Id="${dps.infDPS.Id}"/></DPS>`,
        xmlDpsGZipB64: 'FAKE_GZIP_B64',
      };
    }
    const failure = this.consumeFailure('emit');
    if (failure?.kind === 'rejection') {
      throw new ReceitaRejectionError({
        mensagens: [
          {
            codigo: failure.codigo,
            descricao: failure.descricao,
            ...(failure.complemento ? { complemento: failure.complemento } : {}),
          },
        ],
      });
    }
    if (failure?.kind === 'transient') {
      throw new TimeoutError(5000, { cause: new Error(failure.message ?? 'fake transient') });
    }

    const cnpj =
      'CNPJ' in dps.infDPS.prest.identificador
        ? dps.infDPS.prest.identificador.CNPJ
        : '00000000000000';
    const chaveAcesso = synthChaveAcesso(this.state.nextSequential++, cnpj, dps.infDPS.Id);
    const nfse = synthNfse(dps, chaveAcesso, this.ambiente);
    const result: NfseEmitResult = {
      chaveAcesso,
      idDps: dps.infDPS.Id,
      xmlNfse: `<NFSe versao="1.01"><infNFSe Id="NFS${chaveAcesso}"/></NFSe>`,
      nfse,
      alertas: [],
      tipoAmbiente: this.ambiente,
      versaoAplicativo: 'NfseClientFake/0.6',
      dataHoraProcessamento: new Date(),
    };
    this.state.emitted.set(chaveAcesso, result);
    return result;
  }

  async emitirEmLote(
    dpsList: readonly DpsFor<L>[],
    _options?: EmitLoteOptions,
  ): Promise<EmitLoteResult> {
    // Como o real: o lote inteiro é checado antes do primeiro "envio".
    for (const dps of dpsList) assertSameLayout(this.layout, dps);
    const items: EmitLoteItem[] = [];
    let successCount = 0;
    let failureCount = 0;
    for (const dps of dpsList) {
      try {
        const result = await this.emitirDpsPronta(dps);
        items.push({ status: 'success', dps, result });
        successCount++;
      } catch (err) {
        items.push({
          status: 'failure',
          dps,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        failureCount++;
      }
    }
    return { items, successCount, failureCount, skippedCount: 0 };
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------

  async cancelar(params: CancelarParams): Promise<CancelarResult> {
    // Mesmos guards offline do real, antes da falha programada (que simula o
    // POST): validarCancelamento + a montagem do pedido (TSIdPedRegEvt da
    // chave, TSVerAplic etc.) — pura, sem certificado.
    validarCancelamento(params);
    buildCancelamentoXml(params);
    const failure = this.consumeFailure('cancel');
    if (failure?.kind === 'rejection') {
      throw new ReceitaRejectionError({
        mensagens: [
          {
            codigo: failure.codigo,
            descricao: failure.descricao,
            ...(failure.complemento ? { complemento: failure.complemento } : {}),
          },
        ],
      });
    }
    if (failure?.kind === 'transient') {
      // Simulate transient — if a retryStore was passed, the real client would
      // persist here. The fake surfaces this by throwing a TimeoutError since
      // the fake doesn't implement the full retry flow.
      throw new TimeoutError(5000, { cause: new Error(failure.message ?? 'fake transient') });
    }

    this.state.cancelled.add(params.chaveAcesso);
    const evento = this.synthEventoResult(params.chaveAcesso, '101101');
    this.state.eventos.push(evento);
    return { status: 'ok', evento };
  }

  async substituir(params: SubstituirParams<L>): Promise<SubstituirResult> {
    assertSameLayout(this.layout, params.novaDps);
    // Mesmos guards do real (E0078, TSMotivo) + `infDPS.subst` auto-preenchido.
    // O layout é preservado, então a DPS continua sendo do layout `L`.
    const novaDps = prepararSubstituicao(params) as DpsFor<L>;
    const novaNfse = await this.emitirDpsPronta(novaDps);
    this.state.substituted.set(params.chaveOriginal, novaNfse.chaveAcesso);
    // Modela o sistema gerando o evento 105102 (autor=MEmis) que cancela a
    // original — o contribuinte não posta esse evento.
    this.state.cancelled.add(params.chaveOriginal);
    this.state.eventos.push(this.synthEventoResult(params.chaveOriginal, '105102'));
    return { status: 'ok', novaNfse };
  }

  async replayPendingEvents(_override?: RetryStore): Promise<ReplayItem[]> {
    // Fake não mantém RetryStore complexa — retorna vazio por default.
    // Para testar replay, o consumidor passa um store real.
    return [];
  }

  // -------------------------------------------------------------------------
  // Parâmetros Municipais
  // -------------------------------------------------------------------------

  async consultarAliquota(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaAliquotasResult> {
    const key = `${codigoMunicipio}:${codigoServico}:${String(competencia)}`;
    return this.state.aliquotas.get(key) ?? { aliquotas: {} };
  }

  async consultarHistoricoAliquotas(
    codigoMunicipio: string,
    codigoServico: string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaAliquotasResult> {
    const key = `${codigoMunicipio}:${codigoServico}`;
    return this.state.historicoAliquotas.get(key) ?? { aliquotas: {} };
  }

  async consultarBeneficio(
    codigoMunicipio: string,
    numeroBeneficio: string,
    competencia: Date | string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaBeneficioResult> {
    const key = `${codigoMunicipio}:${numeroBeneficio}:${String(competencia)}`;
    return this.state.beneficios.get(key) ?? {};
  }

  async consultarConvenio(
    codigoMunicipio: string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaConvenioResult> {
    return this.state.convenios.get(codigoMunicipio) ?? {};
  }

  async consultarRegimesEspeciais(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaRegimesEspeciaisResult> {
    const key = `${codigoMunicipio}:${codigoServico}:${String(competencia)}`;
    return this.state.regimesEspeciais.get(key) ?? { regimesEspeciais: {} };
  }

  async consultarRetencoes(
    codigoMunicipio: string,
    competencia: Date | string,
    _options?: ConsultaOptions,
  ): Promise<ConsultaRetencoesResult> {
    const key = `${codigoMunicipio}:${String(competencia)}`;
    return this.state.retencoes.get(key) ?? {};
  }

  // -------------------------------------------------------------------------
  // DANFSe
  // -------------------------------------------------------------------------

  async gerarDanfse(
    nfse: NFSe,
    options?: GerarDanfseOptions & { strategy?: 'auto' | 'online' | 'local' },
  ): Promise<Buffer> {
    // Fake sempre renderiza localmente (sem rede) — `strategy` é aceito para
    // paridade de assinatura com o NfseClient real, mas 'online'/'auto' caem
    // no mesmo renderer local determinístico.
    return gerarDanfseLocal(nfse, options);
  }

  async consultarDanfse(chaveAcesso: string): Promise<Buffer> {
    if (!REGEX_CHAVE_ACESSO.test(chaveAcesso)) {
      throw new InvalidChaveAcessoError(chaveAcesso);
    }
    // Fake: sempre gera localmente (sem rede). Se a chave não está seedada,
    // devolve um PDF mínimo com a chave no título para preservar rastreabilidade.
    const seeded = this.state.emitted.get(chaveAcesso);
    if (seeded) {
      return this.gerarDanfse(seeded.nfse);
    }
    // Returns a dummy PDF with just the chave — useful for assertions about calls
    return Buffer.from(`%PDF-1.4\nFake DANFSe for ${chaveAcesso}\n%%EOF\n`);
  }

  async close(): Promise<void> {
    // noop
  }

  // -------------------------------------------------------------------------
  // Introspection — read-only views do estado interno para assertions.
  // -------------------------------------------------------------------------

  /** Lista imutável de chaves emitidas (inclui seedadas). */
  get emittedChaves(): readonly string[] {
    return Array.from(this.state.emitted.keys());
  }
  /** Chaves canceladas (pelo método `cancelar`). */
  get cancelledChaves(): readonly string[] {
    return Array.from(this.state.cancelled);
  }
  /** Pares `original → nova` de substituições feitas. */
  get substituidas(): ReadonlyMap<string, string> {
    return this.state.substituted;
  }
  /** Eventos emitidos (cancel + substituição). */
  get eventosRegistrados(): readonly EventoResult[] {
    return this.state.eventos;
  }

  // -------------------------------------------------------------------------

  private consumeFailure(kind: 'emit' | 'cancel'): ProgrammedFailure | undefined {
    if (kind === 'emit') {
      const f = this.state.nextEmitFailure;
      this.state.nextEmitFailure = undefined;
      return f;
    }
    const f = this.state.nextCancelFailure;
    this.state.nextCancelFailure = undefined;
    return f;
  }

  private synthEventoResult(chaveAcesso: string, tipoEvento: string): EventoResult {
    return {
      xmlEvento: `<evento versao="1.01"><infEvento Id="EVT${chaveAcesso}${tipoEvento}001"/></evento>`,
      evento: {
        versao: '1.01',
        infEvento: {
          Id: `EVT${chaveAcesso}${tipoEvento}001`,
          verAplic: 'NfseClientFake/0.9',
          ambGer: '2' as never,
          nSeqEvento: '1',
          dhProc: new Date(),
          nDFSe: String(Date.now()),
          pedRegEvento: {
            versao: '1.01',
            infPedReg: {
              Id: `PRE${chaveAcesso}${tipoEvento}`,
              tpAmb: '2' as never,
              verAplic: 'NfseClientFake/0.6',
              dhEvento: new Date(),
              autor: { CNPJAutor: '00000000000000' },
              chNFSe: chaveAcesso,
              tipoEvento: tipoEvento as never,
              detalhe: {
                e101101: {
                  xDesc: 'Cancelamento de NFS-e',
                  cMotivo: '9' as never,
                  xMotivo: 'Fake',
                },
              },
            },
          },
        },
        signature: {
          signatureValue: 'FAKE',
          digestValue: 'FAKE',
          x509Certificate: 'FAKE',
          referenceUri: `#EVT${chaveAcesso}${tipoEvento}001`,
        },
      },
      tipoAmbiente: this.ambiente,
      versaoAplicativo: 'NfseClientFake/0.6',
      dataHoraProcessamento: new Date(),
    };
  }
}
