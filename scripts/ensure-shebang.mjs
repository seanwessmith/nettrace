import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'dist', 'index.js');

try {
  const buf = await readFile(outFile);
  const text = buf.toString('utf8');
  const shebang = '#!/usr/bin/env node\n';
  const next = text.startsWith('#!') ? text : shebang + text;
  if (next !== text) {
    await writeFile(outFile, next, 'utf8');
  }
  await chmod(outFile, 0o755);
  console.log('Updated shebang and permissions for', outFile);
} catch (err) {
  console.error('ensure-shebang: skipped or failed:', err?.message || err);
}


