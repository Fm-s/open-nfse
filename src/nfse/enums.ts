export enum AmbienteGerador {
  Prefeitura = '1',
  SefinNacional = '2',
  Outros = '3',
}

export enum TipoEmissao {
  Normal = '1',
  ContingenciaOffline = '2',
  ContingenciaOnline = '3',
}

export enum ProcessoEmissao {
  WebService = '1',
  Web = '2',
  App = '3',
}

export enum TipoAmbienteDps {
  Producao = '1',
  Homologacao = '2',
}

/** Código do evento NFS-e (RTC v1.01). Subconjunto usado hoje. */
export enum TipoEventoNfse {
  Cancelamento = '101101',
  SolicitacaoAnaliseFiscalCancelamento = '101103',
  CancelamentoPorSubstituicao = '105102',
  CancelamentoDeferidoAnaliseFiscal = '105104',
  CancelamentoIndeferidoAnaliseFiscal = '105105',
  ConfirmacaoPrestador = '202201',
  ConfirmacaoTomador = '203202',
  ConfirmacaoIntermediario = '204203',
  ConfirmacaoTacita = '205204',
  RejeicaoPrestador = '202205',
  RejeicaoTomador = '203206',
  RejeicaoIntermediario = '204207',
  AnulacaoRejeicao = '205208',
  CancelamentoPorOficio = '305101',
  BloqueioPorOficio = '305102',
  DesbloqueioPorOficio = '305103',
  /**
   * Eventos sistêmicos da Sefin não declarados em `tiposEventos_v1.01.xsd`.
   * Aparecem no enum `tipoEvento` do endpoint `GET /nfse/{chave}/eventos/{tipoEvento}/{numSeqEvento}`.
   * Parser cai no fallback `unknown` ao recebê-los (shape exato não publicada).
   */
  EventoSistemico467201 = '467201',
  EventoSistemico907201 = '907201',
}

/** Ambiente gerador do evento. Per XSD `TSAmbGeradorEvt`. */
export enum AmbienteGeradorEvento {
  Prefeitura = '1',
  SefinNacional = '2',
  AmbienteNacional = '3',
}

/**
 * Códigos de justificativa para cancelamento (evento 101101). Per XSD
 * `TSCodJustCanc`.
 */
export enum JustificativaCancelamento {
  ErroEmissao = '1',
  ServicoNaoPrestado = '2',
  Outros = '9',
}

export enum TipoEmitenteDps {
  Prestador = '1',
  Tomador = '2',
  Intermediario = '3',
}

export enum MotivoEmissaoTomadorIntermediario {
  ImportacaoServico = '1',
  TomadorObrigadoEmitir = '2',
  RecusaEmissaoPrestador = '3',
  RejeicaoNfsePrestador = '4',
}

export enum OpcaoSimplesNacional {
  NaoOptante = '1',
  Mei = '2',
  MeEpp = '3',
}

export enum RegimeApuracaoSimplesNacional {
  FederalEMunicipalPeloSN = '1',
  FederalPeloSNMunicipalFora = '2',
  FederalEMunicipalFora = '3',
}

export enum RegimeEspecialTributacao {
  Nenhum = '0',
  AtoCooperado = '1',
  Estimativa = '2',
  MicroempresaMunicipal = '3',
  NotarioRegistrador = '4',
  ProfissionalAutonomo = '5',
  SociedadeProfissionais = '6',
}

export enum CodigoNaoNif {
  NaoInformado = '0',
  Dispensado = '1',
  NaoExigido = '2',
}

export enum TipoTribISSQN {
  OperacaoTributavel = '1',
  Imunidade = '2',
  ExportacaoServico = '3',
  NaoIncidencia = '4',
}

export enum TipoImunidadeISSQN {
  NaoInformado = '0',
  PatrimonioRendaServicos = '1',
  TemplosDeCulto = '2',
  PartidosPoliticos = '3',
  LivrosJornais = '4',
  FonogramasVideofonogramas = '5',
}

export enum TipoBeneficioMunicipal {
  Isencao = '1',
  ReducaoPercentual = '2',
  ReducaoMonetaria = '3',
  AliquotaDiferenciada = '4',
}

export enum TipoExigSuspensa {
  DecisaoJudicial = '1',
  ProcessoAdministrativo = '2',
}

export enum TipoRetISSQN {
  NaoRetido = '1',
  RetidoPeloTomador = '2',
  RetidoPeloIntermediario = '3',
}

