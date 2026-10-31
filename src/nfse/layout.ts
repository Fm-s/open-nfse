import {
  InvalidLayoutError,
  LayoutMismatchError,
  RuleViolationError,
} from '../errors/validation.js';
import type { DPS } from './domain.js';
import { MotivoEmissaoTomadorIntermediario, TipoEmitenteDps } from './enums.js';
import { LAYOUTS, type Layout } from './layout-ids.js';

export { LAYOUTS, type Layout };

/** Retorna `value` se for um {@link Layout} conhecido; senão lança `InvalidLayoutError`. */
export function assertLayout(value: unknown): Layout {
  if (typeof value === 'string' && (LAYOUTS as readonly string[]).includes(value)) {
    return value as Layout;
  }
  throw new InvalidLayoutError(value);
}

/**
 * Ramo `default` de um `switch (dps.layout)` (ou `switch (layout)`) exaustivo: não compila se algum
 * layout ficar sem `case`, e em runtime (chamador JS com layout desconhecido)
 * lança `InvalidLayoutError` em vez de cair silenciosamente num dos layouts.
 */
export function unknownLayout(value: never): never {
  // Aceita o próprio layout (`switch (layout)`) ou um objeto com `layout` (`switch (dps.layout)`).
  const v: unknown = value;
  throw new InvalidLayoutError(
    typeof v === 'object' && v !== null ? (v as { readonly layout?: unknown }).layout : v,
  );
}

/**
 * Garante que a DPS é do layout `expected` (o do cliente). Lança
 * `InvalidLayoutError` se `dps.layout` não for um layout conhecido e
 * `LayoutMismatchError` se for de outro layout.
 */
export function assertSameLayout(expected: Layout, dps: DPS): void {
  const received = assertLayout((dps as { readonly layout?: unknown }).layout);
  if (received !== expected) {
    throw new LayoutMismatchError(expected, received);
  }
}

/**
 * `EmitirParams` não tem `layout` (vem do cliente), mas um chamador JS pode
 * passá-lo mesmo assim. Se vier definido e divergir do layout do cliente,
 * lança `LayoutMismatchError` (ou `InvalidLayoutError` para valor
 * desconhecido) em vez de sobrescrevê-lo em silêncio.
 */
export function assertParamsLayout(expected: Layout, params: object): void {
  const raw = (params as { readonly layout?: unknown }).layout;
  if (raw === undefined) return;
  const received = assertLayout(raw);
  if (received !== expected) {
    throw new LayoutMismatchError(expected, received);
  }
}

/**
 * Campo exclusivo de um layout, localizado no XML da NFS-e e (quando faz parte
 * do DPS) no DTO `DPS`. Fonte única do guard do serializer
 * ({@link assertNoForeignLayoutFields}) e dos `warn` do parser
 * (`nfse.parse.unexpected_field`), para que os dois não divirjam.
 */
export interface ForeignLayoutField {
  /** Caminho de elementos a partir de `infNFSe` (o DPS embutido fica em `DPS/infDPS`). */
  readonly xmlPath: readonly string[];
  /**
   * Caminho no DTO `DPS` (a partir da raiz). Ausente nos campos que só existem
   * na NFS-e (fora do DPS). Difere do `xmlPath` só onde o DTO agrupa um
   * `xs:choice` (`cCIB`/`end` → `identificacao`).
   */
  readonly dpsPath?: readonly string[];
}

/** Campo do DPS (`infDPS/...`); `dpsPath` default = mesmo caminho do XML. */
function inDps(
  xmlPath: readonly string[],
  dpsPath: readonly string[] = xmlPath,
): ForeignLayoutField {
  return { xmlPath: ['DPS', 'infDPS', ...xmlPath], dpsPath: ['infDPS', ...dpsPath] };
}

/** Campo só da NFS-e (`infNFSe/...`), sem contraparte no DTO `DPS`. */
function inNfse(xmlPath: readonly string[]): ForeignLayoutField {
  return { xmlPath };
}

/**
 * Elementos que existem num layout e não no outro, dentro de grupos comuns aos
 * dois — diff estrutural de `schemas/1.01/tiposComplexos_v1.01.xsd` (nt004) ×
 * `schemas/1.01-nt009/tiposComplexos_v1.01.xsd` (nt009). Grupos exclusivos
 * inteiros (`vDedRed`, `vAjusteBC`…) entram pela raiz; os grupos
 * reestruturados (`TCRTCInfoImovel`; `TCRTCInfoTributosIBSCBS` ×
 * `TCRTCInfoTribIBSCBS`) entram filho a filho. A chave é o layout do documento
 * em que o campo é **estranho**.
 */
