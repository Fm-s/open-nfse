import {
  Ambiente,
  buildDps,
  type DPS,
  type Logger,
  NfseClient,
  OpcaoSimplesNacional,
  providerFromFile,
  ReceitaRejectionError,
  RegimeEspecialTributacao,
} from 'open-nfse';

process.on('uncaughtException', (err) => {
  console.error('\n✖ uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('\n✖ unhandledRejection:', reason);
  process.exit(1);
});

const certPath = process.env.NFSE_CERT_PATH;
const password = process.env.NFSE_CERT_SENHA;
const cnpj = process.env.NFSE_CNPJ;
const codMun = process.env.NFSE_COD_MUN;

if (!certPath || !password || !cnpj || !codMun) {
  console.error('\n✖ Defina antes de rodar:');
  console.error('    export NFSE_CERT_PATH=/caminho/para/cert.pfx');
  console.error('    export NFSE_CERT_SENHA=sua-senha');
  console.error('    export NFSE_CNPJ=14-digitos-sem-mascara');
  console.error('    export NFSE_COD_MUN=7-digitos-ibge   # ex. 2111300 = São Luís/MA');
  console.error('\n  Opcionais:');
  console.error('    export NFSE_SERIE=1                   # default: 1');
  console.error('    export NFSE_N_DPS=1                   # default: timestamp UNIX');
  console.error('    export NFSE_VALOR=100.00              # default: 1.00');
  console.error('    export NFSE_CONFIRMA_EMISSAO=yes      # default: dry-run (sem envio)');
  console.error('');
  process.exit(1);
}

const logger: Logger = {
  debug: (msg, ctx) => console.log(`  [${msg}]`, ctx ?? ''),
  info: () => {},
  warn: (msg, ctx) => console.warn(`  [WARN ${msg}]`, ctx ?? ''),
  error: (msg, ctx) => console.error(`  [ERROR ${msg}]`, ctx ?? ''),
};

const serie = process.env.NFSE_SERIE ?? '1';
const nDPS = process.env.NFSE_N_DPS ?? String(Math.floor(Date.now() / 1000));
const valorServico = Number(process.env.NFSE_VALOR ?? '1.00');
const confirmaEmissao = process.env.NFSE_CONFIRMA_EMISSAO === 'yes';

function montarDps(): DPS {
  return buildDps({
    emitente: {
      cnpj: cnpj!,
      codMunicipio: codMun!,
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp, // ajuste para seu regime real
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie,
    nDPS,
    verAplic: 'example-emit-nfse-0.0.0',
    servico: {
      cTribNac: '010101',        // ajuste para o código real do serviço
      cNBS: '123456789',          // required — consulte o Anexo B da RTC
      descricao: 'Serviço de teste emitido pelo exemplo open-nfse',
    },
    valores: { vServ: valorServico },
  });
}

async function main() {
  console.log('\n▸ Carregando certificado A1...');
  const provider = providerFromFile(certPath!, password!);
  const cert = await provider.load();
  console.log(`  subject:   ${cert.subject}`);
  console.log(`  expira em: ${cert.expiresOn.toISOString().slice(0, 10)}`);

  const cliente = new NfseClient({
    ambiente: Ambiente.ProducaoRestrita,
    certificado: provider,
    logger,
  });

  try {
    const dps = montarDps();
    console.log(`\n▸ DPS montada:`);
    console.log(`  Id:     ${dps.infDPS.Id}`);
    console.log(`  série:  ${dps.infDPS.serie}  nDPS: ${dps.infDPS.nDPS}`);
    console.log(`  valor:  R$ ${valorServico.toFixed(2)}`);

    // --------------------------------------------------------------
    // Dry-run: constrói + assina + comprime, sem enviar
    // --------------------------------------------------------------
    console.log(`\n▸ Dry-run: gerando DPS assinada sem enviar...`);
    const dry = await cliente.emitir(dps, { dryRun: true });
    console.log(`  xml assinado (${dry.xmlDpsAssinado.length} bytes):`);
    console.log(`    ${dry.xmlDpsAssinado.slice(0, 140)}...`);
    console.log(`  payload gzip+base64 (${dry.xmlDpsGZipB64.length} bytes): pronto para POST`);

    if (!confirmaEmissao) {
      console.log(
        '\n▸ Modo dry-run. Para emitir de verdade em Produção Restrita, defina:',
      );
      console.log('    export NFSE_CONFIRMA_EMISSAO=yes');
      return;
    }

    // --------------------------------------------------------------
    // Emissão síncrona real
    // --------------------------------------------------------------
    console.log(`\n▸ Enviando DPS para ${Ambiente.ProducaoRestrita}...`);
    try {
      const r = await cliente.emitir(dps);
      console.log(`\n✔ NFS-e autorizada!`);
      console.log(`  chaveAcesso: ${r.chaveAcesso}`);
      console.log(`  idDps:       ${r.idDps}`);
      console.log(`  nNFSe:       ${r.nfse.infNFSe.nNFSe}`);
      console.log(`  cStat:       ${r.nfse.infNFSe.cStat}`);
      console.log(`  vLiq:        R$ ${r.nfse.infNFSe.valores.vLiq.toFixed(2)}`);
      if (r.alertas.length > 0) {
        console.log('\n  Alertas:');
        for (const a of r.alertas) {
          console.log(`    [${a.codigo}] ${a.descricao}`);
        }
      }
    } catch (err) {
      if (err instanceof ReceitaRejectionError) {
        console.error(`\n✖ Rejeição da Receita [${err.codigo}]: ${err.descricao}`);
        if (err.complemento) console.error(`  complemento: ${err.complemento}`);
        for (const m of err.mensagens.slice(1)) {
          console.error(`  + [${m.codigo}] ${m.descricao}`);
        }
        if (err.idDps) console.error(`  idDps: ${err.idDps}`);
        process.exit(2);
      }
      throw err;
    }
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
