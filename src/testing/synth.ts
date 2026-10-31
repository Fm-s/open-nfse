import type { TipoAmbiente } from '../ambiente.js';
import type {
  DPS,
  Emitente,
  IdentificadorEmitente,
  InfoPrestador,
  NFSe,
  Signature,
  ValoresNFSeNt004,
  ValoresNFSeNt009,
} from '../nfse/domain.js';
import { AmbienteGerador, SituacaoNfse, TipoEmissao } from '../nfse/enums.js';

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
 */
// `_ambiente` não é usado (o RTC não tem `tpAmb` em `infNFSe`) — mantido na
// assinatura por compatibilidade: `synthNfse` é público em open-nfse/testing.
export function synthNfse(dps: DPS, chaveAcesso: string, _ambiente: TipoAmbiente): NFSe {
  const descServ = dps.infDPS.serv.cServ.xDescServ;
  const comum = {
    Id: `NFS${chaveAcesso}`,
    chaveAcesso,
    xLocEmi: 'Cidade Fake',
    xLocPrestacao: 'Cidade Fake',
    nNFSe: dps.infDPS.nDPS,
    xTribNac: descServ.slice(0, 300),
    verAplic: 'NfseClientFake/0.6',
    ambGer: AmbienteGerador.SefinNacional,
    tpEmis: TipoEmissao.Normal,
    cStat: SituacaoNfse.Gerada,
    dhProc: new Date(),
    nDFSe: String(Date.now()),
    emit: synthEmit(dps),
    valores: synthValoresNFSe(dps),
  };
  // Mesmo layout da DPS de entrada. `synthValoresNFSe` não preenche o campo
  // que muda de nome (`vCalcDR` nt004 / `vCalcAjusteBCISSQN` nt009), então o
  // grupo `valores` é compatível com os dois.
  return dps.layout === 'nt009'
    ? {
        layout: 'nt009',
        versao: '1.01',
        infNFSe: { ...comum, DPS: dps },
        signature: synthSignature(),
      }
    : {
        layout: 'nt004',
        versao: '1.01',
        infNFSe: { ...comum, DPS: dps },
        signature: synthSignature(),
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

function synthValoresNFSe(dps: DPS): ValoresNFSeNt004 & ValoresNFSeNt009 {
  const vServ = dps.infDPS.valores.vServPrest.vServ;
  const trib = dps.infDPS.valores.trib;
  const pAliq = trib.tribMun.pAliq ?? 0;
  const vISSQN = Number(((vServ * pAliq) / 100).toFixed(2));
  const vLiq = Number((vServ - vISSQN).toFixed(2));
  return {
    vLiq,
    ...(vISSQN > 0 ? { vISSQN } : {}),
    ...(pAliq > 0 ? { pAliqAplic: pAliq } : {}),
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
