export enum AmbienteGerador {
  Prefeitura = '1',
  SefinNacional = '2',
}

export enum TipoEmissao {
  Normal = '1',
  TranscricaoLeiauteMunicipal = '2',
}

export enum ProcessoEmissao {
  WebService = '1',
  Web = '2',
  App = '3',
}

/**
 * Situação da NFS-e (`TStat`), campo `InfNFSe/cStat`. Valor gerado pela Sefin —
 * presente apenas no documento autorizado (caminho de leitura), nunca emitido.
 */
export enum SituacaoNfse {
  Gerada = '100',
  DecisaoJudicial = '102',
  Avulsa = '103',
  Mei = '107',
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

/** Regime especial de tributação (`TSRegEspTrib`). */
export enum RegimeEspecialTributacao {
  Nenhum = '0',
  AtoCooperado = '1',
  Estimativa = '2',
  MicroempresaMunicipal = '3',
  NotarioRegistrador = '4',
  ProfissionalAutonomo = '5',
  SociedadeProfissionais = '6',
  Outros = '9',
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

/**
 * Código de Situação Tributária do PIS/COFINS (`TSTipoCST`). Domínio completo
 * conforme NT SE/CGNFS-e nº 007 (em produção desde 2026-02-09) — antes a lib
 * só cobria `00`–`09` e rotulava `07` como "Tributável da Contribuição"
 * (errado: `07` é Isenta).
 */
export enum CST {
  Nenhum = '00',
  TributavelAliquotaBasica = '01',
  TributavelAliquotaDiferenciada = '02',
  TributavelAliquotaPorUnidade = '03',
  TributavelMonofasicaRevendaAliquotaZero = '04',
  TributavelSubstituicaoTributaria = '05',
  TributavelAliquotaZero = '06',
  IsentaDaContribuicao = '07',
  SemIncidenciaDaContribuicao = '08',
  SuspensaoDaContribuicao = '09',
  OutrasOperacoesDeSaida = '49',
  CreditoVinculadoExclusivamenteReceitaTributadaMI = '50',
  CreditoVinculadoExclusivamenteReceitaNaoTributadaMI = '51',
  CreditoVinculadoExclusivamenteReceitaExportacao = '52',
  CreditoVinculadoReceitasTributadasNaoTributadasMI = '53',
  CreditoVinculadoReceitasTributadasMIExportacao = '54',
  CreditoVinculadoReceitasNaoTributadasMIExportacao = '55',
  CreditoVinculadoReceitasTributadasNaoTributadasMIExportacao = '56',
  CreditoPresumidoAquisicaoExclusivamenteReceitaTributadaMI = '60',
  CreditoPresumidoAquisicaoExclusivamenteReceitaNaoTributadaMI = '61',
  CreditoPresumidoAquisicaoExclusivamenteReceitaExportacao = '62',
  CreditoPresumidoAquisicaoReceitasTributadasNaoTributadasMI = '63',
  CreditoPresumidoAquisicaoReceitasTributadasMIExportacao = '64',
  CreditoPresumidoAquisicaoReceitasNaoTributadasMIExportacao = '65',
  CreditoPresumidoAquisicaoReceitasTributadasNaoTributadasMIExportacao = '66',
  CreditoPresumidoOutrasOperacoes = '67',
  AquisicaoSemDireitoCredito = '70',
  AquisicaoComIsencao = '71',
  AquisicaoComSuspensao = '72',
  AquisicaoAliquotaZero = '73',
  AquisicaoSemIncidenciaContribuicao = '74',
  AquisicaoSubstituicaoTributaria = '75',
  OutrasOperacoesDeEntrada = '98',
  OutrasOperacoes = '99',
}

/**
 * Tipo de retenção de PIS/COFINS e CSLL (`TSTipoRetPISCofins`). Domínio
 * expandido pela NT SE/CGNFS-e nº 007 (em produção desde 2026-02-09): antes a
 * lib (e o schema) só aceitavam `1`/`2`; agora `0` e `3`–`9` cobrem também a
 * CSLL. Os códigos `1`/`2` serão suprimidos quando o grupo `IBSCBS` se tornar
 * obrigatório — mantidos por ora para a transição.
 */
export enum TipoRetPisCofins {
  PisCofinsCsllNaoRetidos = '0',
  PisCofinsRetidos = '1',
  PisCofinsNaoRetidos = '2',
  PisCofinsCsllRetidos = '3',
  PisCofinsRetidosCsllNaoRetido = '4',
  PisRetidoCofinsCsllNaoRetido = '5',
  CofinsRetidoPisCsllNaoRetido = '6',
  PisNaoRetidoCofinsCsllRetidos = '7',
  PisCofinsNaoRetidosCsllRetido = '8',
  CofinsNaoRetidoPisCsllRetidos = '9',
}

export enum IndicadorTotalTributos {
  Nao = '0',
}

export enum TipoDedRed {
  AlimentacaoBebidas = '1',
  Materiais = '2',
  ProducaoExterna = '3',
  ReembolsoDespesas = '4',
  RepasseConsorciado = '5',
  RepassePlanoSaude = '6',
  Servicos = '7',
  SubempreitadaMaoObra = '8',
  ProfissionalParceiro = '9',
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
  PresencaComercialExterior = '3',
  MovimentoTemporarioPF = '4',
}

export enum VinculoPrestacao {
  SemVinculo = '0',
  Controlada = '1',
  Controladora = '2',
  Coligada = '3',
  Matriz = '4',
  FilialSucursal = '5',
  OutroVinculo = '6',
  Desconhecido = '9',
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

/**
 * Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo **prestador**
 * (`TSMecAFComExPrest`), campo `comExt/mecAFComexP`.
 */
export enum MecanismoApoioComExPrestador {
  Desconhecido = '00',
  Nenhum = '01',
  /** ACC — Adiantamento sobre Contrato de Câmbio. */
  Acc = '02',
  /** ACE — Adiantamento sobre Cambiais Entregues. */
  Ace = '03',
  BndesEximPosEmbarque = '04',
  BndesEximPreEmbarque = '05',
  /** FGE — Fundo de Garantia à Exportação. */
  Fge = '06',
  ProexEqualizacao = '07',
  ProexFinanciamento = '08',
}

/**
 * Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo **tomador**
 * (`TSMecAFComExToma`), campo `comExt/mecAFComexT`.
 */
export enum MecanismoApoioComExTomador {
  Desconhecido = '00',
  Nenhum = '01',
  AdmPublicaReprInternacional = '02',
  AlugueisArrendMercantilMaquinas = '03',
  ArrendamentoMercantilAeronaveTransporteAereo = '04',
  ComissaoAgentesExternosExportacao = '05',
  DespesasArmazenagemTransporteCargaExterior = '06',
  EventosFifaSubsidiaria = '07',
  EventosFifa = '08',
  FretesArrendamentosEmbarcacoesAeronaves = '09',
  MaterialAeronautico = '10',
  PromocaoBensExterior = '11',
  PromocaoDestinosTuristicosBrasileiros = '12',
  PromocaoBrasilExterior = '13',
  PromocaoServicosExterior = '14',
  Recine = '15',
  Recopa = '16',
  RegistroManutencaoMarcasPatentes = '17',
  Reicomp = '18',
  Reidi = '19',
  Repenec = '20',
  Repes = '21',
  Retaero = '22',
  Retid = '23',
  RoyaltiesAssistenciaTecnicaCientifica = '24',
  ServicosAvaliacaoConformidadeOMC = '25',
  Zpe = '26',
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

/**
 * Indicador do destinatário dos serviços (`TSRTCIndDest`), campo
 * `IBSCBS/.../indDest`.
 */
export enum IndicadorDestinatario {
  /** O destinatário é o próprio tomador/adquirente (tomador = adquirente = destinatário). */
  TomadorEhDestinatario = '0',
  /** O destinatário não é o próprio adquirente (tomador = adquirente ≠ destinatário). */
  DestinatarioDistinto = '1',
}

export enum TipoOperacao {
  FornecimentoComPagamentoPosterior = '1',
  RecebimentoPagamentoFornecimentoRealizado = '2',
  FornecimentoComPagamentoJaRealizado = '3',
  RecebimentoPagamentoFornecimentoPosterior = '4',
  FornecimentoRecebimentoConcomitantes = '5',
}

/** Tipo de ente governamental (`TSRTCTpEnteGov`). */
export enum TipoEnteGovernamental {
  Uniao = '1',
  Estado = '2',
  DistritoFederal = '3',
  Municipio = '4',
}

/** Tipo de reembolso/repasse/ressarcimento (`TSRTCTpReeRepRes`). */
export enum TipoReembolsoRepasse {
  RepasseIntermediacaoImoveis = '01',
  RepasseFornecedorAgenciaTurismo = '02',
  ReembolsoAgenciaPublicidadeProducaoExterna = '03',
  ReembolsoAgenciaPublicidadeMidia = '04',
  Outros = '99',
}

/** Tipo da chave do documento fiscal referenciado (`TSRTCTipoChaveDFe`). */
export enum TipoChaveDFe {
  Nfse = '1',
  NFe = '2',
  CTe = '3',
  Outro = '9',
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
