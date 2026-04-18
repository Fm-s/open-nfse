import type { NfseClient } from '../client.js';
import type { NfseClientFake } from './nfse-client-fake.js';

export { NfseClientFake } from './nfse-client-fake.js';
export { FakeSeed } from './seed.js';
export type { ProgrammedFailure } from './fake-state.js';
export { synthChaveAcesso, synthNfse } from './synth.js';

/**
 * Union type — útil para tipar dependências que podem receber tanto o cliente
 * real quanto o fake:
 *
 * ```ts
 * function emitePedido(cliente: NfseClientLike, pedido: Pedido) { ... }
 *
 * // em prod:
 * emitePedido(new NfseClient({...}), pedido);
 * // em test:
 * emitePedido(new NfseClientFake(), pedido);
 * ```
 */
export type NfseClientLike = NfseClient | NfseClientFake;
