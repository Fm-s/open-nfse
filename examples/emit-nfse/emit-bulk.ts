import {
  Ambiente,
  buildDps,
  type DPS,
  NfseClient,
  OpcaoSimplesNacional,
  providerFromFile,
  ReceitaRejectionError,
  RegimeEspecialTributacao,
} from 'open-nfse';

const certPath = process.env.NFSE_CERT_PATH;
const password = process.env.NFSE_CERT_SENHA;
const cnpj = process.env.NFSE_CNPJ;
const codMun = process.env.NFSE_COD_MUN;
const quantidade = Number(process.env.NFSE_LOTE_QTD ?? '3');
const concorrencia = Number(process.env.NFSE_LOTE_CONCORRENCIA ?? '2');
const confirmaEmissao = process.env.NFSE_CONFIRMA_EMISSAO === 'yes';

if (!certPath || !password || !cnpj || !codMun) {
  console.error(
    '\n✖ Defina NFSE_CERT_PATH, NFSE_CERT_SENHA, NFSE_CNPJ, NFSE_COD_MUN.',
  );
  console.error('\n  Opcionais:');
  console.error('    NFSE_LOTE_QTD=3          # quantas DPS gerar no lote');
  console.error('    NFSE_LOTE_CONCORRENCIA=2 # requisições em paralelo');
  console.error('    NFSE_CONFIRMA_EMISSAO=yes # realmente envia (default: só monta o lote)');
  console.error('');
  process.exit(1);
}

function montarDps(indice: number): DPS {
  const base = Math.floor(Date.now() / 1000) * 10;
  const nDPS = String(base + indice);
  return buildDps({
    emitente: {
      cnpj: cnpj!,
      codMunicipio: codMun!,
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS,
    verAplic: 'example-emit-bulk-0.0.0',
    servico: {
      cTribNac: '010101',
      cNBS: '123456789',
      descricao: `Serviço em lote #${indice + 1}`,
    },
    valores: { vServ: 1.0 + indice },
  });
}

async function main() {
  const provider = providerFromFile(certPath!, password!);
  const cliente = new NfseClient({
    ambiente: Ambiente.ProducaoRestrita,
    certificado: provider,
  });

  try {
    const lote = Array.from({ length: quantidade }, (_, i) => montarDps(i));
    console.log(`\n▸ Lote com ${lote.length} DPS preparado (concorrência=${concorrencia}).`);

    if (!confirmaEmissao) {
      console.log('  NFSE_CONFIRMA_EMISSAO!=yes — apenas pré-visualizando com dry-run...');
      for (const dps of lote) {
        const dry = await cliente.emitir(dps, { dryRun: true });
        console.log(
          `   • ${dps.infDPS.Id}  xml=${dry.xmlDpsAssinado.length}B  gzip=${dry.xmlDpsGZipB64.length}B`,
        );
      }
      return;
    }

    console.log(`\n▸ Enviando lote para ${Ambiente.ProducaoRestrita}...`);
    const inicio = Date.now();
    const r = await cliente.emitirEmLote(lote, { concurrency: concorrencia });
    const elapsedMs = Date.now() - inicio;

    console.log(
      `\n▸ Lote concluído em ${elapsedMs}ms — ${r.successCount} ok, ${r.failureCount} falhas, ${r.skippedCount} puladas.`,
    );
    r.items.forEach((item, i) => {
      const nDPS = item.dps.infDPS.nDPS;
      if (item.status === 'success') {
        console.log(`  [${i}] ok     nDPS=${nDPS}  chave=${item.result.chaveAcesso}`);
      } else if (item.status === 'failure') {
        const err = item.error;
        const reason =
          err instanceof ReceitaRejectionError
            ? `[${err.codigo}] ${err.descricao}`
            : (err.message ?? String(err));
        console.log(`  [${i}] falha  nDPS=${nDPS}  ${reason}`);
      } else {
        console.log(`  [${i}] skip   nDPS=${nDPS}`);
      }
    });
  } finally {
    await cliente.close();
  }

  console.log('\n✔ Fim.\n');
}

main().catch((err) => {
  console.error('\n✖ Erro:', err);
  process.exit(1);
});
