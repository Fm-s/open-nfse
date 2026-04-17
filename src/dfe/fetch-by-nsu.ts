import type { TipoAmbiente } from '../ambiente.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText } from '../http/encoding.js';
import type {
  DistributedDocument,
  FetchByNsuOptions,
  NsuQueryResult,
  ProcessingMessage,
  StatusDistribuicao,
  TipoDocumento,
  TipoEvento,
} from './types.js';

interface AdnLoteDistribuicaoResponse {
  readonly StatusProcessamento: StatusDistribuicao;
  readonly LoteDFe: AdnDistribuicaoNSU[] | null;
  readonly Alertas: AdnMensagemProcessamento[] | null;
  readonly Erros: AdnMensagemProcessamento[] | null;
  readonly TipoAmbiente: TipoAmbiente;
  readonly VersaoAplicativo: string;
  readonly DataHoraProcessamento: string;
}

interface AdnDistribuicaoNSU {
  readonly NSU: number | null;
  readonly ChaveAcesso: string | null;
  readonly TipoDocumento: TipoDocumento;
  readonly TipoEvento: TipoEvento | null;
  readonly ArquivoXml: string | null;
  readonly DataHoraGeracao: string | null;
}

interface AdnMensagemProcessamento {
  readonly Codigo: string | null;
  readonly Descricao: string | null;
  readonly Complemento: string | null;
}

export async function fetchByNsu(
  httpClient: HttpClient,
  ultimoNsu: number,
  options?: FetchByNsuOptions,
): Promise<NsuQueryResult> {
  // ADN Contribuintes returns 400/404 with the full LoteDistribuicaoNSUResponse
  // body when the request is rejected or there are no pending documents. The
  // HTTP status isn't an error signal for this endpoint — the StatusProcessamento
  // field inside the body is.
  const raw = await httpClient.get<AdnLoteDistribuicaoResponse>(buildPath(ultimoNsu, options), {
    acceptedStatuses: [400, 404],
  });
  const documentos = (raw.LoteDFe ?? []).map(mapDocument);

  return {
    status: raw.StatusProcessamento,
    documentos,
    alertas: (raw.Alertas ?? []).map(mapMessage),
    erros: (raw.Erros ?? []).map(mapMessage),
    ultimoNsu: documentos.reduce((max, doc) => Math.max(max, doc.nsu), ultimoNsu),
    tipoAmbiente: raw.TipoAmbiente,
    versaoAplicativo: raw.VersaoAplicativo,
    dataHoraProcessamento: new Date(raw.DataHoraProcessamento),
  };
}

function buildPath(ultimoNsu: number, options?: FetchByNsuOptions): string {
  const query = new URLSearchParams();
  if (options?.cnpjConsulta !== undefined) {
    query.set('cnpjConsulta', options.cnpjConsulta);
  }
  if (options?.lote !== undefined) {
    query.set('lote', String(options.lote));
  }
  const suffix = query.toString();
  return `/DFe/${ultimoNsu}${suffix ? `?${suffix}` : ''}`;
}

function mapDocument(wire: AdnDistribuicaoNSU): DistributedDocument {
  return {
    nsu: wire.NSU ?? 0,
    chaveAcesso: wire.ChaveAcesso ?? '',
    tipoDocumento: wire.TipoDocumento,
    tipoEvento: wire.TipoEvento,
    xmlDocumento: wire.ArquivoXml ? gzipBase64DecodeToText(wire.ArquivoXml) : '',
    dataHoraGeracao: wire.DataHoraGeracao ? new Date(wire.DataHoraGeracao) : new Date(0),
  };
}

function mapMessage(wire: AdnMensagemProcessamento): ProcessingMessage {
  return {
    codigo: wire.Codigo ?? '',
    descricao: wire.Descricao ?? '',
    complemento: wire.Complemento,
  };
}
