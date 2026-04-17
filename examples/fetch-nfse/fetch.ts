import {
  Ambiente,
  type Logger,
  NfseClient,
  providerFromFile,
  StatusDistribuicao,
} from 'open-nfse';

process.on('uncaughtException', (err) => {
  console.error('\n✖ uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('\n✖ unhandledRejection:', reason);
  process.exit(1);
});
process.on('exit', (code) => {
  console.log(`\n[process exit code=${code}]`);
});

const certPath = process.env.NFSE_CERT_PATH;
const password = process.env.NFSE_CERT_SENHA;

if (!certPath || !password) {
  console.error('\n✖ Defina NFSE_CERT_PATH e NFSE_CERT_SENHA antes de rodar:');
  console.error('    export NFSE_CERT_PATH=/caminho/para/cert.pfx');
  console.error('    export NFSE_CERT_SENHA=sua-senha\n');
  process.exit(1);
}

const logger: Logger = {
  debug: (msg, ctx) => console.log(`  [${msg}]`, ctx ?? ''),
  info: () => {},
  warn: (msg, ctx) => console.warn(`  [WARN ${msg}]`, ctx ?? ''),
  error: (msg, ctx) => console.error(`  [ERROR ${msg}]`, ctx ?? ''),
};

async function main() {
  console.log('\n▸ Carregando certificado A1...');
  const provider = providerFromFile(certPath!, password!);
  const cert = await provider.load();
  console.log(`  subject:    ${cert.subject}`);
  console.log(`  emitido em: ${cert.issuedOn.toISOString().slice(0, 10)}`);
  console.log(`  expira em:  ${cert.expiresOn.toISOString().slice(0, 10)}`);

  const cliente = new NfseClient({
    ambiente: Ambiente.ProducaoRestrita,
    certificado: provider,
    logger,
  });

  try {
    // ------------------------------------------------------------------
    // Consulta por chave — opcional, roda se NFSE_CHAVE estiver definido.
    // ------------------------------------------------------------------
    const chave = process.env.NFSE_CHAVE;
    if (chave) {
      console.log(`\n▸ Consultando NFS-e por chave: ${chave}`);
      const resultado = await cliente.fetchByChave(chave);
      const inf = resultado.nfse.infNFSe;
      console.log(`  nNFSe:           ${inf.nNFSe}`);
      console.log(`  emitente:        ${inf.emit.xNome}`);
      console.log(`  município incid: ${inf.xLocIncid ?? inf.cLocIncid}`);
      console.log(`  valor líquido:   R$ ${inf.valores.vLiq.toFixed(2)}`);
      console.log(`  status (cStat):  ${inf.cStat}`);

      const serv = inf.DPS.infDPS.serv;
      console.log(`  serviço (NBS):   ${serv.cServ.cNBS ?? '(não informado)'}`);
      console.log(`  serviço (TribN): ${serv.cServ.cTribNac}`);
      console.log(
        `  descrição:       ${serv.cServ.xDescServ.split('\n')[0]?.slice(0, 80)}`,
      );
    } else {
      console.log(
        '\n▸ Pule a consulta por chave (exporte NFSE_CHAVE=50-digitos para testar).',
      );
    }

    // ------------------------------------------------------------------
    // Consulta por NSU — puxa até 3 lotes (max 150 documentos)
    // ------------------------------------------------------------------
    console.log('\n▸ Consultando distribuição por NSU...');
    let ultimoNsu = Number(process.env.NFSE_ULTIMO_NSU ?? '0');
    let batch = 0;
    let totalDocs = 0;
    const maxBatches = 3;

    while (batch < maxBatches) {
      const r = await cliente.fetchByNsu({ ultimoNsu });
      batch++;
      totalDocs += r.documentos.length;

      console.log(
        `  lote ${batch}: status=${r.status}  docs=${r.documentos.length}  ultimoNsu=${r.ultimoNsu}`,
      );

      for (const doc of r.documentos.slice(0, 5)) {
        const evt = doc.tipoEvento ? `/${doc.tipoEvento}` : '';
        console.log(`    NSU ${doc.nsu}  ${doc.tipoDocumento}${evt}  ${doc.chaveAcesso}`);
      }
      if (r.documentos.length > 5) {
        console.log(`    ... (+${r.documentos.length - 5} omitidos)`);
      }

      if (r.status === StatusDistribuicao.NenhumDocumento || r.ultimoNsu === ultimoNsu) {
        console.log('  sem mais documentos pendentes.');
        break;
      }
      ultimoNsu = r.ultimoNsu;
    }

    console.log(`\n▸ Total: ${totalDocs} documentos em ${batch} lote(s). Último NSU: ${ultimoNsu}`);
  } finally {
    await cliente.close();
  }

  console.log('\n✔ Fim.\n');
}

main().catch((err) => {
  console.error('\n✖ Erro:', err);
  if (err instanceof Error && err.cause) {
    console.error('  cause:', err.cause);
  }
  process.exit(1);
});
