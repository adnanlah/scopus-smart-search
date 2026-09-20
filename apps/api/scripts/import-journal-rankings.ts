import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importJournalRankings } from '../src/journal-quality-importer.js';

const readArgument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
};

const main = (): void => {
  const sjrExport = readArgument('--sjr-export');
  const output = readArgument('--output') ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/journal-rankings.json');
  if (!sjrExport) {
    throw new Error('Usage: pnpm --filter @openalex/api import:journal-rankings -- --sjr-export <scimago.xlsx|csv> [--output <path>]');
  }
  const dataset = importJournalRankings(sjrExport, output);
  console.log(`Wrote ${dataset.entries.length.toLocaleString()} journal ranking entries to ${output}.`);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
