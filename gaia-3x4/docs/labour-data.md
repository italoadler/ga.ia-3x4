# Entrada situada de trabalho — gaia.labour/1

[labour-demo.json](../data/labour-demo.json) contém **seis registros inteiramente
sintéticos**. Atividades, horários, duração de 900s, valor 1, moeda XXX, status,
regiões A–F e regimes são escolhas inventadas para ensaio. Não são medidas,
testemunhos, médias nem evidência de pessoas, plataformas ou remuneração real.
`XXX` é usado como unidade de demonstração. O aviso de desenvolvimento permanece
no topo de todos os modos enquanto houver um registro synthetic na entrada.

```json
{
  "schema": "gaia.labour/1",
  "title": "Entrada aprovada pelo artista / indicação da evidência",
  "records": [{
    "id": "work-exemplo-01",
    "activity": "classificação sintética",
    "observedAt": "2026-09-14T08:00:00Z",
    "durationSeconds": 900,
    "location": { "label": "Região fictícia A", "scale": "synthetic-region" },
    "compensation": { "value": 1, "currency": "XXX" },
    "paymentRegime": "por tarefa; espera sem pagamento",
    "status": "waiting",
    "provenance": { "source": "demonstração sintética", "reference": "arquivo-local#01" },
    "note": "Exemplo inventado, sem pessoa real.",
    "evidenceStatus": "synthetic"
  }]
}
```

O título é obrigatório, e são aceitos 1–1000 registros. IDs work-* são anônimos,
estáveis e únicos. Todos os campos do registro, exceto note, são obrigatórios.
Status: waiting, active, approved, rejected, expired, unpaid. Evidência:
synthetic, anonymized ou documented. Anonymized indica tratamento de identidade;
não é prova documental. Documented exige origem e referência rastreáveis,
assim como os outros estados; o software não autentica essa evidência.
Localização aceita apenas synthetic-region, region ou country, sem coordenadas.
Valores de duração e compensação devem ser finitos e não negativos, e moeda
usa três letras maiúsculas. Valores não são somados nem extrapolados em estatísticas.

## Carregamento e vínculo executável

`new Interpreter({ labourInput: json })` valida e congela uma cópia defensiva.
O aplicativo lê a entrada local data/labour-demo.json. Para um ensaio privado
autorizado, substitua seu conteúdo por JSON revisado e adapte os IDs da fonte;
não há importação de contas, scraping, API de plataforma ou envio a serviço remoto.
Reinicie antes da apresentação; uma entrada não muda silenciosamente no meio
de um mundo. Não edite o dataset durante a peça.

```gaia
campo = ⊙ "arquivo/revisado" "2026-09-14T08:00:00Z" "relacional" "superficie-trabalho" [1 1] ["work-exemplo-01"]
```

IDs simbólicos nesse domínio resolvem os registros da entrada. Um ID ausente
gera E_LABOUR_RECORD e recusa a transação. Os valores materiais são constantes
1: a cifra não simula produtividade, salário ou importância humana. Proveniência,
regime, evidência e situações permanecem distintas mesmo com valores iguais.
Campo numérico compatível e campo de trabalho podem se relacionar por blend
ou transfer já existentes. Cada fragmento registra ID estável, Earth ID,
sourceFieldId, recordId, peso, relationId, derivationTraceId, posição, projeção,
estado e lossIds. frame retorna identidades, fonte, viewpoint, projeção e trace.

Duplicar IDs na grade deriva mais fragmentos do **mesmo registro**. O runtime
guarda distinctRecordCount e fragmentCount separadamente e
repeatedFragmentsAreNotAdditionalRecords=true. Não há contagem de trabalhadores;
dois registros também não garantem que representam duas pessoas diferentes.
Na demonstração, seis registros sustentam 144 derivações, 24 por registro.

Discard remove o campo de entrada alvo e propaga sua perda a todas as superfícies
que dependem dos recordIds, conservando snapshots e registros de origem.
O ledger de perdas impede ressurgimento por reexecução da relação. A compensação
retida em proveniência é testemunho do registro perdido; não é valor material
restaurado. Os registros podem ser inspecionados no fragmento ou no JSON integral.

## Checklist de privacidade antes de substituir a demonstração em público

- Confirmar autorização explícita do artista e consentimento/condições de uso da fonte.
- Definir finalidade, público, retenção e procedimento de retirada antes de importar.
- Remover nomes legais, e-mails, contas de plataforma, IDs de tarefa reais e links que revelem identidades.
- Remover conteúdos de tarefas sujeitos a sigilo, instruções contratuais e notas identificantes.
- Generalizar localização e horário; avaliar combinações raras de atividade, pagamento e tempo que possam reidentificar alguém.
- Verificar referência de origem sem expor caminhos pessoais, credenciais ou dados restritos.
- Revisar valores/moedas/regimes e o status de evidência com a pessoa responsável pela fonte.
- Explicar visualmente a evidência utilizada e a derivação repetida; jamais remover o aviso de dados sintéticos para aparentar documentação.
- Revisar JSON exportado, rastros, snapshots e capturas: o histórico conserva dados anteriores, mesmo depois de ⊘.
- Testar o conjunto aprovado no equipamento final e excluir ensaios contendo informação não autorizada antes da apresentação.

A validação recusa campos desconhecidos e localização precisa no schema.
Ela não reconhece todo dado pessoal dentro de texto livre e não substitui esta
revisão humana. Não coloque nomes ou segredos em activity, note, source ou reference.
Esta milestone não carregou qualquer registro real.
