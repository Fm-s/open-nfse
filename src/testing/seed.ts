import type { DistributedDocument } from '../dfe/types.js';
import type { NfseEmitResult } from '../nfse/emit.js';
import type {
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
} from '../parametros-municipais/types.js';
import type { FakeState } from './fake-state.js';

/**
 * API fluente para pré-popular o estado do `NfseClientFake`. Use em testes
 * para montar cenários antes de exercitar o código em teste.
 *
 * ```ts
 * const fake = new NfseClientFake();
 * fake.seed.nfse('21113...', mockNfseResult);
 * fake.seed.aliquota('2111300', '250101', '2026-03-01', [{ ... }]);
 *
 * // código em teste consome `fake` e verifica via assertions
 * ```
 */
export class FakeSeed {
  constructor(private readonly state: FakeState) {}

  /** Preenche uma NFS-e para ser retornada em `fetchByChave(chave)`. */
  nfse(chave: string, result: NfseEmitResult): void {
    this.state.emitted.set(chave, result);
  }

  /** Adiciona documentos à fila de distribuição DF-e. Ordenados por NSU. */
  dfe(documentos: readonly DistributedDocument[]): void {
    this.state.dfe.push(...documentos);
    this.state.dfe.sort((a, b) => a.nsu - b.nsu);
  }

  /** Alíquota para município + serviço + competência específica. */
  aliquota(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    result: ConsultaAliquotasResult,
  ): void {
    const key = `${codigoMunicipio}:${codigoServico}:${String(competencia)}`;
    this.state.aliquotas.set(key, result);
  }

  /** Histórico de alíquotas (independente de competência). */
  historicoAliquotas(
    codigoMunicipio: string,
    codigoServico: string,
    result: ConsultaAliquotasResult,
  ): void {
    const key = `${codigoMunicipio}:${codigoServico}`;
    this.state.historicoAliquotas.set(key, result);
  }

  /** Benefício municipal. */
  beneficio(
    codigoMunicipio: string,
    numeroBeneficio: string,
    competencia: Date | string,
    result: ConsultaBeneficioResult,
  ): void {
    const key = `${codigoMunicipio}:${numeroBeneficio}:${String(competencia)}`;
    this.state.beneficios.set(key, result);
  }

  /** Convênio do município. */
  convenio(codigoMunicipio: string, result: ConsultaConvenioResult): void {
    this.state.convenios.set(codigoMunicipio, result);
  }

  /** Regimes especiais para município + serviço + competência. */
  regimesEspeciais(
    codigoMunicipio: string,
    codigoServico: string,
    competencia: Date | string,
    result: ConsultaRegimesEspeciaisResult,
  ): void {
    const key = `${codigoMunicipio}:${codigoServico}:${String(competencia)}`;
    this.state.regimesEspeciais.set(key, result);
  }

  /** Retenções do município para competência. */
  retencoes(
    codigoMunicipio: string,
    competencia: Date | string,
    result: ConsultaRetencoesResult,
  ): void {
    const key = `${codigoMunicipio}:${String(competencia)}`;
    this.state.retencoes.set(key, result);
  }
}
