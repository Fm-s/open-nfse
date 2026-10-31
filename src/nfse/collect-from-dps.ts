import type {
  DocDedRedNt004,
  DPS,
  Endereco,
  EnderecoSimples,
  IdentificadorPessoa,
  InfDPSNt004,
  InfDPSNt009,
  InfoPessoaNt004,
  RtcInfoIbsCbsNt004,
  RtcInfoIbsCbsNt009,
  Serv,
} from './domain.js';
import { unknownLayout } from './layout.js';

export interface CollectedCep {
  /** Caminho legível dentro da DPS — usado em mensagens de erro. */
  readonly path: string;
  readonly cep: string;
}

export interface CollectedIdentifier {
  readonly path: string;
  readonly type: 'CNPJ' | 'CPF';
  readonly value: string;
}

/**
 * Caminha na árvore de uma DPS e extrai todos os CEPs encontrados em endereços
 * nacionais ou simples. Usado pelo pré-validador antes do envio ao SEFIN.
 */
export function collectCepsFromDps(dps: DPS): readonly CollectedCep[] {
  const out: CollectedCep[] = [];
  const inf = dps.infDPS;

  pushEndereco(out, 'infDPS.prest.end', inf.prest.end);
  pushEndereco(out, 'infDPS.toma.end', inf.toma?.end);
  pushEndereco(out, 'infDPS.interm.end', inf.interm?.end);
  pushServ(out, 'infDPS.serv', inf.serv);

  switch (dps.layout) {
    case 'nt004':
      collectCepsNt004(out, dps.infDPS);
      break;
    case 'nt009':
      collectCepsNt009(out, dps.infDPS);
      break;
    default:
      unknownLayout(dps);
  }

  return out;
}

function collectCepsNt004(out: CollectedCep[], inf: InfDPSNt004): void {
  if (inf.IBSCBS) pushRtcIbsCbsNt004(out, 'infDPS.IBSCBS', inf.IBSCBS);
  if (inf.valores.vDedRed && 'documentos' in inf.valores.vDedRed) {
    inf.valores.vDedRed.documentos.docDedRed.forEach((doc, i) => {
      pushDocDedRed(out, `infDPS.valores.vDedRed.documentos.docDedRed[${i}]`, doc);
    });
  }
}

function collectCepsNt009(out: CollectedCep[], inf: InfDPSNt009): void {
  if (inf.IBSCBS) pushRtcIbsCbsNt009(out, 'infDPS.IBSCBS', inf.IBSCBS);
  inf.valores.vAjusteBC?.documentos?.docAjusteBC.forEach((doc, i) => {
    if (doc.fornec?.end) {
      pushEndereco(
        out,
        `infDPS.valores.vAjusteBC.documentos.docAjusteBC[${i}].fornec.end`,
        doc.fornec.end,
      );
    }
  });
}

/**
 * Caminha na árvore da DPS e extrai todos os CNPJ/CPF (os identificadores
 * federais com dígito verificador). NIF e cNaoNIF são omitidos por não terem
 * dígito verificador brasileiro.
 */
export function collectIdentifiersFromDps(dps: DPS): readonly CollectedIdentifier[] {
  const out: CollectedIdentifier[] = [];
  const inf = dps.infDPS;

  pushIdentificador(out, 'infDPS.prest', inf.prest.identificador);
  if (inf.toma) pushIdentificador(out, 'infDPS.toma', inf.toma.identificador);
  if (inf.interm) pushIdentificador(out, 'infDPS.interm', inf.interm.identificador);

  if (inf.IBSCBS?.dest) {
    pushIdentificador(out, 'infDPS.IBSCBS.dest', inf.IBSCBS.dest.identificador);
  }

  switch (dps.layout) {
    case 'nt004':
      collectIdentifiersNt004(out, dps.infDPS);
      break;
    case 'nt009':
      collectIdentifiersNt009(out, dps.infDPS);
      break;
    default:
      unknownLayout(dps);
  }

  return out;
}

