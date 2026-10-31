import type { TipoAmbiente } from '../ambiente.js';
import type {
  DPS,
  DpsNt004,
  DpsNt009,
  Emitente,
  IdentificadorEmitente,
  InfoPrestador,
  NFSe,
  Signature,
  ValoresNFSeNt004,
  ValoresNFSeNt009,
} from '../nfse/domain.js';
import {
  AmbienteGerador,
  SituacaoNfse,
  TipoEmissao,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
} from '../nfse/enums.js';
import { unknownLayout } from '../nfse/layout.js';

/**
 * Chave de acesso sintética de 50 posições. Deterministicamente única por sequential.
 *
 * Com `idDps`, segue a regra de formação oficial (`TSIdNFSe` sem "NFS"):
 * Cód.Mun.(7) + Amb.Ger.(1) + Tipo Insc.(1) + Inscrição(14) + nNFSe(13) +
 * AnoMes(4) + Cód.Num.(9) + DV(1), com Cód.Mun./Tipo Insc./Inscrição copiados do
 * Id da DPS — a chave passa na correspondência da E0042 ao ser substituída.
 * O DV é fictício (o algoritmo não está nas fontes oficiais).
 * Sem `idDps` mantém o formato legado (UF + AAAAMM + CNPJ + zeros + seq).
 */
export function synthChaveAcesso(sequential: number, cnpj: string, idDps?: string): string {
  const now = new Date();
  if (idDps !== undefined) {
    const cMun = idDps.slice(3, 10);
    const tpInsc = idDps.slice(10, 11);
    const insc = idDps.slice(11, 25);
    const anoMes = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nNfse = String(sequential).padStart(13, '0');
    const codNum = String(sequential).padStart(9, '0');
    return `${cMun}${AmbienteGerador.SefinNacional}${tpInsc}${insc}${nNfse}${anoMes}${codNum}0`;
  }
  // Formato fake legado: UF(2) + AAAAMM(6) + CNPJ(14) + zeros(18) + seq(10)
  const anoMes = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cnpjPad = cnpj.replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  const seq = String(sequential).padStart(10, '0');
  return `21${anoMes}${cnpjPad}000000000000000000${seq}`.slice(0, 50);
}

/**
 * Constrói um `NFSe` sintético mínimo a partir de uma DPS e uma chaveAcesso.
 * Preserva todos os campos da DPS originais (util pra consumers que inspecionam
 * `nfse.infNFSe.DPS.infDPS.*` em testes).
 *
 * O grupo `infNFSe/valores` segue as fórmulas do Anexo I (ver
 * `synthValoresNt004`/`synthValoresNt009`), usando a alíquota informada na
 * DPS (`tribMun.pAliq`) — o fake não conhece parâmetros municipais. No
 * `nt009`, DPS com `IBSCBS` gera `infNFSe/IBSCBS/totCIBS/vTotNF = vLiq`.
 *
 * Layout ausente/desconhecido (chamador JS) → `InvalidLayoutError`.
 */
// `_ambiente` não é usado (o RTC não tem `tpAmb` em `infNFSe`) — mantido na
// assinatura por compatibilidade: `synthNfse` é público em open-nfse/testing.
export function synthNfse(dps: DPS, chaveAcesso: string, _ambiente: TipoAmbiente): NFSe {
  switch (dps.layout) {
    case 'nt004':
      return {
        layout: 'nt004',
        versao: '1.01',
        infNFSe: {
          ...synthInfNFSeComum(dps, chaveAcesso),
          valores: synthValoresNt004(dps),
          DPS: dps,
        },
        signature: synthSignature(),
      };
    case 'nt009': {
      const valores = synthValoresNt009(dps);
      return {
        layout: 'nt009',
        versao: '1.01',
        infNFSe: {
          ...synthInfNFSeComum(dps, chaveAcesso),
          valores,
          // NFSe/infNFSe/IBSCBS (Anexo I nt009 r47) é gerado pelo sistema; o
          // único filho 1-1 é totCIBS/vTotNF, e "vTotNF = vLiq (em 2026)" (r68).
          // A partir de 2027 o SEFIN soma vCBS + vIBSTot, calculados com
          // alíquotas parametrizadas que o fake não conhece — fica vLiq.
          ...(dps.infDPS.IBSCBS ? { IBSCBS: { totCIBS: { vTotNF: valores.vLiq } } } : {}),
          DPS: dps,
        },
        signature: synthSignature(),
      };
    }
    default:
      return unknownLayout(dps);
  }
}

function synthInfNFSeComum(dps: DPS, chaveAcesso: string) {
  return {
    Id: `NFS${chaveAcesso}`,
    chaveAcesso,
    xLocEmi: 'Cidade Fake',
    xLocPrestacao: 'Cidade Fake',
    nNFSe: dps.infDPS.nDPS,
    xTribNac: dps.infDPS.serv.cServ.xDescServ.slice(0, 300),
    verAplic: 'NfseClientFake/0.6',
    ambGer: AmbienteGerador.SefinNacional,
    tpEmis: TipoEmissao.Normal,
    cStat: SituacaoNfse.Gerada,
    dhProc: new Date(),
    nDFSe: String(Date.now()),
    emit: synthEmit(dps),
  };
}

