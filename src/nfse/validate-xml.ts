import { XsdValidationError, type XsdViolation } from '../errors/validation.js';
import { RTC_V1_01_SCHEMAS } from './_rtc-schemas.generated.js';

const MAIN_SCHEMA_FILE = 'DPS_v1.01.xsd';

export interface ValidateDpsXmlOptions {
  /**
   * Quando `false`, retorna a lista de violações ao invés de lançar.
   * Útil para coletar todos os erros de uma DPS antes de decidir o que fazer.
   * Default: `true` (lança `XsdValidationError` se inválido).
   */
  readonly throwOnInvalid?: boolean;
}

export interface ValidateDpsXmlResult {
  readonly valid: boolean;
  readonly violations: readonly XsdViolation[];
}

/**
 * Valida um XML de DPS contra o schema RTC v1.01 usando libxml2 (via WASM).
 *
 * Por default lança `XsdValidationError` se inválido. Passe `throwOnInvalid: false`
 * para obter `{ valid, violations }` sem lançar.
 *
 * **Nota**: a primeira chamada carrega o runtime WASM do libxml2 (~1 MB). As
 * chamadas seguintes reusam o runtime, então em cargas repetitivas (emissão em
 * lote) a amortização é quase imediata.
 */
export async function validateDpsXml(xml: string): Promise<undefined>;
export async function validateDpsXml(
  xml: string,
  options: { throwOnInvalid: false },
): Promise<ValidateDpsXmlResult>;
export async function validateDpsXml(
  xml: string,
  options: { throwOnInvalid: true },
): Promise<undefined>;
export async function validateDpsXml(
  xml: string,
  options?: ValidateDpsXmlOptions,
): Promise<ValidateDpsXmlResult | undefined> {
  const throwOnInvalid = options?.throwOnInvalid ?? true;
  const result = await runValidation(xml);

  if (result.valid) {
    return throwOnInvalid ? undefined : result;
  }
  if (throwOnInvalid) {
    throw new XsdValidationError(result.violations);
  }
  return result;
}

async function runValidation(xml: string): Promise<ValidateDpsXmlResult> {
  const { validateXML } = await import('xmllint-wasm');

  const main = RTC_V1_01_SCHEMAS.find((s) => s.fileName === MAIN_SCHEMA_FILE);
  if (!main) {
    // Should never happen — the generated file is committed.
    throw new Error(`schema principal ${MAIN_SCHEMA_FILE} ausente nos bundled XSDs.`);
  }
  const preload = RTC_V1_01_SCHEMAS.filter((s) => s.fileName !== MAIN_SCHEMA_FILE).map((s) => ({
    fileName: s.fileName,
    contents: s.contents,
  }));

  const out = await validateXML({
    xml: [{ fileName: 'dps.xml', contents: xml }],
    schema: [{ fileName: main.fileName, contents: main.contents }],
    preload,
  });

  const violations: XsdViolation[] = (out.errors ?? []).map((e) => {
    const line = typeof e.loc?.lineNumber === 'number' ? e.loc.lineNumber : undefined;
    return line !== undefined
      ? { message: e.message ?? e.rawMessage ?? 'violação desconhecida', line }
      : { message: e.message ?? e.rawMessage ?? 'violação desconhecida' };
  });

  return { valid: out.valid, violations };
}
