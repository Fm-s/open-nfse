import type { NfseClient } from '../client.js';
import type { Layout } from '../nfse/layout.js';
import type { NfseClientFake } from './nfse-client-fake.js';

export type { ProgrammedFailure } from './fake-state.js';
export { NfseClientFake } from './nfse-client-fake.js';
export { FakeSeed } from './seed.js';
export { synthChaveAcesso, synthNfse } from './synth.js';

/**
 * Union type — útil para tipar dependências que podem receber tanto o cliente
 * real quanto o fake. Genérico no layout: `NfseClientLike<'nt009'>` restringe a
 * emissão a DPS nt009; o default (`NfseClientLike`) aceita cliente de qualquer
 * layout (útil para código que só lê).
 *
 * ```ts
 * function emitePedido(cliente: NfseClientLike<'nt004'>, pedido: Pedido) { ... }
 *
 * // em prod:
 * emitePedido(new NfseClient({ layout: 'nt004', ... }), pedido);
 * // em test:
 * emitePedido(new NfseClientFake({ layout: 'nt004' }), pedido);
 * ```
 */
export type NfseClientLike<L extends Layout = Layout> = NfseClient<L> | NfseClientFake<L>;
