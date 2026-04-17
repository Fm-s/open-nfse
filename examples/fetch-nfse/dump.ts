import { readFile, writeFile } from 'node:fs/promises';
import {
  Ambiente,
  HttpStatusError,
  type Logger,
  type NFSe,
  NfseClient,
  parseNfseXml,
  providerFromFile,
  StatusDistribuicao,
  TipoDocumento,
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

if (!certPath || !password) {
  console.error('\n✖ Defina NFSE_CERT_PATH e NFSE_CERT_SENHA antes de rodar:');
  console.error('    export NFSE_CERT_PATH=/caminho/para/cert.pfx');
  console.error('    export NFSE_CERT_SENHA=sua-senha\n');
  process.exit(1);
}

const ambiente =
  process.env.NFSE_AMBIENTE === 'producao' ? Ambiente.Producao : Ambiente.ProducaoRestrita;

const outFile = process.env.NFSE_OUT ?? './nfse-dump.json';
const explicitNsu = process.env.NFSE_ULTIMO_NSU;
const maxBatches = Number(process.env.NFSE_MAX_BATCHES ?? '1000');
const retryWaitMs = Number(process.env.NFSE_RETRY_WAIT_MS ?? '60000');
const maxRetries = Number(process.env.NFSE_MAX_RETRIES ?? '10');

interface DumpEntry {
  readonly nsu: number;
  readonly chaveAcesso: string;
  readonly tipoDocumento: string;
  readonly tipoEvento: string | null;
  readonly dataHoraGeracao: Date;
  readonly xmlDocumento: string;
  readonly nfse: NFSe | null;
  readonly parseError?: string;
}

interface DumpFile {
  readonly generatedAt: string;
  readonly ambiente: Ambiente;
  readonly count: number;
  readonly ultimoNsu: number;
  readonly documents: DumpEntry[];
}

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx ?? ''),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx ?? ''),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`\n▸ Ambiente: ${ambiente}`);
  console.log(`▸ Arquivo de saída: ${outFile}`);

  // Resume from existing file unless NFSE_ULTIMO_NSU overrides it.
  let all: DumpEntry[] = [];
  let ultimoNsu = 0;
  if (explicitNsu !== undefined) {
    ultimoNsu = Number(explicitNsu);
    console.log(`▸ NSU inicial (override): ${ultimoNsu}`);
  } else {
    const resumed = await tryResume();
    if (resumed) {
      all = resumed.documents;
      ultimoNsu = resumed.ultimoNsu;
      console.log(`▸ Retomando dump anterior: ${all.length} docs, último NSU=${ultimoNsu}`);
    } else {
      console.log('▸ Dump novo, começando do NSU 0');
    }
  }

  const provider = providerFromFile(certPath!, password!);
  const cert = await provider.load();
  console.log(`▸ Certificado: ${cert.subject} (expira em ${cert.expiresOn.toISOString().slice(0, 10)})`);

  const cliente = new NfseClient({
    ambiente,
    certificado: provider,
    logger,
  });

  let batch = 0;
  try {
    while (batch < maxBatches) {
      batch++;
      const requestNsu = ultimoNsu;
      const r = await fetchWithRetry(cliente, requestNsu);

      for (const doc of r.documentos) all.push(buildEntry(doc));

      ultimoNsu = r.ultimoNsu;
      await save(all, ultimoNsu);

      console.log(
        `[lote ${batch}] status=${r.status}  +${r.documentos.length} docs  ultimoNsu=${ultimoNsu}  total=${all.length}`,
      );

      if (r.status === StatusDistribuicao.NenhumDocumento) {
        console.log('  → sem mais documentos pendentes.');
        break;
      }
      if (r.ultimoNsu === requestNsu) {
        console.log('  → NSU não avançou, encerrando.');
        break;
      }
    }

    if (batch >= maxBatches) {
      console.warn(
        `\n⚠ Limite de ${maxBatches} lotes atingido. Rode de novo para continuar de NSU=${ultimoNsu}.`,
      );
    }
  } catch (err) {
    console.error('\n✖ Erro durante o dump:', err);
    console.error(`   Arquivo parcial salvo em ${outFile}. Retome rodando novamente.`);
    await save(all, ultimoNsu);
    throw err;
  } finally {
    await cliente.close();
  }

  console.log(
    `\n✔ ${all.length} documentos salvos em ${outFile}. Último NSU processado: ${ultimoNsu}`,
  );
}

async function fetchWithRetry(
  cliente: NfseClient,
  ultimoNsu: number,
): ReturnType<NfseClient['fetchByNsu']> {
  let attempt = 0;
  while (true) {
    try {
      return await cliente.fetchByNsu({ ultimoNsu });
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 429) {
        attempt++;
        if (attempt > maxRetries) {
          console.error(`\n✖ HTTP 429 após ${maxRetries} tentativas — desistindo.`);
          throw err;
        }
        const retryAfter = err.headers['retry-after'];
        const waitMs = parseRetryAfter(retryAfter) ?? retryWaitMs;
        const waitSec = Math.round(waitMs / 1000);
        const source = retryAfter ? `Retry-After=${retryAfter}` : `fallback ${waitSec}s`;
        console.log(
          `  ⏳ HTTP 429 (${source}). Aguardando ${waitSec}s (tentativa ${attempt}/${maxRetries})...`,
        );
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

/** Retry-After can be seconds (integer) or HTTP-date. */
function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds)) return asSeconds * 1000;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

function buildEntry(doc: {
  readonly nsu: number;
  readonly chaveAcesso: string;
  readonly tipoDocumento: string;
  readonly tipoEvento: string | null;
  readonly xmlDocumento: string;
  readonly dataHoraGeracao: Date;
}): DumpEntry {
  const base = {
    nsu: doc.nsu,
    chaveAcesso: doc.chaveAcesso,
    tipoDocumento: doc.tipoDocumento,
    tipoEvento: doc.tipoEvento,
    dataHoraGeracao: doc.dataHoraGeracao,
    xmlDocumento: doc.xmlDocumento,
  };

  if (doc.tipoDocumento !== TipoDocumento.Nfse || !doc.xmlDocumento) {
    return { ...base, nfse: null };
  }

  try {
    return { ...base, nfse: parseNfseXml(doc.xmlDocumento) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, nfse: null, parseError: message };
  }
}

async function save(entries: readonly DumpEntry[], lastNsu: number) {
  const payload: DumpFile = {
    generatedAt: new Date().toISOString(),
    ambiente,
    count: entries.length,
    ultimoNsu: lastNsu,
    documents: [...entries],
  };
  await writeFile(outFile, JSON.stringify(payload, null, 2));
}

async function tryResume(): Promise<DumpFile | null> {
  let content: string;
  try {
    content = await readFile(outFile, 'utf-8');
  } catch {
    return null; // file doesn't exist
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.warn(`⚠ Arquivo ${outFile} existe mas não é JSON válido — ignorando.`);
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('ambiente' in parsed) ||
    !('documents' in parsed) ||
    !('ultimoNsu' in parsed)
  ) {
    console.warn(`⚠ Arquivo ${outFile} tem formato inesperado — ignorando.`);
    return null;
  }

  const prev = parsed as DumpFile;
  if (prev.ambiente !== ambiente) {
    console.warn(
      `⚠ Arquivo ${outFile} é do ambiente ${prev.ambiente}, mas você pediu ${ambiente} — ignorando.`,
    );
    return null;
  }

  return prev;
}

main().catch(() => process.exit(1));
