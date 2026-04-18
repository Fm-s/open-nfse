import type { TipoAmbiente } from '../ambiente.js';
import type { DPS, Emitente, NFSe, Signature, ValoresNFSe } from '../nfse/domain.js';
import { AmbienteGerador, TipoEmissao } from '../nfse/enums.js';

/** Chave de acesso sintética de 50 dígitos. Deterministicamente única por sequential. */
export function synthChaveAcesso(sequential: number, cnpj: string): string {
  // Formato fake: UF(2) + AAAAMM(6) + CNPJ(14) + zeros(18) + seq(10)
  const now = new Date();
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
export function synthNfse(dps: DPS, chaveAcesso: string, ambiente: TipoAmbiente): NFSe {
  const descServ = dps.infDPS.serv.cServ.xDescServ;
  return {
    versao: '1.01',
    infNFSe: {
      Id: `NFS${chaveAcesso}`,
      chaveAcesso,
      xLocEmi: 'Cidade Fake',
      xLocPrestacao: 'Cidade Fake',
      nNFSe: dps.infDPS.nDPS,
      xTribNac: descServ.slice(0, 300),
      verAplic: 'NfseClientFake/0.6',
      ambGer: AmbienteGerador.SefinNacional,
      tpEmis: TipoEmissao.Normal,
      cStat: '100',
      dhProc: new Date(),
      nDFSe: String(Date.now()),
      emit: synthEmit(dps),
      valores: synthValoresNFSe(dps),
      DPS: dps,
    },
    signature: synthSignature(),
  };
}

function synthEmit(dps: DPS): Emitente {
  return {
    identificador: dps.infDPS.prest.identificador,
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

function synthValoresNFSe(dps: DPS): ValoresNFSe {
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