/**
 * O emitente só admite CNPJ/CPF (`TCEmitente`); o prestador pode ter NIF/cNaoNIF.
 * Reaproveita o identificador nacional do prestador e cai num CNPJ fake caso ele
 * seja estrangeiro.
 */
function synthEmitIdentificador(prest: InfoPrestador): IdentificadorEmitente {
  if ('CNPJ' in prest.identificador) return { CNPJ: prest.identificador.CNPJ };
  if ('CPF' in prest.identificador) return { CPF: prest.identificador.CPF };
  return { CNPJ: '00000000000000' };
}

function synthEmit(dps: DPS): Emitente {
  return {
    identificador: synthEmitIdentificador(dps.infDPS.prest),
    xNome: dps.infDPS.prest.xNome ?? 'Emitente Fake',
    enderNac: {
      xLgr: dps.infDPS.prest.end?.xLgr ?? 'Rua Fake',
      nro: dps.infDPS.prest.end?.nro ?? '1',
      xBairro: dps.infDPS.prest.end?.xBairro ?? 'Bairro Fake',
      cMun: dps.infDPS.cLocEmi,
      UF: 'SP' as Emitente['enderNac']['UF'],
      CEP: '00000000',
    },
    ...(dps.infDPS.prest.IM ? { IM: dps.infDPS.prest.IM } : {}),
    ...(dps.infDPS.prest.email ? { email: dps.infDPS.prest.email } : {}),
  };
}

/** Arredondamento monetário em 2 casas (`TSDec15V2`). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function soma(valores: readonly number[]): number {
  return round2(valores.reduce((acc, v) => acc + v, 0));
}

/**
 * Referências: Anexo I, aba LEIAUTE DPS_NFS-e (linhas `rNN`, iguais nos dois
 * layouts — `specs/ruleset/emissao.campos.json` e `specs/ruleset/nt009/`).
 *
 * Valores comuns aos dois layouts, a partir do total já apurado do ajuste
 * (dedução/redução) da BC do ISSQN (`vAjuste` = informado + calculado):
 *
 * - **vBC** (r41): `vServ − descIncond − ajuste − (vRedBCBM ou vCalcBM)`. O
 *   percentual do BM (`pRedBCBM`) incide sobre `vServ − descIncond − ajuste`
 *   (r41, nota 2). Só há BC/ISSQN em operação tributável (r9 — imunidade,
 *   exportação e não incidência não têm incidência nem destaque de ISSQN).
 * - **vISSQN** (r43): `vBC × pAliqAplic` — o fake usa `pAliq` da DPS.
 * - **vTotalRet** (r44): `Σ(vRetCP + vRetIRRF + vRetCSLL + ISSQN*)`, com o
 *   ISSQN somado só quando retido (`tpRetISSQN ≠ 1`).
 * - **vLiq** (r45): `vServ − descCond − descIncond − retidos`; CP/IRRF/CSLL
 *   sempre subtraídos; ISSQN, PIS e COFINS só quando retidos.
 */
function synthValoresComuns(dps: DPS, vAjuste: number) {
  const { vServPrest, vDescCondIncond, trib } = dps.infDPS.valores;
  const vServ = vServPrest.vServ;
  const vDescIncond = vDescCondIncond?.vDescIncond ?? 0;
  const vDescCond = vDescCondIncond?.vDescCond ?? 0;
  const { tribMun, tribFed } = trib;
  const tributavel = tribMun.tribISSQN === TipoTribISSQN.OperacaoTributavel;
  const pAliq = tribMun.pAliq ?? 0;

  const bm = tribMun.BM;
  const vCalcBM =
    bm && 'pRedBCBM' in bm
      ? round2(((vServ - vDescIncond - vAjuste) * bm.pRedBCBM) / 100)
      : undefined;
  const vRedBM = bm && 'vRedBCBM' in bm ? bm.vRedBCBM : (vCalcBM ?? 0);
  const vBC = tributavel ? round2(vServ - vDescIncond - vAjuste - vRedBM) : undefined;
  const vISSQN = vBC !== undefined && pAliq > 0 ? round2((vBC * pAliq) / 100) : undefined;

  const issRetido = tribMun.tpRetISSQN !== TipoRetISSQN.NaoRetido;
  const vIssRetido = issRetido ? (vISSQN ?? 0) : 0;
  const retFed = soma([tribFed?.vRetCP ?? 0, tribFed?.vRetIRRF ?? 0, tribFed?.vRetCSLL ?? 0]);
  const vTotalRet = soma([retFed, vIssRetido]);
  const pisCofins = tribFed?.piscofins;
  const tpRet = pisCofins?.tpRetPisCofins;
  const vPisRetido = tpRet && PIS_RETIDO.has(tpRet) ? (pisCofins?.vPis ?? 0) : 0;
  const vCofinsRetido = tpRet && COFINS_RETIDO.has(tpRet) ? (pisCofins?.vCofins ?? 0) : 0;
  const vLiq = round2(vServ - vDescCond - vDescIncond - vTotalRet - vPisRetido - vCofinsRetido);

  return {
    ...(vCalcBM !== undefined ? { vCalcBM } : {}),
    ...(vBC !== undefined ? { vBC } : {}),
    ...(vISSQN !== undefined ? { pAliqAplic: pAliq, vISSQN } : {}),
    ...(vTotalRet > 0 ? { vTotalRet } : {}),
    vLiq,
  };
}

