'use strict';
const { V, R } = require('./helpers');

// B2.1 Subjunctive tenses and the sequence of tenses
module.exports = {
  TIMING_SIMULTANEOUS_VS_PRIOR: R(
    ['In a sentence with a subjunctive clause, ask when the dependent action happens compared with the main verb: at the same time (or later), or before.', 'Penso che Marco dorma (he is sleeping now, at the same time). Penso che Marco abbia dormito (he slept before).'],
    [['“I think he is sleeping now”: the action is...', 'simultaneous', 'prior'], ['“I think he slept”: the action is...', 'prior', 'simultaneous']],
  ),
  PRES_SUB_AVERE_ESSERE: V('abbia=(that) I / you / he / she have; abbiamo=(that) we have', ['The present subjunctive of avere: abbia, abbia, abbia, abbiamo, abbiate, abbiano.']),
  PRES_SUB_AVERE_ESSERE__2: V('abbiate=(that) you (more than one person) have; abbiano=(that) they have'),
  PRES_SUB_AVERE_ESSERE__3: V('sia=(that) I / you / he / she be; siamo=(that) we be', ['The present subjunctive of essere: sia, sia, sia, siamo, siate, siano.']),
  PRES_SUB_AVERE_ESSERE__4: V('siate=(that) you (more than one person) be; siano=(that) they be'),
  PAST_PARTICIPLE: R(
    ['The past participle is the form used after avere or essere in compound tenses: parlato, venduto, dormito (regular) and fatto, visto, scritto (irregular).'],
    [['Past participle of vedere', 'visto', 'vedito'], ['Past participle of parlare', 'parlato', 'parlito']],
  ),
  AUX_CHOICE_AGREEMENT: R(
    ['Compound tenses use avere for most verbs and essere for movement and change. With essere, the participle matches the subject: Penso che sia andata (she went).', 'With avere the participle stays the same: Penso che abbia mangiato.'],
    [['“I think she went”', 'Penso che sia andata', 'Penso che abbia andata']],
  ),
  IMPF_SUB_ERE_IRE: V('prendessi=(if / that) I took; prendesse=(that) he / she took', ['The imperfect subjunctive of -ere and -ire verbs uses -essi, -essi, -esse (for -ire: -issi, -issi, -isse).']),
  IMPF_SUB_ERE_IRE__2: V('prendessimo=(that) we took; prendeste=(that) you (more than one person) took', ['The noi form is -essimo (-issimo for -ire verbs), and the voi form is -este (-iste).']),
  IMPF_SUB_ERE_IRE__3: V('prendessero=(that) they took', ['The loro form is -essero (-issero for -ire verbs): dormissero.']),
  CONG_IMPF_ARE_SG: V('parlassi=(that) I / you spoke', ['The imperfect subjunctive of -are verbs: parlassi, parlassi, parlasse.']),
  CONG_IMPF_ARE_SG__2: V('parlasse=(that) he / she spoke'),
  CONG_IMPF_ARE_PL: V('parlassimo=(that) we spoke; parlaste=(that) you (more than one person) spoke'),
  CONG_IMPF_ARE_PL__2: V('parlassero=(that) they spoke'),
  IMPF_SUB_AVERE_ESSERE: V('avessi=(that) I / you had; avesse=(that) he / she had', ['The imperfect subjunctive of avere: avessi, avessi, avesse, avessimo, aveste, avessero.']),
  IMPF_SUB_AVERE_ESSERE__2: V('avessimo=(that) we had; aveste=(that) you (more than one person) had'),
  IMPF_SUB_AVERE_ESSERE__3: V('avessero=(that) they had'),
  IMPF_SUB_AVERE_ESSERE__4: V('fossi=(that) I / you were; fosse=(that) he / she were', ['The imperfect subjunctive of essere: fossi, fossi, fosse, fossimo, foste, fossero.']),
  IMPF_SUB_AVERE_ESSERE__5: V('fossimo=(that) we were; foste=(that) you (more than one person) were'),
  IMPF_SUB_AVERE_ESSERE__6: V('fossero=(that) they were'),
  CORE_TRIG_1: R(
    ['Opinion and doubt trigger the subjunctive: Penso che sia vero (opinion), Dubito che venga (doubt).', 'Remember that the subjects must be different.'],
    [['Which needs the subjunctive?', 'Penso che sia vero', 'So che è vero']],
  ),
  CORE_TRIG_1__2: R(
    ['Emotions trigger the subjunctive too: Sono contento che tu sia qui means “I am glad that you are here”, and Ho paura che sia tardi means “I am afraid that it is late”.'],
    [['“I am glad that you are here”', 'Sono contento che tu sia qui', 'Sono contento che tu sei qui']],
  ),
  CORE_TRIG_2: R(
    ['Desire and necessity trigger the subjunctive: Voglio che tu venga (desire) and È necessario che tu venga (necessity).'],
    [['“I want you to come”', 'Voglio che tu venga', 'Voglio che tu vieni']],
  ),
  MAIN_CLAUSE_TENSE_PRESENT_VS_PAST: R(
    ['To choose the right subjunctive, look at the main clause first: is it in the present (Penso che...) or in a past or conditional tense (Pensavo che..., Vorrei che...)?', 'A present main clause calls for the present or past subjunctive. A past or conditional main clause calls for the imperfect or pluperfect subjunctive.'],
    [['Which main verb is in the present?', 'Penso che', 'Pensavo che']],
  ),
  CONG_PASSATO: R(
    ['The past subjunctive is the present subjunctive of avere or essere plus the past participle: che abbia mangiato, che sia andato.', 'Use it after a present main clause when the action happened earlier: Penso che Marco abbia mangiato means “I think Marco has eaten”.'],
    [['“I think she has gone” (essere)', 'Penso che sia andata', 'Penso che è andata']],
  ),
  CONG_IMPERFETTO: R(
    ['The imperfect subjunctive is used when the main clause is in the past or conditional and the other action is simultaneous: Pensavo che Marco dormisse means “I thought that Marco was sleeping”.', 'Vorrei che tu venissi means “I would like you to come”.'],
    [['“I thought he was sleeping”', 'Pensavo che dormisse', 'Pensavo che dorma']],
  ),
  CONG_TRAPASSATO: R(
    ['The pluperfect subjunctive is the imperfect subjunctive of avere or essere plus the past participle: avesse mangiato, fosse andato.', 'Use it for an action before a past main verb: Pensavo che Marco avesse mangiato means “I thought that Marco had eaten”.'],
    [['“I thought he had eaten”', 'Pensavo che avesse mangiato', 'Pensavo che abbia mangiato']],
  ),
  CONCORDANZA_TEMPI: R(
    ['The sequence of tenses: main clause in the present + simultaneous action = present subjunctive (Penso che mangi); present + earlier action = past subjunctive (Penso che abbia mangiato).', 'Main clause in the past or conditional + simultaneous = imperfect subjunctive (Pensavo che mangiasse); past + earlier = pluperfect subjunctive (Pensavo che avesse mangiato).'],
    [['Main clause “Pensavo che...”, simultaneous action. Which verb?', 'mangiasse', 'mangi'], ['Main clause “Penso che...”, earlier action. Which verb?', 'abbia mangiato', 'avesse mangiato']],
  ),
};
