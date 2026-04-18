import type { DistributedDocument } from '../dfe/types.js';
import type { EventoResult } from '../eventos/post-evento.js';
import type { NfseEmitResult } from '../nfse/emit.js';
import type {
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
} from '../parametros-municipais/types.js';

/** Próxima falha programada para o `emitir`/`cancelar`. */
export type ProgrammedFailure =
  | {
      readonly kind: 'rejection';
      readonly codigo: string;
      readonly descricao: string;
      readonly complemento?: string;
    }
  | {
      readonly kind: 'transient';
      readonly message?: string;
    };

/** Estado interno mutável do `NfseClientFake`. Não exposto ao público. */
export class FakeState {
  /** NFS-e emitidas ou pré-populadas via `seed.nfse`. Chave: chaveAcesso. */
  readonly emitted = new Map<string, NfseEmitResult>();
  /** NFS-e canceladas. */
  readonly cancelled = new Set<string>();
  /** `chaveOriginal → chaveNova` — pares de substituição. */
  readonly substituted = new Map<string, string>();
  /** Eventos registrados (cancelamento, substituição). */
  readonly eventos: EventoResult[] = [];
  /** Documentos de distribuição DF-e ordenados por NSU. */
  readonly dfe: DistributedDocument[] = [];
  /** Último NSU por CNPJ consultante — default 0. */
  readonly nsuByCnpj = new Map<string, number>();

  /** Parâmetros municipais seedados. */
  readonly aliquotas = new Map<string, ConsultaAliquotasResult>();
  readonly historicoAliquotas = new Map<string, ConsultaAliquotasResult>();
  readonly beneficios = new Map<string, ConsultaBeneficioResult>();
  readonly convenios = new Map<string, ConsultaConvenioResult>();
  readonly regimesEspeciais = new Map<string, ConsultaRegimesEspeciaisResult>();
  readonly retencoes = new Map<string, ConsultaRetencoesResult>();

  /** Próxima falha programada para `emitir()` — consumida na próxima chamada. */
  nextEmitFailure: ProgrammedFailure | undefined;
  /** Próxima falha para `cancelar()`. */
  nextCancelFailure: ProgrammedFailure | undefined;

  /** Contador auto-incrementado para gerar chaves/idDps determinísticos. */
  nextSequential = 1;

  reset(): void {
    this.emitted.clear();
    this.cancelled.clear();
    this.substituted.clear();
    this.eventos.length = 0;
    this.dfe.length = 0;
    this.nsuByCnpj.clear();
    this.aliquotas.clear();
    this.historicoAliquotas.clear();
    this.beneficios.clear();
    this.convenios.clear();
    this.regimesEspeciais.clear();
    this.retencoes.clear();
    this.nextEmitFailure = undefined;
    this.nextCancelFailure = undefined;
    this.nextSequential = 1;
  }
}
