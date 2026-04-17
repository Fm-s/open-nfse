import { TipoAmbiente } from '../ambiente.js';
import { OpenNfseError } from './base.js';

/** Uma única mensagem de processamento retornada pela Receita (código + descrição). */
export interface MensagemProcessamento {
  readonly codigo: string;
  readonly descricao: string;
  readonly complemento?: string;
}

export interface ReceitaRejectionErrorOptions {
  /** Lista de mensagens retornadas. Deve ter ao menos uma entrada. */
  readonly mensagens: readonly MensagemProcessamento[];
  /** Identificador do DPS quando a Receita conseguiu extraí-lo do XML rejeitado. */
  readonly idDps?: string;
  readonly tipoAmbiente?: TipoAmbiente;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: Date;
  readonly cause?: unknown;
}

/**
 * Rejeição retornada pela Receita após o processamento de uma DPS, evento ou
 * consulta. Carrega a lista completa de mensagens — quando houver apenas uma,
 * os acessores `codigo`/`descricao`/`complemento` retornam essa entrada.
 *
 * Mensagem formatada por `Error.message`: `Rejeição da Receita [E001]: descrição (+N erros)`.
 */
export class ReceitaRejectionError extends OpenNfseError {
  readonly mensagens: readonly MensagemProcessamento[];
  readonly idDps: string | undefined;
  readonly tipoAmbiente: TipoAmbiente | undefined;
  readonly versaoAplicativo: string | undefined;
  readonly dataHoraProcessamento: Date | undefined;

  constructor(options: ReceitaRejectionErrorOptions) {
    const primeira = options.mensagens[0];
    if (!primeira) {
      throw new Error('ReceitaRejectionError requer ao menos uma mensagem.');
    }
    const extras = options.mensagens.length - 1;
    const sufixo = extras > 0 ? ` (+${extras} erro${extras > 1 ? 's' : ''})` : '';
    super(`Rejeição da Receita [${primeira.codigo}]: ${primeira.descricao}${sufixo}`, {
      cause: options.cause,
    });
    this.mensagens = options.mensagens;
    this.idDps = options.idDps;
    this.tipoAmbiente = options.tipoAmbiente;
    this.versaoAplicativo = options.versaoAplicativo;
    this.dataHoraProcessamento = options.dataHoraProcessamento;
  }

  private get primeira(): MensagemProcessamento {
    // safe: constructor rejects empty arrays
    return this.mensagens[0] as MensagemProcessamento;
  }

  /** Código da primeira mensagem (shortcut para `mensagens[0].codigo`). */
  get codigo(): string {
    return this.primeira.codigo;
  }

  /** Descrição da primeira mensagem (shortcut para `mensagens[0].descricao`). */
  get descricao(): string {
    return this.primeira.descricao;
  }

  /** Complemento da primeira mensagem, se houver. */
  get complemento(): string | undefined {
    return this.primeira.complemento;
  }
}

// ---------------------------------------------------------------------------
// Factories — traduzem corpos brutos do SEFIN Nacional em erros tipados.
// ---------------------------------------------------------------------------

/** Corpo bruto de `POST /nfse` quando a DPS é rejeitada (NFSePostResponseErro). */
export interface RawNfsePostErrorBody {
  readonly tipoAmbiente?: 1 | 2;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: string;
  readonly idDPS?: string;
  readonly erros?: ReadonlyArray<Partial<MensagemProcessamento>>;
}

/** Corpo bruto genérico (`ResponseErro`) retornado pelos GETs do SEFIN. */
export interface RawResponseErroBody {
  readonly tipoAmbiente?: 1 | 2;
  readonly versaoAplicativo?: string;
  readonly dataHoraProcessamento?: string;
  readonly erro?: Partial<MensagemProcessamento>;
}

/**
 * Converte o corpo de um `POST /nfse` rejeitado em `ReceitaRejectionError`.
 * Retorna `undefined` se o corpo não carregar nenhuma mensagem reconhecível.
 */
export function receitaRejectionFromPostError(
  body: RawNfsePostErrorBody,
  options?: { cause?: unknown },
): ReceitaRejectionError | undefined {
  const mensagens = (body.erros ?? []).flatMap(toMensagem);
  if (mensagens.length === 0) return undefined;
  const tipoAmbiente = toTipoAmbiente(body.tipoAmbiente);
  const dataHora = toDate(body.dataHoraProcessamento);
  return new ReceitaRejectionError({
    mensagens,
    ...(body.idDPS ? { idDps: body.idDPS } : {}),
    ...(tipoAmbiente ? { tipoAmbiente } : {}),
    ...(body.versaoAplicativo ? { versaoAplicativo: body.versaoAplicativo } : {}),
    ...(dataHora ? { dataHoraProcessamento: dataHora } : {}),
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  });
}

/**
 * Converte o corpo `ResponseErro` (mensagem única) em `ReceitaRejectionError`.
 * Retorna `undefined` se o corpo não carregar uma mensagem reconhecível.
 */
export function receitaRejectionFromResponseErro(
  body: RawResponseErroBody,
  options?: { cause?: unknown },
): ReceitaRejectionError | undefined {
  const mensagens = body.erro ? toMensagem(body.erro) : [];
  if (mensagens.length === 0) return undefined;
  const tipoAmbiente = toTipoAmbiente(body.tipoAmbiente);
  const dataHora = toDate(body.dataHoraProcessamento);
  return new ReceitaRejectionError({
    mensagens,
    ...(tipoAmbiente ? { tipoAmbiente } : {}),
    ...(body.versaoAplicativo ? { versaoAplicativo: body.versaoAplicativo } : {}),
    ...(dataHora ? { dataHoraProcessamento: dataHora } : {}),
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  });
}

function toMensagem(raw: Partial<MensagemProcessamento> | undefined): MensagemProcessamento[] {
  if (!raw) return [];
  const codigo = typeof raw.codigo === 'string' && raw.codigo.length > 0 ? raw.codigo : undefined;
  const descricao =
    typeof raw.descricao === 'string' && raw.descricao.length > 0 ? raw.descricao : undefined;
  if (!codigo && !descricao) return [];
  return [
    {
      codigo: codigo ?? 'UNKNOWN',
      descricao: descricao ?? '(sem descrição)',
      ...(typeof raw.complemento === 'string' && raw.complemento.length > 0
        ? { complemento: raw.complemento }
        : {}),
    },
  ];
}

function toTipoAmbiente(v: 1 | 2 | undefined): TipoAmbiente | undefined {
  if (v === 1) return TipoAmbiente.Producao;
  if (v === 2) return TipoAmbiente.Homologacao;
  return undefined;
}

function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
