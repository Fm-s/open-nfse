import {
  Ambiente,
  buildDps,
  type DPS,
  type Layout,
  NfseClient,
  OpcaoSimplesNacional,
  providerFromFile,
  ReceitaRejectionError,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
} from 'open-nfse';

const certPath = process.env.NFSE_CERT_PATH;
const password = process.env.NFSE_CERT_SENHA;
const cnpj = process.env.NFSE_CNPJ;
const codMun = process.env.NFSE_COD_MUN;
const quantidade = Number(process.env.NFSE_LOTE_QTD ?? '3');
const concorrencia = Number(process.env.NFSE_LOTE_CONCORRENCIA ?? '2');
const confirmaEmissao = process.env.NFSE_CONFIRMA_EMISSAO === 'yes';
const layoutEnv = process.env.NFSE_LAYOUT ?? 'nt004';

if (!certPath || !password || !cnpj || !codMun) {
  console.error(
    '\n✖ Defina NFSE_CERT_PATH, NFSE_CERT_SENHA, NFSE_CNPJ, NFSE_COD_MUN.',
  );
  console.error('\n  Opcionais:');
  console.error('    NFSE_LOTE_QTD=3          # quantas DPS gerar no lote');
  console.error('    NFSE_LOTE_CONCORRENCIA=2 # requisições em paralelo');
  console.error('    NFSE_CONFIRMA_EMISSAO=yes # realmente envia (default: só monta o lote)');
  console.error('    NFSE_LAYOUT=nt004         # nt004 (default) ou nt009');
  console.error('');
  process.exit(1);
}
if (layoutEnv !== 'nt004' && layoutEnv !== 'nt009') {
  console.error(`\n✖ NFSE_LAYOUT inválido: ${layoutEnv} (use nt004 ou nt009)`);
  process.exit(1);
}
// Numa aplicação o layout costuma ser um literal na config; aqui vem do
// ambiente para testar os dois leiautes em Produção Restrita. Todas as DPS do
// lote precisam ser do layout do cliente (senão LayoutMismatchError antes do
// primeiro envio).
const layout: Layout = layoutEnv;

function montarDps(indice: number): DPS {
  const base = Math.floor(Date.now() / 1000) * 10;
  const nDPS = String(base + indice);
  return buildDps({
    layout,
    emitente: {
      cnpj: cnpj!,
      codMunicipio: codMun!,
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS,
    // verAplic omitido: default `open-nfse/<versão>` (TSVerAplic aceita até 20 chars).
    servico: {
      cTribNac: '010101',
      cNBS: '115021000',
      descricao: `Serviço em lote #${indice + 1}`,
    },
    // ME/EPP exige o membro pTotTribSN do choice totTrib (% aprox. do Simples).
    valores: { vServ: 1.0 + indice, pTotTribSN: 6.0 },
  });
}

async function main() {
  const provider = providerFromFile(certPath!, password!);
  const cliente = new NfseClient({
    layout,
    ambiente: Ambiente.ProducaoRestrita,
    certificado: provider,
  });

  try {
    const lote = Array.from({ length: quantidade }, (_, i) => montarDps(i));
    console.log(
      `\n▸ Lote com ${lote.length} DPS ${layout} preparado (concorrência=${concorrencia}).`,
    );

    if (!confirmaEmissao) {
      console.log('  NFSE_CONFIRMA_EMISSAO!=yes — apenas pré-visualizando com dry-run...');
      for (const dps of lote) {
        const dry = await cliente.emitirDpsPronta(dps, { dryRun: true });
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
      switch (item.status) {
        case 'success':
          console.log(`  [${i}] ok     nDPS=${nDPS}  chave=${item.result.chaveAcesso}`);
          break;
        case 'success_unreadable':
          // Autorizada — só a resposta não pôde ser lida. Não reemita.
          console.log(
            `  [${i}] ok*    nDPS=${nDPS}  chave=${item.error.chaveAcesso}  (autorizada; resposta ilegível — NÃO reemita)`,
          );
          break;
        case 'failure': {
          const err = item.error;
          const reason =
            err instanceof ReceitaRejectionError
              ? `[${err.codigo}] ${err.descricao}`
              : (err.message ?? String(err));
          console.log(`  [${i}] falha  nDPS=${nDPS}  ${reason}`);
          break;
        }
        case 'skipped':
          console.log(`  [${i}] skip   nDPS=${nDPS}`);
          break;
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
