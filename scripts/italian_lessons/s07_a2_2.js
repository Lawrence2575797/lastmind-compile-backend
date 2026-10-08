'use strict';
const { V, R } = require('./helpers');

// A2.2 Imperfetto and its contrast with the passato prossimo
module.exports = {
  IMPF_IRE_SG: V('dormivo=I was sleeping / I used to sleep; dormivi=you were sleeping / used to sleep', ['The imperfetto of an -ire verb: take the stem dorm- and add -ivo (io) or -ivi (tu).']),
  IMPF_IRE_SG__2: V('dormiva=he / she was sleeping / used to sleep', ['Add -iva for lui/lei.']),
  IMPF_IRE_PL: V('dormivamo=we were sleeping / used to sleep; dormivate=you (more than one person) were sleeping', ['Add -ivamo for noi and -ivate for voi.']),
  IMPF_IRE_PL__2: V('dormivano=they were sleeping / used to sleep', ['Add -ivano for loro.']),
  IMPF_ARE_SG: V('parlavo=I was speaking / I used to speak; parlavi=you were speaking / used to speak', ['The imperfetto of an -are verb: take the stem parl- and add -avo (io) or -avi (tu).']),
  IMPF_ARE_SG__2: V('parlava=he / she was speaking / used to speak', ['Add -ava for lui/lei.']),
  IMPF_ARE_PL: V('parlavamo=we were speaking / used to speak; parlavate=you (more than one person) were speaking', ['Add -avamo for noi and -avate for voi.']),
  IMPF_ARE_PL__2: V('parlavano=they were speaking / used to speak', ['Add -avano for loro.']),
  IMPF_ERE_SG: V('prendevo=I was taking / I used to take; prendevi=you were taking / used to take', ['The imperfetto of an -ere verb: take the stem prend- and add -evo (io) or -evi (tu).']),
  IMPF_ERE_SG__2: V('prendeva=he / she was taking / used to take', ['Add -eva for lui/lei.']),
  IMPF_ERE_PL: V('prendevamo=we were taking / used to take; prendevate=you (more than one person) were taking', ['Add -evamo for noi and -evate for voi.']),
  IMPF_ERE_PL__2: V('prendevano=they were taking / used to take', ['Add -evano for loro.']),
  IMPF_ESSERE: V('ero=I was; eri=you were', ['Essere has its own imperfetto stem: er-.']),
  IMPF_ESSERE__2: V('era=he / she was; eravamo=we were'),
  IMPF_ESSERE__3: V('eravate=you (more than one person) were; erano=they were'),
  IMPF_FARE: V('facevo=I was doing / used to do', ['Fare uses the longer stem fac- in the imperfetto: facevo, facevi, faceva, facevamo, facevate, facevano.']),
  IMPF_DIRE: V('dicevo=I was saying / used to say', ['Dire uses the stem dic- in the imperfetto: dicevo, dicevi, diceva, dicevamo, dicevate, dicevano.']),
  IMPF_BERE: V('bevevo=I was drinking / used to drink', ['Bere uses the stem bev- in the imperfetto: bevevo, bevevi, beveva, bevevamo, bevevate, bevevano.']),
  IMPF_USE_HABITUAL: R(
    ['Use the imperfetto for things you used to do again and again in the past: Da bambino giocavo sempre a calcio means “As a child I always used to play football”.', 'Words like sempre (always) and ogni giorno (every day) often go with it.'],
    [['“When I was little, I used to play every day”: the verb is in the...', 'imperfetto', 'passato prossimo']],
  ),
  IMPF_USE_BACKGROUND: R(
    ['Use the imperfetto to set the scene: what was going on around a moment. Pioveva means “It was raining”, and Leggevo un libro means “I was reading a book”.', 'It describes the background, with no clear start or end.'],
    [['“It was raining”', 'Pioveva', 'È piovuto'], ['Which tense sets the scene?', 'imperfetto', 'passato prossimo']],
  ),
  PP_KNOWLEDGE: R(
    ['Remember how the passato prossimo is built: the present of avere or essere plus the past participle: Ho mangiato, Sono andato.', 'It is the tense for things that happened and finished.'],
    [['Which is a passato prossimo?', 'Ho mangiato', 'Mangiavo'], ['Which is a passato prossimo?', 'Sono andato', 'Andavo']],
  ),
  PP_USE_SINGLE: R(
    ['Use the passato prossimo for one finished action: Ieri ho mangiato la pizza means “Yesterday I ate the pizza”.'],
    [['“Yesterday I bought a book”', 'Ieri ho comprato un libro', 'Ieri compravo un libro']],
  ),
  PP_USE_SEQUENCE: R(
    ['Use the passato prossimo for a chain of finished actions, one after another: Mi sono alzato, ho fatto colazione e sono uscito means “I got up, had breakfast and went out”.'],
    [['A chain of finished actions uses...', 'the passato prossimo', 'the imperfetto']],
  ),
  PP_USE_DEFINED: R(
    ['Use the passato prossimo when an action has a clear start or end: Ho studiato due ore means “I studied for two hours”.', 'The time is limited, so it is a finished event.'],
    [['“I studied for two hours”', 'Ho studiato due ore', 'Studiavo due ore']],
  ),
  IMPF_AVERE: V('avevo=I had; avevi=you had', ['Avere is regular in the imperfetto: take the stem av- and add -evo, -evi.']),
  IMPF_AVERE__2: V('aveva=he / she had; avevamo=we had'),
  IMPF_AVERE__3: V('avevate=you (more than one person) had; avevano=they had'),
  IMPF_USE_STATES: R(
    ['Use the imperfetto for states in the past that have no clear end: age, weather, feelings and how somebody looked.', 'Avevo dieci anni means “I was ten”. Faceva freddo means “It was cold”. Ero stanco means “I was tired”.'],
    [['“I was ten years old”', 'Avevo dieci anni', 'Ho avuto dieci anni'], ['“It was cold”', 'Faceva freddo', 'Ha fatto freddo']],
  ),
  CONTRAST: R(
    ['Put the two together: the imperfetto sets the scene, and the passato prossimo is the event that breaks in.', 'Mangiavo quando è arrivato Marco means “I was eating when Marco arrived”. Mangiavo is the scene and è arrivato is the interruption.'],
    [['“I was reading when the phone rang”. Which verb is the imperfetto?', 'leggevo', 'ha squillato'], ['In “Dormivo quando è arrivato Marco”, which verb is the event that interrupts?', 'è arrivato', 'Dormivo']],
  ),
};
