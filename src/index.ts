export { Ambiente, TipoAmbiente } from './ambiente.js';
export type { AmbienteEndpoints } from './ambiente.js';

export { noopLogger } from './logging.js';
export type { LogContext, Logger } from './logging.js';

export { ClientClosedError, NfseClient } from './client.js';
export type { EmitenteConfig, FetchByNsuParams, NfseClientConfig } from './client.js';

export { providerFromFile } from './certificate/provider.js';
export type {
  A1Certificate,
  CertificateInput,
  CertificateProvider,
  PfxCertificateInput,
} from './certificate/types.js';

export { OpenNfseError } from './errors/base.js';
export {
  CertificateError,
  ExpiredCertificateError,
  InvalidCertificateError,
  InvalidCertificatePasswordError,
} from './errors/certificate.js';
export {
  ForbiddenError,
  HttpError,
  HttpStatusError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  UnauthorizedError,
} from './errors/http.js';
export type { HttpStatusErrorOptions } from './errors/http.js';
export {
  ReceitaRejectionError,
  receitaRejectionFromPostError,
  receitaRejectionFromResponseErro,
} from './errors/receita.js';
export type {
  MensagemProcessamento,
  RawNfsePostErrorBody,
  RawResponseErroBody,
  ReceitaRejectionErrorOptions,
} from './errors/receita.js';
export {
  InvalidCepError,
  InvalidChaveAcessoError,
  InvalidCnpjError,
  InvalidCpfError,
  InvalidIdDpsError,
  InvalidXmlError,
  RuleViolationError,
  ValidationError,
  XsdValidationError,
} from './errors/validation.js';
export type { XsdViolation } from './errors/validation.js';

export type { NfseQueryResult } from './nfse/types.js';

export type {
  AtvEvento,
  AtvEventoIdentificacao,
  BeneficioMunicipal,
  CServ,
  ComExterior,
  DocDedRed,
  DocNFNFS,
  DocOutNFSe,
  DPS,
  Emitente,
  Endereco,
  EnderecoEmitente,
  EnderecoExterior,
  EnderecoLocalidade,
  EnderecoNacional,
  EnderecoSimples,
  EnderObraEvento,
  ExigSuspensa,
  ExploracaoRodoviaria,
  IdentificadorPessoa,
  ImovelIdentificacao,
  InfDPS,
  InfNFSe,
  InfoCompl,
  InfoDedRed,
  InfoItemPed,
  InfoObra,
  InfoObraIdentificacao,
  InfoPessoa,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  InfoValores,
  ListaDocDedRed,
  LocacaoSublocacao,
  LocPrest,
  NFSe,
  ReferenciaDocDedRed,
  RegTrib,
  RtcDocumentoReferenciado,
  RtcIbsCbs,
  RtcInfoDest,
  RtcInfoIbsCbs,
  RtcInfoImovel,
  RtcInfoReeRepRes,
  RtcInfoTributosDif,
  RtcInfoTributosIbsCbs,
  RtcInfoTributosSitClas,
  RtcInfoTributosTribRegular,
  RtcInfoValoresIbsCbs,
  RtcListaDoc,
  RtcListaDocDFe,
  RtcListaDocFiscalOutro,
  RtcListaDocFornec,
  RtcListaDocOutro,
  RtcTotalCbs,
  RtcTotalCbsCredPres,
  RtcTotalCIbs,
  RtcTotalIbs,
  RtcTotalIbsCredPres,
  RtcTotalIbsMun,
  RtcTotalIbsUF,
  RtcTotalTribCompraGov,
  RtcTotalTribRegular,
  RtcValoresIbsCbs,
  RtcValoresIbsCbsFed,
  RtcValoresIbsCbsMun,
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
  ValoresNFSe,
  VDescCondIncond,
  VServPrest,
} from './nfse/domain.js';

export {
  AmbienteGerador,
  AmbienteGeradorEvento,
  CodigoNaoNif,
  CST,
  JustificativaAnaliseFiscalCancelamento,
  JustificativaAnaliseFiscalCancelamentoDeferido,
  JustificativaAnaliseFiscalCancelamentoIndeferido,
  JustificativaCancelamento,
  TipoEventoNfse,
  EnvioMDIC,
  FinalidadeNFSe,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  ModoPrestacao,
  MotivoRejeicaoNfse,
  MotivoEmissaoTomadorIntermediario,
  MovimentacaoTemporariaBens,
  ObjetoLocacao,
  OpcaoSimplesNacional,
  ProcessoEmissao,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoDedRed,
  TipoEmissao,
  TipoEmitenteDps,
  TipoExigSuspensa,
  TipoImunidadeISSQN,
  TipoOperacao,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
  UF,
  VinculoPrestacao,
} from './nfse/enums.js';

