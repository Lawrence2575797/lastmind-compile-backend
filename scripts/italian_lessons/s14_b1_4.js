'use strict';
const { V, R } = require('./helpers');

// B1.4 The present subjunctive
module.exports = {
  DEPENDENT_CLAUSE_CHE: R(
    ['A che-clause is a part of a sentence that depends on a main clause: Penso che Marco sia a casa means “I think that Marco is at home”.', 'Penso is the main clause, and che Marco sia a casa is the dependent clause.'],
    [['In “Penso che Marco sia a casa”, which part is the dependent clause?', 'che Marco sia a casa', 'Penso']],
  ),
  IND_ENDINGS: R(
    ['The present indicative endings are the baseline. For -are: -o, -i, -a, -iamo, -ate, -ano. For -ere: -o, -i, -e, -iamo, -ete, -ono. For -ire: -o, -i, -e, -iamo, -ite, -ono.', 'The subjunctive changes most of these, except noi.'],
    [['“He speaks” (indicative)', 'parla', 'parli'], ['“We speak”', 'parliamo', 'parlano']],
  ),
  SUBJ_FORM_ARE: R(
    ['The present subjunctive of an -are verb uses the endings -i, -i, -i, -iamo, -iate, -ino: che io parli, che tu parli, che lui parli, che noi parliamo, che voi parliate, che loro parlino.'],
    [['che lui ___ (parlare)', 'parli', 'parla'], ['che loro ___ (parlare)', 'parlino', 'parlano']],
    { say: [['What is “che lui” + the subjunctive of parlare?', 'parli']] },
  ),
  SUBJ_FORM_ERE: R(
    ['The present subjunctive of an -ere verb uses -a, -a, -a, -iamo, -iate, -ano: che io prenda, che tu prenda, che lui prenda, che noi prendiamo, che voi prendiate, che loro prendano.'],
    [['che lui ___ (prendere)', 'prenda', 'prende'], ['che loro ___ (prendere)', 'prendano', 'prendono']],
    { say: [['What is “che lui” + the subjunctive of prendere?', 'prenda']] },
  ),
  SUBJ_FORM_IRE: R(
    ['The present subjunctive of an -ire verb uses -a, -a, -a, -iamo, -iate, -ano: che io dorma, che lui dorma, che noi dormiamo, che loro dormano.', 'Verbs like capire add -isc-: che lui capisca, che loro capiscano.'],
    [['che lui ___ (dormire)', 'dorma', 'dorme'], ['che lui ___ (capire)', 'capisca', 'capisce']],
    { say: [['What is “che lui” + the subjunctive of dormire?', 'dorma']] },
  ),
  SUBJ_SAME_PERSON_ENDING: R(
    ['In the present subjunctive, io, tu and lui/lei all have the same ending: che io parli, che tu parli, che lui parli.', 'This is why the subject pronoun is often kept: Penso che tu parli bene.'],
    [['Which person is che parli?', 'io, tu or lui/lei', 'only tu']],
  ),
  SUBJ_IRREG_ESSERE: V('sia=be (that I / you / he / she be)', ['Essere is irregular in the subjunctive: sia, sia, sia, siamo, siate, siano.', 'Penso che sia vero means “I think it is true”.']),
  SUBJ_IRREG_AVERE: V('abbia=have (that I / you / he / she have)', ['Avere is irregular in the subjunctive: abbia, abbia, abbia, abbiamo, abbiate, abbiano.', 'Credo che abbia ragione means “I think he is right”.']),
  SUBJ_IRREG_ANDARE: V('vada=go (that I / you / he / she go)', ['Andare is irregular in the subjunctive: vada, vada, vada, andiamo, andiate, vadano.']),
  SUBJ_IRREG_FARE: V('faccia=do / make (that I / you / he / she do)', ['Fare is irregular in the subjunctive: faccia, faccia, faccia, facciamo, facciate, facciano.']),
  SUBJ_IRREG_POTERE: V('possa=can (that I / you / he / she can)', ['Potere is irregular in the subjunctive: possa, possa, possa, possiamo, possiate, possano.']),
  SUBJ_IRREG_DOVERE: V('debba=must (that I / you / he / she must)', ['Dovere is irregular in the subjunctive: debba, debba, debba, dobbiamo, dobbiate, debbano.']),
  SUBJ_IRREG_VOLERE: V('voglia=want (that I / you / he / she want)', ['Volere is irregular in the subjunctive: voglia, voglia, voglia, vogliamo, vogliate, vogliano.']),
  SUBJ_IRREG_VENIRE: V('venga=come (that I / you / he / she come)', ['Venire is irregular in the subjunctive: venga, venga, venga, veniamo, veniate, vengano.']),
  SUBJ_IRREG_DIRE: V('dica=say (that I / you / he / she say)', ['Dire is irregular in the subjunctive: dica, dica, dica, diciamo, diciate, dicano.']),
  DIFFERENT_SUBJECT_CONDITION: R(
    ['The subjunctive is used when the subject of the main clause is different from the subject of the che-clause: Penso che Marco sia a casa (I think, and Marco is at home).', 'Two different subjects: io and Marco.'],
    [['In “Spero che tu venga”, are the subjects different?', 'yes (io and tu)', 'no']],
  ),
  TRIGGER_OPINION: R(
    ['Verbs of opinion trigger the subjunctive: Penso che sia vero means “I think it is true”.', 'Credo che, penso che and mi sembra che are the usual openers.'],
    [['“I think he is right”', 'Penso che abbia ragione', 'Penso che ha ragione']],
  ),
  TRIGGER_DOUBT: R(
    ['Doubt triggers the subjunctive: Dubito che venga means “I doubt that he will come”.', 'Non sono sicuro che and non so se (with se) are also doubt expressions.'],
    [['“I doubt that he is here”', 'Dubito che sia qui', 'Dubito che è qui']],
  ),
  TRIGGER_EMOTION: R(
    ['Emotions trigger the subjunctive: Ho paura che piova means “I am afraid that it will rain”, and Sono contento che tu venga means “I am glad that you are coming”.'],
    [['“I am afraid it will rain”', 'Ho paura che piova', 'Ho paura che piove']],
  ),
  TRIGGER_DESIRE: R(
    ['Desire and hope trigger the subjunctive: Spero che tu stia bene means “I hope you are well”, and Voglio che tu venga means “I want you to come”.'],
    [['“I hope you are well”', 'Spero che tu stia bene', 'Spero che tu stai bene']],
  ),
  TRIGGER_NECESSITY: R(
    ['Necessity triggers the subjunctive: È importante che tu studi means “It is important that you study”.', 'Bisogna che and è necessario che work the same way.'],
    [['“It is important that you study”', 'È importante che tu studi', 'È importante che tu studia']],
  ),
  CORE_RULE: R(
    ['The core rule: use the subjunctive after che when the main clause expresses an opinion, a doubt, an emotion, a desire or a necessity, and the two subjects are different.', 'Penso che sia vero (opinion). Dubito che venga (doubt). Ho paura che piova (emotion). Spero che tu stia bene (desire). È importante che tu studi (necessity).'],
    [['Which of these needs the subjunctive?', 'Penso che sia vero', 'So che è vero']],
  ),
  CERTAINTY_INDICATIVE: R(
    ['When you are certain, or you state a fact, use the indicative, not the subjunctive: So che è vero means “I know that it is true”, and È vero che viene means “It is true that he is coming”.'],
    [['“I know that he is here”', 'So che è qui', 'So che sia qui']],
  ),
  SAME_SUBJECT_RULE: R(
    ['If the subject of both clauses is the same, you do not use the subjunctive. In Credo di avere ragione, the one who believes and the one who is right are both “I”.', 'The subjunctive needs two different subjects.'],
    [['In “Spero di venire”, is the subjunctive needed?', 'no (same subject)', 'yes']],
  ),
  DI_INFINITIVE_SUB: R(
    ['With the same subject, use di + infinitive instead of che + subjunctive: Credo di avere ragione means “I think I am right”, instead of Credo che io abbia ragione.', 'Spero di venire means “I hope to come”.'],
    [['“I think I am right”', 'Credo di avere ragione', 'Credo che avere ragione']],
  ),
  IMPERSONAL_TRIGGERS: R(
    ['Impersonal expressions also trigger the subjunctive: Bisogna che tu vada means “You need to go”, and È possibile che piova means “It may rain”.'],
    [['“It is possible that it will rain”', 'È possibile che piova', 'È possibile che piove']],
  ),
  IMPERSONAL_TRIGGERS__2: R(
    ['Sembra che also takes the subjunctive: Sembra che sia tardi means “It seems that it is late”.'],
    [['“It seems that he is tired”', 'Sembra che sia stanco', 'Sembra che è stanco']],
  ),
  EXAMPLE_CREDO_DI_AVERE: R(
    ['Credo di avere ragione means “I think I am right”.', 'The same person believes and is right, so there is no che and no subjunctive. Compare Credo che tu abbia ragione, “I think you are right”, with two different subjects.'],
    [['“I think you are right”', 'Credo che tu abbia ragione', 'Credo di tu avere ragione']],
  ),
};