// TSTipoRetPISCofins: 1, 3, 4, 5 e 9 retêm PIS; 1, 3, 4, 6 e 7 retêm COFINS.
const PIS_RETIDO: ReadonlySet<TipoRetPisCofins> = new Set([
  TipoRetPisCofins.PisCofinsRetidos,
  TipoRetPisCofins.PisCofinsCsllRetidos,
  TipoRetPisCofins.PisCofinsRetidosCsllNaoRetido,
  TipoRetPisCofins.PisRetidoCofinsCsllNaoRetido,
  TipoRetPisCofins.CofinsNaoRetidoPisCsllRetidos,
]);
const COFINS_RETIDO: ReadonlySet<TipoRetPisCofins> = new Set([
  TipoRetPisCofins.PisCofinsRetidos,
  TipoRetPisCofins.PisCofinsCsllRetidos,
  TipoRetPisCofins.PisCofinsRetidosCsllNaoRetido,
  TipoRetPisCofins.CofinsRetidoPisCsllNaoRetido,
  TipoRetPisCofins.PisNaoRetidoCofinsCsllRetidos,
]);

/**
 * `TCValoresNFSe` nt004. Ajuste da BC (r38/r41): `pDR` → `vCalcDR` sobre
 * `vServ − descIncond`; documentos → `vCalcDR = Σ vDeducaoReducao`; `vDR`
 * informado só abate. A BC também abate `vCalcReeRepRes` (Σ `vlrReeRepRes`
 * de `IBSCBS/valores/gReeRepRes`), que o SEFIN devolve em `IBSCBS/valores`.
 */
function synthValoresNt004(dps: DpsNt004): ValoresNFSeNt004 {
  const { vServPrest, vDescCondIncond, vDedRed } = dps.infDPS.valores;
  const base = vServPrest.vServ - (vDescCondIncond?.vDescIncond ?? 0);
  let vCalcDR: number | undefined;
  let vDR = 0;
  if (vDedRed && 'pDR' in vDedRed) vCalcDR = round2((base * vDedRed.pDR) / 100);
  else if (vDedRed && 'vDR' in vDedRed) vDR = vDedRed.vDR;
  else if (vDedRed) vCalcDR = soma(vDedRed.documentos.docDedRed.map((d) => d.vDeducaoReducao));
  const reeRepRes = dps.infDPS.IBSCBS?.valores.gReeRepRes?.documentos ?? [];
  const vCalcReeRepRes = soma(reeRepRes.map((d) => d.vlrReeRepRes));
  return {
    ...(vCalcDR !== undefined ? { vCalcDR } : {}),
    ...synthValoresComuns(dps, vDR + (vCalcDR ?? 0) + vCalcReeRepRes),
  };
}

/**
 * `TCValoresNFSe` nt009. Ajuste da BC (r38/r41): `pAjusteBCISSQN` incide
 * sobre `vServ − descIncond`; documentos somam `vAjusteAplic`. No nt009 os
 * dois podem coexistir, e ambos compõem `vCalcAjusteBCISSQN`;
 * `vAjusteBCISSQN` informado só abate.
 */
function synthValoresNt009(dps: DpsNt009): ValoresNFSeNt009 {
  const { vServPrest, vDescCondIncond, vAjusteBC } = dps.infDPS.valores;
  const base = vServPrest.vServ - (vDescCondIncond?.vDescIncond ?? 0);
  const ajuste = vAjusteBC?.ajusteIssqn;
  const docs = vAjusteBC?.documentos?.docAjusteBC ?? [];
  const partes = [
    ...(ajuste && 'pAjusteBCISSQN' in ajuste ? [round2((base * ajuste.pAjusteBCISSQN) / 100)] : []),
    ...docs.map((d) => d.vAjusteAplic),
  ];
  const vCalcAjusteBCISSQN = partes.length > 0 ? soma(partes) : undefined;
  const informado = ajuste && 'vAjusteBCISSQN' in ajuste ? ajuste.vAjusteBCISSQN : 0;
  return {
    ...(vCalcAjusteBCISSQN !== undefined ? { vCalcAjusteBCISSQN } : {}),
    ...synthValoresComuns(dps, informado + (vCalcAjusteBCISSQN ?? 0)),
  };
}

function synthSignature(): Signature {
  return {
    signatureValue: 'FAKE_SIG_VALUE',
    digestValue: 'FAKE_DIGEST',
    x509Certificate: 'FAKE_X509',
    referenceUri: '#fake',
  };
}
