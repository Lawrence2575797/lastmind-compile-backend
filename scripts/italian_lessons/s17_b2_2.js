'use strict';
const { V, R } = require('./helpers');

// B2.2 Conditional sentences (se ...)
module.exports = {
  present_indicative: R(
    ['The present indicative states facts and habits: Studio ogni giorno means “I study every day”.', 'It is the tense of the se-clause in a real condition: Se studi, passi l’esame.'],
    [['“If you study, you pass”', 'Se studi, passi', 'Se studiassi, passi']],
  ),
  future_indicative: R(
    ['The future states what will happen: Studierò domani means “I will study tomorrow”.', 'It can appear in the result of a real condition: Se studi, passerai l’esame.'],
    [['“I will study”', 'Studierò', 'Studierei']],
  ),
  imperfect_subjunctive: R(
    ['The imperfect subjunctive is used in the se-clause of a possible or unlikely condition: Se studiassi, passerei l’esame means “If I studied, I would pass the exam”.', 'Its forms: studiassi, studiassi, studiasse, studiassimo, studiaste, studiassero.'],
    [['“If I studied”', 'Se studiassi', 'Se studierei']],
  ),
  present_conditional: R(
    ['The present conditional says what would happen: passerei means “I would pass”.', 'It is the verb of the result clause in a possible condition: Se studiassi, passerei l’esame.'],
    [['“I would pass”', 'passerei', 'passassi']],
  ),
  trapassato_congiuntivo: R(
    ['The pluperfect subjunctive is the imperfect subjunctive of avere or essere plus the participle: avessi studiato, fossi andato.', 'It is used in the se-clause of an impossible condition (one that did not happen).'],
    [['“If I had studied”', 'Se avessi studiato', 'Se ho studiato']],
  ),
  past_conditional: R(
    ['The past conditional says what would have happened: avrei passato means “I would have passed”.', 'It is the verb of the result clause in an impossible condition.'],
    [['“I would have passed”', 'avrei passato', 'passerei']],
  ),
  se_general_truth: R(
    ['Use se with the indicative for general truths and habits: Se piove, l’erba cresce means “If it rains, the grass grows”.', 'Se non mangio, ho fame means “If I do not eat, I am hungry”.'],
    [['“If it rains, the grass grows”', 'Se piove, l’erba cresce', 'Se pioverebbe, l’erba cresce']],
  ),
  type1_real: R(
    ['A real condition (type 1) is possible and likely: se + present indicative, then the present or future: Se studi, passi l’esame, or Se studi, passerai l’esame.'],
    [['“If you study, you will pass the exam”', 'Se studi, passerai l’esame', 'Se studiassi, passerai l’esame']],
  ),
  type2_possibility: R(
    ['A possible but unlikely condition (type 2) uses se + imperfect subjunctive, then the present conditional: Se studiassi, passerei l’esame means “If I studied, I would pass the exam”.'],
    [['“If I had time, I would travel”', 'Se avessi tempo, viaggerei', 'Se ho tempo, viaggerei']],
  ),
  type3_unreality: R(
    ['An impossible condition in the past (type 3) uses se + pluperfect subjunctive, then the past conditional: Se avessi studiato, avrei passato l’esame means “If I had studied, I would have passed the exam”.'],
    [['“If I had studied, I would have passed”', 'Se avessi studiato, avrei passato', 'Se studiassi, avrei passato']],
  ),
  tense_matching_rule: R(
    ['The two parts must match: type 1 = indicative + indicative, type 2 = imperfect subjunctive + present conditional, type 3 = pluperfect subjunctive + past conditional.', 'Do not put a conditional after se.'],
    [['Which pair is correct for type 2?', 'Se avessi tempo, viaggerei', 'Se avrei tempo, viaggerei']],
  ),
  type2_type3_error: R(
    ['A common mistake is to mix types: Se studiassi, avrei passato l’esame mixes type 2 and type 3 and is wrong in standard Italian.', 'Keep a pair matched: Se studiassi, passerei (type 2) or Se avessi studiato, avrei passato (type 3).'],
    [['Which is correct?', 'Se avessi studiato, avrei passato l’esame', 'Se studiassi, avrei passato l’esame']],
  ),
  mixed_hypothetical: R(
    ['A mixed hypothetical links a condition in the past with a result now: Se avessi studiato medicina, ora sarei medico means “If I had studied medicine, I would be a doctor now”.', 'It combines the pluperfect subjunctive with the present conditional.'],
    [['“If I had studied, I would be a doctor now”', 'Se avessi studiato, ora sarei medico', 'Se studiassi, ora sarei medico']],
  ),
  contrast_general_vs_hypothetical: R(
    ['Compare a general truth with a hypothesis: Se piove, resto a casa (when it rains, I stay at home: a habit) and Se piovesse, resterei a casa (if it rained, I would stay at home: imagining).', 'The first uses the indicative; the second uses the imperfect subjunctive and the conditional.'],
    [['Which one is a habit?', 'Se piove, resto a casa', 'Se piovesse, resterei a casa']],
  ),
};
