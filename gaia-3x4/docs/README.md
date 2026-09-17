# Documentação de GA.IA/3x4

GA.IA/3x4 é uma linguagem pequena para compor campos situados, relações, enquadramentos, memória, rastros, perdas e observações. O vocabulário público possui exatamente sete operações. A superfície principal combina o editor CodeMirror 6 com um mundo persistente que avança em tempo lógico.

## Percurso recomendado

1. [Aprender GA.IA/3x4](learn-gaia.md) — tutorial progressivo, do primeiro `RUN` à criação de uma performance.
2. [Gramática e semântica formal](language.md) — tokens, pilha, tipos, transações e regras de compatibilidade.
3. [Continuous World v0](continuous-world.md) — relógio, interpolação, partitura de 82 segundos e recuperação depois de uma perda.
4. [Living Portraits v0](living-portraits.md) — fotografias, licenças, seleção dos organismos e proveniência iNaturalist.
5. [Data-born Earth v0](data-born-earth.md) — captura NASA POWER, valores ausentes e renderer territorial.

## Outros percursos preservados

- [Microperformance 3D](microperformance.md) explica a versão Three.js/WebGPURenderer e seu fallback WebGL 2.
- [Performance de trabalho](labour-performance.md) documenta a partitura baseada em registros sintéticos autorizados.
- [Dados e privacidade do trabalho](labour-data.md) descreve o esquema, os limites e o tratamento de proveniência dessa entrada.

## Referência rápida

| Glifo | Alias | Operação | Entradas → saídas |
| --- | --- | --- | --- |
| `⊙` | `situate`, `source` | Situar | 6 → 1 |
| `⇄` | `relate` | Relacionar | 4 → 1 |
| `⧉` | `frame` | Enquadrar | 4 → 3 |
| `↶` | `remember` | Lembrar | 2 → 1 |
| `⋮` | `trace` | Ler rastros | 1 → 1 |
| `⊘` | `discard` | Descartar | 2 → 1 |
| `◉` | `observe` | Observar | 1 → 0 |

O registro executável em [`src/registry.mjs`](../src/registry.mjs) é a fonte única para glifo, aliases, aridade, assinatura, atalho, hover, autocomplete, explicação e implementação.

## Comandos de validação

```powershell
npm test
npm run verify:docs
npm run verify:continuous
```

As demais verificações preservadas estão listadas no [README principal](../README.md#evidência).