export const FOREIGN_LAYOUT_FIELDS: Readonly<Record<Layout, readonly ForeignLayoutField[]>> = {
  // Presentes só no nt004 — estranhos num documento nt009.
  nt009: [
    inDps(['valores', 'vDedRed']), // TCInfoValores
    inDps(['IBSCBS', 'finNFSe']), // TCRTCInfoIBSCBS (no nt009 subiu para infDPS)
    inDps(['IBSCBS', 'imovel', 'inscImobFisc']), // TCRTCInfoImovel (no nt009 fica em gUnidImob)
    inDps(['IBSCBS', 'imovel', 'cCIB'], ['IBSCBS', 'imovel', 'identificacao']),
    inDps(['IBSCBS', 'imovel', 'end'], ['IBSCBS', 'imovel', 'identificacao']),
    inDps(['IBSCBS', 'valores', 'gReeRepRes']), // TCRTCInfoValoresIBSCBS
    inDps(['IBSCBS', 'valores', 'trib', 'gIBSCBS', 'CST']), // TCRTCInfoTributosSitClas
    inDps(['IBSCBS', 'valores', 'trib', 'gIBSCBS', 'cClassTrib']),
    inNfse(['valores', 'vCalcDR']), // TCValoresNFSe
    inNfse(['IBSCBS', 'valores', 'vCalcReeRepRes']), // TCRTCValoresIBSCBS
  ],
  // Presentes só no nt009 — estranhos num documento nt004.
  nt004: [
    inDps(['finNFSe']), // TCInfDPS
    inDps(['valores', 'vAjusteBC']), // TCInfoValores
    inDps(['IBSCBS', 'bensMoveis']), // TCRTCInfoIBSCBS
    inDps(['IBSCBS', 'imovel', 'cMun']), // TCRTCInfoImovel
    inDps(['IBSCBS', 'imovel', 'gLocacao']),
    inDps(['IBSCBS', 'imovel', 'gUnidImob']),
    inDps(['IBSCBS', 'valores', 'trib', 'CST']), // TCRTCInfoTribIBSCBS
    inDps(['IBSCBS', 'valores', 'trib', 'cClassTrib']),
    inNfse(['valores', 'vCalcAjusteBCISSQN']), // TCValoresNFSe
    inNfse(['IBSCBS', 'valores', 'vCalcAjusteBCLocImoveis']), // TCRTCValoresIBSCBS
    inNfse(['IBSCBS', 'valores', 'vCalcAjusteBCIBSCBS']),
  ],
};

/**
 * Rejeita uma DPS fora do contrato do seu layout. O tipo TS já impede isso,
 * mas chamadores JS (ou casts) podem montar um DTO que o serializer
 * descartaria em silêncio — ou que o Sistema Nacional sempre rejeitaria:
 *
 * - campo exclusivo do outro layout ({@link FOREIGN_LAYOUT_FIELDS}) →
 *   `LayoutMismatchError` com `expected = received = dps.layout` e `field` =
 *   caminho do campo (`null` conta como ausente);
 * - campo que o XSD do layout ainda aceita, mas que o Anexo I desse layout
 *   rejeita sempre → `RuleViolationError` (nt009: E0034 `chNFSeRej`, E0031
 *   `cMotivoEmisTI`). Aqui o tipo segue o XSD (o parser mantém esses valores
 *   lidos de uma NFS-e), então só este guard os barra na emissão.
 */
export function assertNoForeignLayoutFields(dps: DPS): void {
  const layout = assertLayout((dps as { readonly layout?: unknown }).layout);
  for (const { dpsPath } of FOREIGN_LAYOUT_FIELDS[layout]) {
    if (dpsPath === undefined) continue;
    let node: unknown = dps;
    for (const key of dpsPath) {
      node =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined;
    }
    if (node !== undefined && node !== null) {
      throw new LayoutMismatchError(layout, layout, dpsPath.join('.'));
    }
  }
  if (layout === 'nt009') assertTomadorIntermediarioNt009(dps.infDPS);
}

/**
 * Regras fechadas (Rej., executadas pela SEFIN) do Anexo I `20261020`
 * (`specs/ruleset/nt009/emissao.regras.json`) sobre campos que o XSD nt009
 * ainda aceita:
 * - **E0034** — "Não é permitido informar nenhuma chave de acesso de NFSe" em
 *   `chNFSeRej` (no nt004 a E0034 só condiciona o campo a tpEmit 2/3 +
 *   cMotivoEmisTI 4);
 * - **E0031** — com tpEmit 2 ou 3, `cMotivoEmisTI` é obrigatório e só aceita
 *   `1` (Importação de Serviço). No nt004 a E0031 é outra regra (retenção).
 */
function assertTomadorIntermediarioNt009(infDPS: object): void {
  const inf = infDPS as {
    readonly tpEmit?: unknown;
    readonly cMotivoEmisTI?: unknown;
    readonly chNFSeRej?: unknown;
  };
  if (inf.chNFSeRej !== undefined && inf.chNFSeRej !== null) {
    throw new RuleViolationError(
      'chNFSeRej não pode ser informado no layout nt009: não é permitido informar nenhuma chave de acesso de NFS-e — per E0034',
      'E0034',
    );
  }
  if (
    (inf.tpEmit === TipoEmitenteDps.Tomador || inf.tpEmit === TipoEmitenteDps.Intermediario) &&
    inf.cMotivoEmisTI !== MotivoEmissaoTomadorIntermediario.ImportacaoServico
  ) {
    throw new RuleViolationError(
      `com tpEmit=${String(inf.tpEmit)} (tomador/intermediário), cMotivoEmisTI deve ser '1' (Importação de Serviço) no layout nt009 (atual: ${String(inf.cMotivoEmisTI)}) — per E0031`,
      'E0031',
    );
  }
}