export { parseNfseXml } from './nfse/parse-xml.js';

export { buildDpsId, InvalidDpsIdParamError } from './nfse/dps-id.js';
export type { BuildDpsIdParams, TipoInscricaoEmitente } from './nfse/dps-id.js';

export { buildDpsXml } from './nfse/build-xml.js';
export type { BuildDpsXmlOptions } from './nfse/build-xml.js';

export { buildDps } from './nfse/build-dps.js';
export type {
  BuildDpsParams,
  EmitenteInput,
  EnderecoBr,
  RegimeTributario,
  ServicoInput,
  TomadorInput,
  ValoresInput,
} from './nfse/build-dps.js';

export { signDpsXml, DpsAlreadySignedError } from './nfse/sign-xml.js';

// v0.3 — eventos (cancelamento + substituição)
export {
  buildCancelamentoXml,
  buildSubstituicaoXml,
} from './eventos/build-event-xml.js';
export type {
  AutorEvento,
  BuildCancelamentoXmlParams,
  BuildEventoXmlOptions,
  BuildSubstituicaoXmlParams,
} from './eventos/build-event-xml.js';
export { cancelar, substituir } from './eventos/cancelar.js';
export type {
  CancelarParams,
  CancelarResult,
  SubstituirParams,
  SubstituirResult,
} from './eventos/cancelar.js';
export { defaultIsTransient } from './eventos/classify-error.js';
export {
  buildEventoPedidoId,
  InvalidEventoPedidoIdParamError,
} from './eventos/event-id.js';
export type { BuildEventoPedidoIdParams } from './eventos/event-id.js';
export { parseEventoXml } from './eventos/parse-event.js';
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
export { postEvento } from './eventos/post-evento.js';
export type { EventoResult } from './eventos/post-evento.js';
export {
  createInMemoryRetryStore,
  isPendingEmission,
  isPendingEventoCancelamento,
  MissingRetryStoreError,
  pendingEmissionId,
  pendingEventId,
} from './eventos/retry-store.js';
export type {
  PendingEmission,
  PendingEvent,
  PendingEventKind,
  PendingEventoCancelamento,
  RetryStore,
} from './eventos/retry-store.js';
export { signPedRegEventoXml } from './eventos/sign-event.js';
export type { ReplayItem } from './client.js';

// v0.5 — Parâmetros Municipais
export {
  createInMemoryParametrosCache,
  DEFAULT_TTL_MS,
} from './parametros-municipais/cache.js';
export type { ParametrosCache } from './parametros-municipais/cache.js';
export {
  fetchAliquota,
  fetchBeneficio,
  fetchConvenio,
  fetchHistoricoAliquotas,
  fetchRegimesEspeciais,
  fetchRetencoes,
} from './parametros-municipais/fetch.js';
export type { ConsultaOptions } from './parametros-municipais/fetch.js';

// v0.7 — DANFSe PDF
export { gerarDanfse } from './danfse/gerar.js';
export type { GerarDanfseOptions } from './danfse/gerar.js';
export { fetchDanfse } from './danfse/fetch.js';
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

export {
  validateDpsXml,
  validateEventoXml,
  validatePedRegEventoXml,
} from './nfse/validate-xml.js';

export { existsDpsStatus, fetchDpsStatus } from './nfse/fetch-dps-status.js';
export type { DpsStatusResult } from './nfse/fetch-dps-status.js';

export { validateCnpj, validateCpf } from './fiscal/validate-cpf-cnpj.js';
export { createViaCepValidator } from './cep/viacep.js';
export type { ViaCepOptions } from './cep/viacep.js';
export type { CepInfo, CepValidator } from './cep/types.js';
export {
  collectCepsFromDps,
  collectIdentifiersFromDps,
} from './nfse/collect-from-dps.js';
export type {
  CollectedCep,
  CollectedIdentifier,
} from './nfse/collect-from-dps.js';
export type {
  ValidateDpsXmlOptions,
  ValidateDpsXmlResult,
} from './nfse/validate-xml.js';

export type {
  DpsDryRunResult,
  EmitLoteItem,
  EmitLoteResult,
  EmitManyOptions,
  EmitOptions,
  EmitirParams,
  EmitirResult,
  NfseEmitResult,
} from './nfse/emit.js';

export {
  createInMemoryDpsCounter,
  MissingDpsCounterError,
} from './nfse/dps-counter.js';
export type { DpsCounter, DpsCounterScope } from './nfse/dps-counter.js';

export { StatusDistribuicao, TipoDocumento, TipoEvento } from './dfe/types.js';
export type {
  DistributedDocument,
  FetchByNsuOptions,
  NsuQueryResult,
  ProcessingMessage,
} from './dfe/types.js';
