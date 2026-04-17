import type {
  DPS,
  DocDedRed,
  Endereco,
  EnderecoSimples,
  IdentificadorPessoa,
  InfoPessoa,
  RtcInfoIbsCbs,
  Serv,
} from './domain.js';

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
  if (inf.IBSCBS) pushRtcIbsCbs(out, 'infDPS.IBSCBS', inf.IBSCBS);
  if (inf.valores.vDedRed && 'documentos' in inf.valores.vDedRed) {
    inf.valores.vDedRed.documentos.docDedRed.forEach((doc, i) => {
      pushDocDedRed(out, `infDPS.valores.vDedRed.documentos.docDedRed[${i}]`, doc);
    });
  }

  return out;
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

  return out;
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
  if (endereco.CEP) out.push({ path: `${path}.CEP`, cep: endereco.CEP });
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

function pushRtcIbsCbs(out: CollectedCep[], path: string, rtc: RtcInfoIbsCbs): void {
  if (rtc.dest?.end) pushEndereco(out, `${path}.dest.end`, rtc.dest.end);
  if (rtc.imovel) {
    const ident = rtc.imovel.identificacao;
    if ('end' in ident) pushEnderecoSimples(out, `${path}.imovel.end`, ident.end);
  }
}

function pushDocDedRed(out: CollectedCep[], path: string, doc: DocDedRed): void {
  if (doc.fornec) pushInfoPessoa(out, `${path}.fornec`, doc.fornec);
}

function pushInfoPessoa(out: CollectedCep[], path: string, pessoa: InfoPessoa): void {
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
