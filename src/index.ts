export { Ambiente, TipoAmbiente } from './ambiente.js';
export type { AmbienteEndpoints } from './ambiente.js';

export { noopLogger } from './logging.js';
export type { LogContext, Logger } from './logging.js';

export { NfseClient } from './client.js';
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
export { ReceitaRejectionError } from './errors/receita.js';
export {
  InvalidChaveAcessoError,
  InvalidXmlError,
  ValidationError,
} from './errors/validation.js';

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
  CodigoNaoNif,
  CST,
  EnvioMDIC,
  FinalidadeNFSe,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  ModoPrestacao,
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

export { StatusDistribuicao, TipoDocumento, TipoEvento } from './dfe/types.js';
export type {
  DistributedDocument,
  FetchByNsuOptions,
  NsuQueryResult,
  ProcessingMessage,
} from './dfe/types.js';
