import type { TipoAmbiente } from '../ambiente.js';

export enum StatusDistribuicao {
  Rejeicao = 'REJEICAO',
  NenhumDocumento = 'NENHUM_DOCUMENTO_LOCALIZADO',
  DocumentosEncontrados = 'DOCUMENTOS_LOCALIZADOS',
}

export enum TipoDocumento {
  Nenhum = 'NENHUM',
  Dps = 'DPS',
  PedidoRegistroEvento = 'PEDIDO_REGISTRO_EVENTO',
  Nfse = 'NFSE',
  Evento = 'EVENTO',
  Cnc = 'CNC',
}

export enum TipoEvento {
  Cancelamento = 'CANCELAMENTO',
  SolicitacaoCancelamentoAnaliseFiscal = 'SOLICITACAO_CANCELAMENTO_ANALISE_FISCAL',
  CancelamentoPorSubstituicao = 'CANCELAMENTO_POR_SUBSTITUICAO',
  CancelamentoDeferidoAnaliseFiscal = 'CANCELAMENTO_DEFERIDO_ANALISE_FISCAL',
  CancelamentoIndeferidoAnaliseFiscal = 'CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL',
  ConfirmacaoPrestador = 'CONFIRMACAO_PRESTADOR',
  RejeicaoPrestador = 'REJEICAO_PRESTADOR',
  ConfirmacaoTomador = 'CONFIRMACAO_TOMADOR',
  RejeicaoTomador = 'REJEICAO_TOMADOR',
  ConfirmacaoIntermediario = 'CONFIRMACAO_INTERMEDIARIO',
  RejeicaoIntermediario = 'REJEICAO_INTERMEDIARIO',
  ConfirmacaoTacita = 'CONFIRMACAO_TACITA',
  AnulacaoRejeicao = 'ANULACAO_REJEICAO',
  CancelamentoPorOficio = 'CANCELAMENTO_POR_OFICIO',
  BloqueioPorOficio = 'BLOQUEIO_POR_OFICIO',
  DesbloqueioPorOficio = 'DESBLOQUEIO_POR_OFICIO',
  InclusaoNfseDan = 'INCLUSAO_NFSE_DAN',
  TributosNfseRecolhidos = 'TRIBUTOS_NFSE_RECOLHIDOS',
}

export interface ProcessingMessage {
  readonly codigo: string;
  readonly descricao: string;
  readonly complemento: string | null;
}

export interface DistributedDocument {
  readonly nsu: number;
  readonly chaveAcesso: string;
  readonly tipoDocumento: TipoDocumento;
  readonly tipoEvento: TipoEvento | null;
  readonly xmlDocumento: string;
  readonly dataHoraGeracao: Date;
}

export interface NsuQueryResult {
  readonly status: StatusDistribuicao;
  readonly documentos: DistributedDocument[];
  readonly alertas: ProcessingMessage[];
  readonly erros: ProcessingMessage[];
  /**
   * Cursor for the next page: max NSU across the returned batch, or the input
   * NSU if the batch is empty. Feed this back as `ultimoNsu` on the next call.
   */
  readonly ultimoNsu: number;
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}

export interface FetchByNsuOptions {
  readonly cnpjConsulta?: string;
  readonly lote?: boolean;
}
