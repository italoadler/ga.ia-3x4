import { GLYPH_REGISTRY } from '../src/registry.mjs';

const isWord = value => /[\p{L}\p{N}_]/u.test(value ?? '');

export function convertOperationView(source, mode) {
  if (!['text', 'glyph'].includes(mode)) throw new Error(`Modo de operação desconhecido: ${mode}`);
  let result = '', quoted = false, escaped = false;
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (escaped) { result += character; escaped = false; index++; continue; }
    if (quoted && character === '\\') { result += character; escaped = true; index++; continue; }
    if (character === '"') { quoted = !quoted; result += character; index++; continue; }
    if (!quoted && character === '#') {
      const end = source.indexOf('\n', index);
      if (end < 0) return result + source.slice(index);
      result += source.slice(index, end + 1); index = end + 1; continue;
    }
    if (!quoted) {
      let found = null;
      for (const operation of GLYPH_REGISTRY) for (const alias of operation.aliases) {
        if (!source.startsWith(alias, index)) continue;
        const textual = alias !== operation.glyph;
        if (textual && (isWord(source[index - 1]) || isWord(source[index + alias.length]))) continue;
        if (!found || alias.length > found.alias.length) found = { operation, alias };
      }
      if (found) {
        result += mode === 'glyph' ? found.operation.glyph : found.operation.id;
        index += found.alias.length; continue;
      }
    }
    result += character; index++;
  }
  return result;
}

export function operationView(source) {
  const glyph = convertOperationView(source, 'glyph') === source;
  const text = convertOperationView(source, 'text') === source;
  return glyph && !text ? 'glyph' : text && !glyph ? 'text' : 'mixed';
}
