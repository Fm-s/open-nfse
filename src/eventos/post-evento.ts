import { TipoAmbiente } from '../ambiente.js';
import type { A1Certificate } from '../certificate/types.js';
import { ReceitaRejectionError, receitaRejectionFromResponseErro } from '../errors/receita.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import type { EventoProcessado } from './parse-event.js';
import { parseEventoXml } from './parse-event.js';
import { signPedRegEventoXml } from './sign-event.js';

/** Resultado do POST de um evento (cancelamento ou substituição). */
export interface EventoResult {
  /** XML cru do `<evento>` retornado pela Sefin, assinado. */
  readonly xmlEvento: string;
  /** Árvore tipada do evento. */
  readonly evento: EventoProcessado;
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}

interface SefinEventoSuccessBody {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly eventoXmlGZipB64: string;
}

interface SefinEventoErrorBody {
  readonly tipoAmbiente?: 1 | 2;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: string;
  readonly erro?: { codigo?: string; descricao?: string; complemento?: string };
}

type SefinEventoBody = SefinEventoSuccessBody | SefinEventoErrorBody;

/**
 * Assina (se ainda não estiver), comprime em gzip+base64 e posta um XML de
 * `<pedRegEvento>` no SEFIN. Retorna o evento processado ou lança
 * `ReceitaRejectionError` com o corpo `ResponseErro`.
 *
 * Passe `xmlJaAssinado: true` quando estiver reenviando um XML que já veio
 * assinado do RetryStore — nesse caso a assinatura é preservada.
 */
export async function postEvento(
  httpClient: HttpClient,
  certificate: A1Certificate,
  chaveAcesso: string,
  xmlPedido: string,
  options?: { xmlJaAssinado?: boolean },
): Promise<EventoResult & { xmlPedidoAssinado: string }> {
  const xmlAssinado = options?.xmlJaAssinado
    ? xmlPedido
    : signPedRegEventoXml(xmlPedido, certificate);
  const pedidoRegistroEventoXmlGZipB64 = gzipBase64Encode(xmlAssinado);

  const body = await httpClient.post<SefinEventoBody>(
    `/nfse/${chaveAcesso}/eventos`,
    { pedidoRegistroEventoXmlGZipB64 },
    { acceptedStatuses: [400, 422] },
  );

  if (isSuccessBody(body)) {
    const xmlEvento = gzipBase64DecodeToText(body.eventoXmlGZipB64);
    return {
      xmlPedidoAssinado: xmlAssinado,
      xmlEvento,
      evento: parseEventoXml(xmlEvento),
      tipoAmbiente: body.tipoAmbiente === 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
      versaoAplicativo: body.versaoAplicativo,
      dataHoraProcessamento: new Date(body.dataHoraProcessamento),
    };
  }

  const rejection = receitaRejectionFromResponseErro(body);
  if (rejection) throw rejection;

  throw new ReceitaRejectionError({
    mensagens: [{ codigo: 'UNKNOWN', descricao: 'Corpo de erro sem mensagens reconhecíveis.' }],
  });
}

function isSuccessBody(body: SefinEventoBody): body is SefinEventoSuccessBody {
  return typeof (body as SefinEventoSuccessBody).eventoXmlGZipB64 === 'string';
}
