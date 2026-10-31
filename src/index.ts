export type { AmbienteEndpoints } from './ambiente.js';
export { AMBIENTE_ENDPOINTS, Ambiente, TipoAmbiente } from './ambiente.js';
export type { CepInfo, CepValidator } from './cep/types.js';
export type { ViaCepOptions } from './cep/viacep.js';
export { createViaCepValidator } from './cep/viacep.js';
export { parsePfx } from './certificate/parse.js';

export { providerFromFile } from './certificate/provider.js';
export type {
  A1Certificate,
  CertificateInput,
  CertificateProvider,
  PfxCertificateInput,
} from './certificate/types.js';
export type { EmitenteConfig, FetchByNsuParams, NfseClientConfig, ReplayItem } from './client.js';
export { ClientClosedError, NfseClient } from './client.js';
export { consultarDanfse } from './danfse/fetch.js';
export type { GerarDanfseOptions } from './danfse/gerar.js';
// v0.7 — DANFSe PDF
export { gerarDanfse } from './danfse/gerar.js';
export type {
  DistributedDocument,
  FetchByNsuOptions,
  NsuQueryResult,
  ProcessingMessage,
} from './dfe/types.js';
export { StatusDistribuicao, TipoDocumento, TipoEvento } from './dfe/types.js';
export { OpenNfseError } from './errors/base.js';
export {
  CertificateError,
  ExpiredCertificateError,
  InvalidCertificateError,
  InvalidCertificatePasswordError,
} from './errors/certificate.js';
export type { HttpStatusErrorOptions } from './errors/http.js';
export {
  ForbiddenError,
  HttpError,
  HttpStatusError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
  UnauthorizedError,
} from './errors/http.js';
export type {
  MensagemProcessamento,
  RawNfsePostErrorBody,
  RawResponseErroBody,
  ReceitaRejectionErrorOptions,
} from './errors/receita.js';
export {
  ReceitaRejectionError,
  receitaRejectionFromPostError,
  receitaRejectionFromResponseErro,
} from './errors/receita.js';
export type { XsdViolation } from './errors/validation.js';
export {
  InvalidCepError,
  InvalidChaveAcessoError,
  InvalidCnpjError,
  InvalidCpfError,
  InvalidDpsIdError,
  InvalidLayoutError,
  InvalidXmlError,
  LayoutMismatchError,
  RuleViolationError,
  ValidationError,
  XsdValidationError,
} from './errors/validation.js';
export type {
  AutorEvento,
  BuildCancelamentoXmlParams,
  BuildEventoXmlOptions,
  BuildSubstituicaoXmlParams,
} from './eventos/build-event-xml.js';
// v0.3 — eventos (cancelamento + substituição)
export {
  buildCancelamentoXml,
  buildSubstituicaoXml,
} from './eventos/build-event-xml.js';
export type {
  CancelarParams,
  CancelarResult,
  SubstituirParams,
  SubstituirResult,
} from './eventos/cancelar.js';
export { cancelar, substituir } from './eventos/cancelar.js';
export type { BuildEventoPedidoIdParams } from './eventos/event-id.js';
export {
  buildEventoPedidoId,
  InvalidEventoPedidoIdParamError,
} from './eventos/event-id.js';
export type {
  AutorEventoParsed,
  DetalheEvento,
  EventoProcessado,
  InfEvento,
  InfoEventoAnulacaoRejeicao,
  InfoEventoRejeicao,
  InfPedRegEvento,
  PedRegEvento,
} from './eventos/parse-event.js';
export { parseEventoXml } from './eventos/parse-event.js';
export type { EventoResult } from './eventos/post-evento.js';
export { postEvento } from './eventos/post-evento.js';
export { signPedRegEventoXml } from './eventos/sign-event.js';
export { validateCnpj, validateCpf } from './fiscal/validate-cpf-cnpj.js';
export type { LogContext, Logger } from './logging.js';
export { noopLogger } from './logging.js';
export type {
  BuildDpsParams,
  BuildDpsParamsBase,
  BuildDpsParamsFor,
  BuildDpsParamsNt004,
  BuildDpsParamsNt009,
  EmitenteInput,
  EnderecoBr,
  RegimeTributario,
  ServicoInput,
  TomadorInput,
  ValoresInput,
} from './nfse/build-dps.js';
export { buildDps } from './nfse/build-dps.js';
export type { BuildDpsXmlOptions } from './nfse/build-xml.js';
export { buildDpsXml } from './nfse/build-xml.js';
export type {
  CollectedCep,
  CollectedIdentifier,
} from './nfse/collect-from-dps.js';
export {
  collectCepsFromDps,
  collectIdentifiersFromDps,
} from './nfse/collect-from-dps.js';
export type {
  AjusteBCIssqnNt009,
  AtvEvento,
  AtvEventoIdentificacao,
  BeneficioMunicipal,
  ComExterior,
  CServ,
  DocAjusteBCNt009,
  DocDedRedNt004,
  DocNFNFSNt004,
  DocOutNFSeNt004,
  DPS,
  DpsFor,
  DpsNt004,
  DpsNt009,
  Emitente,
  Endereco,
  EnderecoEmitente,
  EnderecoExterior,
  EnderecoExteriorSimples,
  EnderecoLocalidade,
  EnderecoNacional,
  EnderecoSimples,
  EnderecoSimplesLocalidade,
  EnderImovelNt009,
  EnderObraEvento,
  EnderObraEventoLocalidade,
  ExigSuspensa,
  IdentificadorEmitente,
  IdentificadorPessoa,
  ImovelIdentificacaoNt004,
  InfDPSNt004,
  InfDPSNt009,
  InfNFSeNt004,
  InfNFSeNt009,
  InfoAjusteBCNt009,
  InfoCompl,
  InfoDedRedNt004,
  InfoItemPed,
  InfoObra,
  InfoObraIdentificacao,
  InfoPessoaNt004,
  InfoPessoaNt009,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  InfoValoresNt004,
  InfoValoresNt009,
  ListaDocAjusteBCNt009,
  ListaDocDedRedNt004,
  LocPrest,
  NFSe,
  NfseFor,
  NfseNt004,
  NfseNt009,
  ReferenciaDocDedRedNt004,
  RegTrib,
  RtcDocumentoReferenciado,
  RtcIbsCbsNt004,
  RtcIbsCbsNt009,
  RtcInfoBensMoveisNt009,
  RtcInfoDest,
  RtcInfoIbsCbsNt004,
  RtcInfoIbsCbsNt009,
  RtcInfoImovelNt004,
  RtcInfoImovelNt009,
  RtcInfoReeRepResNt004,
  RtcInfoTribIbsCbsNt009,
  RtcInfoTributosDif,
  RtcInfoTributosIbsCbsNt004,
  RtcInfoTributosSitClasNt004,
  RtcInfoTributosSitClasNt009,
  RtcInfoTributosTribRegular,
  RtcInfoValoresIbsCbsNt004,
  RtcInfoValoresIbsCbsNt009,
  RtcListaDocDFe,
  RtcListaDocFiscalOutro,
  RtcListaDocFornec,
  RtcListaDocNt004,
  RtcListaDocOutro,
  RtcLocacaoImovelNt009,
  RtcTotalCbs,
  RtcTotalCbsCredPres,
  RtcTotalCIbsNt004,
  RtcTotalCIbsNt009,
  RtcTotalIbs,
  RtcTotalIbsCredPres,
  RtcTotalIbsMun,
  RtcTotalIbsUF,
  RtcTotalTribCompraGov,
  RtcTotalTribRegular,
  RtcUnidadeImobiliariaNt009,
  RtcValoresBCImoveisNt009,
  RtcValoresIbsCbsFed,
  RtcValoresIbsCbsMun,
  RtcValoresIbsCbsNt004,
  RtcValoresIbsCbsNt009,
  RtcValoresIbsCbsUF,
  Serv,
  Signature,
  Substituicao,
  TribFederal,
  TribMunicipal,
  TribOutrosPisCofins,
  TribTotal,
  TribTotalMonet,
  TribTotalPercent,
  UnidadeImobiliariaIdentificacaoNt009,
  ValoresNFSeNt004,
  ValoresNFSeNt009,
  VDescCondIncond,
  VServPrest,
} from './nfse/domain.js';
export type { DpsCounter, DpsCounterScope } from './nfse/dps-counter.js';
export {
  createInMemoryDpsCounter,
  MissingDpsCounterError,
} from './nfse/dps-counter.js';
export type { BuildDpsIdParams, TipoInscricaoEmitente } from './nfse/dps-id.js';
export { buildDpsId, InvalidDpsIdParamError } from './nfse/dps-id.js';
export type {
  DpsDryRunResult,
  EmitirParams,
  EmitirResult,
  EmitLoteItem,
  EmitLoteOptions,
  EmitLoteResult,
  EmitOptions,
  NfseEmitResult,
} from './nfse/emit.js';
export {
  AmbienteGerador,
  AmbienteGeradorEvento,
  CodigoNaoNif,
  CST,
  EnvioMDIC,
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaAnaliseFiscalCancelamento,
  JustificativaAnaliseFiscalCancelamentoDeferido,
  JustificativaAnaliseFiscalCancelamentoIndeferido,
  JustificativaCancelamento,
  JustificativaSubstituicao,
  MecanismoApoioComExPrestador,
  MecanismoApoioComExTomador,
  ModoPrestacao,
  MotivoEmissaoTomadorIntermediario,
  MotivoRejeicaoNfse,
  MovimentacaoTemporariaBens,
  ObjetoLocacao,
  OpcaoSimplesNacional,
  ProcessoEmissao,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  SituacaoNfse,
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoChaveDFe,
  TipoDedRed,
  TipoEmissao,
  TipoEmitenteDps,
  TipoEnteGovernamental,
  TipoEventoNfse,
  TipoExigSuspensa,
  TipoImunidadeISSQN,
  TipoOperacao,
  TipoReembolsoRepasse,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
  UF,
  VinculoPrestacao,
} from './nfse/enums.js';
export type { DpsStatusResult } from './nfse/fetch-dps-status.js';
export { existsDpsStatus, fetchDpsStatus } from './nfse/fetch-dps-status.js';
export type { Layout } from './nfse/layout.js';
export { LAYOUTS } from './nfse/layout.js';
export { parseNfseXml } from './nfse/parse-xml.js';
export { DpsAlreadySignedError, signDpsXml } from './nfse/sign-xml.js';
export type { NfseQueryResult } from './nfse/types.js';
export type {
  ValidateDpsXmlOptions,
  ValidateDpsXmlResult,
} from './nfse/validate-xml.js';
export {
  validateDpsXml,
  validateEventoXml,
  validatePedRegEventoXml,
} from './nfse/validate-xml.js';
export type { ParametrosCache } from './parametros-municipais/cache.js';
// v0.5 — Parâmetros Municipais
export {
  createInMemoryParametrosCache,
  DEFAULT_TTL_MS,
} from './parametros-municipais/cache.js';
export type { ConsultaOptions } from './parametros-municipais/fetch.js';
export {
  fetchAliquota,
  fetchBeneficio,
  fetchConvenio,
  fetchHistoricoAliquotas,
  fetchRegimesEspeciais,
  fetchRetencoes,
} from './parametros-municipais/fetch.js';
export type {
  Aliquota,
  Beneficio,
  BeneficioInscricao,
  BeneficioServico,
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
  ParametrosConvenio,
  RegimeEspecial,
  RetencaoArtigoSexto,
  RetencaoMunicipal,
  RetencaoMunicipalPorCodigoServico,
  RetencaoMunicipalServico,
  Retencoes,
  RetencoesArtigoSexto,
  TipoConfiguracaoRegimeEspecial,
  TipoConvenio,
  TipoInscricaoBeneficio,
  TipoReducaoBaseDeCalculo,
  TipoRetencaoISSQN,
  TipoSimNao,
  TipoSituacaoEmissaoPadraoContribuintesRFB,
} from './parametros-municipais/types.js';
export type { DefaultRetryPolicyOptions, RetryContext, RetryPolicy } from './retry/policy.js';
export { createDefaultRetryPolicy } from './retry/policy.js';
export type {
  PendingEmission,
  PendingEvent,
  PendingEventKind,
  PendingEventoCancelamento,
  RetryStore,
} from './retry/store.js';
export {
  createInMemoryRetryStore,
  isPendingEmission,
  isPendingEventoCancelamento,
  MissingRetryStoreError,
  pendingEmissionId,
  pendingEventId,
} from './retry/store.js';
// retry pipeline — transient classification + persistence + timing policy
export { defaultIsTransient } from './retry/transient.js';
