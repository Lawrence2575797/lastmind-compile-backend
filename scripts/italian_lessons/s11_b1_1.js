'use strict';
const { V, R } = require('./helpers');

// B1.1 The conditional
module.exports = {
  future_tense_stems: R(
    ['The conditional uses the same stems as the future. Some are irregular: essere gives sar-, avere gives avr-, andare gives andr-, fare gives far-.', 'Sarò, avrò, andrò, farò are the future forms; the conditional will keep the same stems.'],
    [['What is the future stem of avere?', 'avr-', 'av-'], ['What is the future stem of andare?', 'andr-', 'and-']],
  ),
  past_participle: R(
    ['The past participle is the form used in compound tenses: parlato, venduto, dormito (regular), and fatto, visto, scritto (irregular).', 'You need it for the past conditional: avrei mangiato, sarei andato.'],
    [['Past participle of fare', 'fatto', 'fato'], ['Past participle of dormire', 'dormito', 'dormuto']],
  ),
  auxiliary_choice: R(
    ['Most verbs use avere as the helper in compound tenses, and verbs of movement and change use essere: ho mangiato, but sono andato.', 'With essere, the participle agrees with the subject: sono andata (f.).'],
    [['“I have eaten”', 'ho mangiato', 'sono mangiato'], ['“She has gone”', 'è andata', 'ha andata']],
  ),
  modal_verbs_present: R(
    ['Potere (can) and dovere (must) are irregular in the present: posso, puoi, può, possiamo, potete, possono; devo, devi, deve, dobbiamo, dovete, devono.', 'The conditional of these verbs is built on them, so learn them well.'],
    [['“I can”', 'posso', 'possono'], ['“I must”', 'devo', 'deve']],
  ),
  modal_verbs_present__2: R(
    ['Volere (to want) is irregular in the present: voglio, vuoi, vuole, vogliamo, volete, vogliono.', 'Vorrei, “I would like”, comes from the same verb.'],
    [['“I want”', 'voglio', 'vuole'], ['“They want”', 'vogliono', 'vogliamo']],
  ),
  COND_SG: V('parlerei=I would speak; parleresti=you would speak', ['The present conditional is the future stem plus -ei or -esti.']),
  COND_SG__2: V('parlerebbe=he / she would speak', ['Add -ebbe for lui/lei.']),
  COND_PL: V('parleremmo=we would speak; parlereste=you (more than one person) would speak', ['Add -emmo for noi and -este for voi.']),
  COND_PL__2: V('parlerebbero=they would speak', ['Add -ebbero for loro.']),
  pres_cond_formation: R(
    ['To form the present conditional, take the future stem and add the conditional endings: -ei, -esti, -ebbe, -emmo, -este, -ebbero.', 'Andare gives andrei (I would go), avere gives avrei (I would have), essere gives sarei (I would be), potere gives potrei (I could).'],
    [['“I would go”', 'andrei', 'andrò'], ['“I would be”', 'sarei', 'sarò']],
    { say: [['How do you say “I would go”?', 'andrei'], ['How do you say “I would be”?', 'sarei']] },
  ),
  pres_cond_polite_requests: R(
    ['The conditional makes a request polite. Vorrei un caffè means “I would like a coffee”, and Potrebbe aiutarmi? means “Could you help me?”.', 'Compare Voglio un caffè, “I want a coffee”, which sounds blunt.'],
    [['Which is more polite?', 'Vorrei un caffè', 'Voglio un caffè']],
    { say: [['How do you politely say “I would like a coffee”?', 'Vorrei un caffè']] },
  ),
  pres_cond_advice: R(
    ['Use the conditional of dovere to give advice: Dovresti dormire di più means “You should sleep more”.', 'It is softer than Devi dormire, “You must sleep”.'],
    [['“You should sleep more”', 'Dovresti dormire di più', 'Devi dormire di più']],
    { say: [['How do you say “You should” (to a friend, with dovere)?', 'Dovresti']] },
  ),
  pres_cond_hedging: R(
    ['The conditional softens an opinion: Direi che è giusto means “I would say it is right”.', 'It sounds less certain and less aggressive than È giusto, “It is right”.'],
    [['Which one softens the opinion?', 'Direi che è giusto', 'È giusto']],
  ),
  avere_essere_present: V('avrei=I would have; sarei=I would be', ['These two verbs also act as helpers for the past conditional.']),
  past_cond_formation: R(
    ['The past conditional is the present conditional of avere or essere plus the past participle: Avrei mangiato means “I would have eaten”, and Sarei andato means “I would have gone”.'],
    [['“I would have eaten”', 'Avrei mangiato', 'Ho mangiato'], ['“I would have gone” (a man)', 'Sarei andato', 'Avrei andato']],
    { say: [['How do you say “I would have eaten”?', 'Avrei mangiato']] },
  ),
  past_cond_unfulfilled_wish: R(
    ['Use the past conditional for something you wanted to do but did not: Avrei voluto venire means “I would have liked to come” (but I could not).', 'Sarei andato al mare means “I would have gone to the beach”.'],
    [['“I would have liked to come”', 'Avrei voluto venire', 'Vorrei venire']],
  ),
  past_cond_reported_future: R(
    ['The past conditional also reports a future from the past’s point of view: Ha detto che sarebbe venuto means “He said that he would come”.', 'Sarebbe venuto is “would have come”, which in English becomes “would come”.'],
    [['“He said that he would come”', 'Ha detto che sarebbe venuto', 'Ha detto che verrà']],
  ),
  modal_verbs_conditional: V('potrei=I could; dovrei=I should; vorrei=I would like', ['The conditional of modal verbs softens a request, an obligation or a suggestion.']),
  ESSERE_ALL_TENSES: R(
    ['Essere across the tenses so far: sono (present), ero (imperfetto).', 'Sono stanco means “I am tired”, and Ero stanco means “I was tired”.'],
    [['“I was tired”', 'Ero stanco', 'Sono stanco'], ['“I am tired”', 'Sono stanco', 'Ero stanco']],
  ),
  ESSERE_ALL_TENSES__2: R(
    ['Essere in the future and the conditional: sarò (I will be), sarei (I would be).', 'Sarò a casa means “I will be at home”, and Sarei a casa means “I would be at home”.'],
    [['“I will be at home”', 'Sarò a casa', 'Sarei a casa'], ['“I would be at home”', 'Sarei a casa', 'Sarò a casa']],
  ),
  pres_cond_wish: R(
    ['Use the conditional to express a wish: Mi piacerebbe viaggiare means “I would like to travel”, and Vorrei una casa grande means “I would like a big house”.'],
    [['“I would like to travel”', 'Mi piacerebbe viaggiare', 'Mi piace viaggiare']],
  ),
  present_vs_past_cond_choice: R(
    ['Use the present conditional for now or later: Vorrei un caffè means “I would like a coffee”.', 'Use the past conditional for something that did not happen in the past: Avrei voluto un caffè means “I would have liked a coffee”.'],
    [['“I would like a coffee (now)”', 'Vorrei un caffè', 'Avrei voluto un caffè'], ['“I would have liked a coffee (then)”', 'Avrei voluto un caffè', 'Vorrei un caffè']],
  ),
};