function collectIdentifiersNt004(out: CollectedIdentifier[], inf: InfDPSNt004): void {
  if (inf.valores.vDedRed && 'documentos' in inf.valores.vDedRed) {
    inf.valores.vDedRed.documentos.docDedRed.forEach((doc, i) => {
      if (doc.fornec) {
        pushIdentificador(
          out,
          `infDPS.valores.vDedRed.documentos.docDedRed[${i}].fornec`,
          doc.fornec.identificador,
        );
      }
    });
  }

  if (inf.IBSCBS?.valores.gReeRepRes) {
    inf.IBSCBS.valores.gReeRepRes.documentos.forEach((doc, i) => {
      if (doc.fornec) {
        pushIdentificador(
          out,
          `infDPS.IBSCBS.valores.gReeRepRes.documentos[${i}].fornec`,
          doc.fornec.identificador,
        );
      }
    });
  }
}

function collectIdentifiersNt009(out: CollectedIdentifier[], inf: InfDPSNt009): void {
  inf.valores.vAjusteBC?.documentos?.docAjusteBC.forEach((doc, i) => {
    if (doc.fornec) {
      pushIdentificador(
        out,
        `infDPS.valores.vAjusteBC.documentos.docAjusteBC[${i}].fornec`,
        doc.fornec.identificador,
      );
    }
  });
}

function pushEndereco(out: CollectedCep[], path: string, endereco: Endereco | undefined): void {
  if (!endereco) return;
  if ('endNac' in endereco.localidade) {
    out.push({ path: `${path}.localidade.endNac.CEP`, cep: endereco.localidade.endNac.CEP });
  }
}

function pushEnderecoSimples(
  out: CollectedCep[],
  path: string,
  endereco: EnderecoSimples | undefined,
): void {
  if (!endereco) return;
  if ('CEP' in endereco) out.push({ path: `${path}.CEP`, cep: endereco.CEP });
}

function pushServ(out: CollectedCep[], path: string, serv: Serv): void {
  if (serv.obra) {
    const ident = serv.obra.identificacao;
    if ('end' in ident) pushEnderecoSimples(out, `${path}.obra.end`, ident.end);
  }
  if (serv.atvEvento) {
    const ident = serv.atvEvento.identificacao;
    if ('end' in ident) pushEnderecoSimples(out, `${path}.atvEvento.end`, ident.end);
  }
}

function pushRtcIbsCbsNt004(out: CollectedCep[], path: string, rtc: RtcInfoIbsCbsNt004): void {
  if (rtc.dest?.end) pushEndereco(out, `${path}.dest.end`, rtc.dest.end);
  if (rtc.imovel) {
    const ident = rtc.imovel.identificacao;
    if ('end' in ident) pushEnderecoSimples(out, `${path}.imovel.end`, ident.end);
  }
}

function pushRtcIbsCbsNt009(out: CollectedCep[], path: string, rtc: RtcInfoIbsCbsNt009): void {
  if (rtc.dest?.end) pushEndereco(out, `${path}.dest.end`, rtc.dest.end);
  rtc.imovel?.gUnidImob?.forEach((unid, i) => {
    if ('end' in unid.identificacao) {
      out.push({
        path: `${path}.imovel.gUnidImob[${i}].end.CEP`,
        cep: unid.identificacao.end.CEP,
      });
    }
  });
}

function pushDocDedRed(out: CollectedCep[], path: string, doc: DocDedRedNt004): void {
  if (doc.fornec) pushInfoPessoa(out, `${path}.fornec`, doc.fornec);
}

function pushInfoPessoa(out: CollectedCep[], path: string, pessoa: InfoPessoaNt004): void {
  if (pessoa.end) pushEndereco(out, `${path}.end`, pessoa.end);
}

function pushIdentificador(
  out: CollectedIdentifier[],
  path: string,
  ident: IdentificadorPessoa,
): void {
  if ('CNPJ' in ident) out.push({ path: `${path}.CNPJ`, type: 'CNPJ', value: ident.CNPJ });
  else if ('CPF' in ident) out.push({ path: `${path}.CPF`, type: 'CPF', value: ident.CPF });
}