export enum CST {
  Nenhum = '00',
  TributavelAliquotaBasica = '01',
  TributavelAliquotaDiferenciada = '02',
  TributavelAliquotaPorUnidade = '03',
  TributavelMonofasicaRevendaAliquotaZero = '04',
  TributavelSubstituicaoTributaria = '05',
  TributavelAliquotaZero = '06',
  TributavelDaContribuicao = '07',
  SemIncidenciaDaContribuicao = '08',
  SuspensaoDaContribuicao = '09',
}

export enum TipoRetPisCofins {
  Retido = '1',
  NaoRetido = '2',
}

export enum IndicadorTotalTributos {
  Nao = '0',
}

export enum TipoDedRed {
  AlimentacaoBebidas = '1',
  Materiais = '2',
  RepasseConsorciado = '5',
  RepassePlanoSaude = '6',
  Servicos = '7',
  SubempreitadaMaoObra = '8',
  Outras = '99',
}

export enum JustificativaSubstituicao {
  DesenquadramentoSN = '01',
  EnquadramentoSN = '02',
  InclusaoImunidadeIsencao = '03',
  ExclusaoImunidadeIsencao = '04',
  RejeicaoTomadorIntermediario = '05',
  Outros = '99',
}

/**
 * Código do motivo da solicitação de análise fiscal para cancelamento de
 * NFS-e (evento 101103). Per XSD `TSCodJustAnaliseFiscalCanc`.
 */
export enum JustificativaAnaliseFiscalCancelamento {
  ErroEmissao = '1',
  ServicoNaoPrestado = '2',
  Outros = '9',
}

/**
 * Resposta da análise da solicitação de cancelamento extemporâneo — deferido
 * (evento 105104). Per XSD `TSCodJustAnaliseFiscalCancDef`.
 */
export enum JustificativaAnaliseFiscalCancelamentoDeferido {
  Deferido = '1',
}

/**
 * Resposta da análise da solicitação de cancelamento extemporâneo —
 * indeferido (evento 105105). Per XSD `TSCodJustAnaliseFiscalCancIndef`.
 */
export enum JustificativaAnaliseFiscalCancelamentoIndeferido {
  Indeferido = '1',
  IndeferidoSemAnaliseDeMerito = '2',
}

/**
 * Motivo da rejeição de NFS-e pelo prestador/tomador/intermediário
 * (eventos 202205, 203206, 204207, no campo `infRej.cMotivo`). Per XSD
 * `TSCodMotivoRejeicao`.
 */
export enum MotivoRejeicaoNfse {
  Duplicidade = '1',
  JaEmitidaPeloTomador = '2',
  SemFatoGerador = '3',
  ErroResponsabilidadeTributaria = '4',
  ErroValorOuDataFatoGerador = '5',
  Outros = '9',
}

export enum ModoPrestacao {
  Desconhecido = '0',
  Transfronteirico = '1',
  ConsumoNoBrasil = '2',
  MovimentoTemporarioPF = '3',
  ConsumoNoExterior = '4',
}

export enum VinculoPrestacao {
  SemVinculo = '0',
  Controlada = '1',
  Controladora = '2',
  Coligada = '3',
  Matriz = '4',
  FilialSucursal = '5',
  OutroVinculo = '6',
}

export enum MovimentacaoTemporariaBens {
  Desconhecido = '0',
  Nao = '1',
  DeclaracaoImportacao = '2',
  DeclaracaoExportacao = '3',
}

export enum EnvioMDIC {
  NaoEnviar = '0',
  Enviar = '1',
}

export enum ObjetoLocacao {
  Ferrovia = '1',
  Rodovia = '2',
  Postes = '3',
  Cabos = '4',
  Dutos = '5',
  CondutosOutros = '6',
}

export enum FinalidadeNFSe {
  Regular = '0',
}

export enum IndicadorFinal {
  Nao = '0',
  Sim = '1',
}

export enum TipoOperacao {
  FornecimentoComPagamentoPosterior = '1',
  RecebimentoPagamentoFornecimentoRealizado = '2',
  FornecimentoComPagamentoJaRealizado = '3',
  RecebimentoPagamentoFornecimentoPosterior = '4',
  FornecimentoRecebimentoConcomitantes = '5',
}

export enum UF {
  AC = 'AC',
  AL = 'AL',
  AP = 'AP',
  AM = 'AM',
  BA = 'BA',
  CE = 'CE',
  DF = 'DF',
  ES = 'ES',
  GO = 'GO',
  MA = 'MA',
  MT = 'MT',
  MS = 'MS',
  MG = 'MG',
  PA = 'PA',
  PB = 'PB',
  PR = 'PR',
  PE = 'PE',
  PI = 'PI',
  RJ = 'RJ',
  RN = 'RN',
  RS = 'RS',
  RO = 'RO',
  RR = 'RR',
  SC = 'SC',
  SP = 'SP',
  SE = 'SE',
  TO = 'TO',
}
