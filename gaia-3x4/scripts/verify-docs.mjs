import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPH_REGISTRY } from '../src/registry.mjs';
import { parse } from '../src/parser.mjs';
import { POWER_EXTERNAL_NAME } from '../src/nasa-power.mjs';
import { INATURALIST_EXTERNAL_NAME } from '../src/inaturalist.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const docs = (await readdir(join(root, 'docs'))).filter(name => name.endsWith('.md')).map(name => join(root, 'docs', name));
const markdown = [join(root, 'README.md'), ...docs];
const checkedLinks = [];

for (const file of markdown) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    const destination = resolve(dirname(file), target);
    await access(destination);
    assert.ok((await stat(destination)).isFile() || (await stat(destination)).isDirectory());
    checkedLinks.push(destination);
  }
}

const guide = await readFile(join(root, 'docs', 'learn-gaia.md'), 'utf8');
for (const operation of GLYPH_REGISTRY) {
  assert.match(guide, new RegExp(operation.glyph));
  assert.match(guide, new RegExp(`\\b${operation.alias}\\b`));
}

const proof = await readFile(join(root, 'examples', 'proof-continuous.gaia'), 'utf8');
const program = parse(proof, { externalNames: [POWER_EXTERNAL_NAME, INATURALIST_EXTERNAL_NAME] });
assert.equal(program.statements.length, 7);
assert.deepEqual(program.statements.map(statement => statement.expressions[0].id),
  ['situate', 'situate', 'relate', 'frame', 'remember', 'trace', 'observe']);

console.log(JSON.stringify({ ok: true, markdownFiles: markdown.length, localLinks: checkedLinks.length,
  operatorsDocumented: GLYPH_REGISTRY.length, proofStatements: program.statements.length }, null, 2));
