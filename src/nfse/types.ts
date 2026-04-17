import type { TipoAmbiente } from '../ambiente.js';
import type { NFSe } from './domain.js';

export interface NfseQueryResult {
  readonly chaveAcesso: string;
  readonly xmlNfse: string;
  readonly nfse: NFSe;
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}
