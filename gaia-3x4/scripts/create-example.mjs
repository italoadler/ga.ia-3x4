import { mkdir, writeFile } from 'node:fs/promises';
const data = Array.from({ length: 144 }, (_, i) => {
  const x = i % 12, y = Math.floor(i / 12);
  return Math.round(Math.max(0, Math.min(9, 4.5 + 2.4 * Math.sin(x * .65 + y * .31) + 1.8 * Math.cos(y * .72 - x * .27) + .9 * Math.sin(x * y * .18))));
});
const rows = Array.from({ length: 6 }, (_, i) => `  ${data.slice(i * 24, (i + 1) * 24).join(' ')}`).join('\n');
const source = `# dados sintéticos / duas origens, mesmos valores\ndados = [\n${rows}\n]\na = ⊙ "registro/A" "t0" "célula" "grade" [12 12] dados\nb = ⊙ "registro/B" "t0" "célula" "grade" [12 12] dados\nvinculo = ⇄ blend [0.35 2] b a\nretrato fora corte = ⧉ 3:4 0.5 0.5 vinculo\nantes = ↶ 1 retrato\nanterior = ⋮ frame\namostra = ⊙ "arquivo/C" "t0" "célula" "grade" [1 1] [9]\nperda = ⊘ "retirada explícita da amostra" amostra\n◉ [retrato fora corte antes anterior perda a b vinculo]\n`;
await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
await writeFile(new URL('../examples/canonical.gaia', import.meta.url), source);
