'use strict';
const { V, R } = require('./helpers');

// B2.3 Reported speech
module.exports = {
  DIR_SPEECH: R(
    ['Direct speech is the exact words somebody said, in quotation marks: Marco ha detto: «Vengo domani» means “Marco said: ‘I am coming tomorrow’”.', 'Reported speech tells what was said without the exact words: Marco ha detto che veniva il giorno dopo.'],
    [['Which one is direct speech?', 'Marco ha detto: «Vengo domani»', 'Marco ha detto che veniva il giorno dopo']],
  ),
  WH_QUESTIONS: R(
    ['A wh-question starts with a question word: Dove vai? (Where are you going?), Cosa fai? (What are you doing?), Quando arrivi? (When do you arrive?).', 'In direct speech the question word comes first and the verb follows.'],
    [['“Where are you going?”', 'Dove vai?', 'Vai dove?']],
  ),
  REPORT_VERBS: V('ha detto che=he / she said that; ha spiegato che=he / she explained that', ['Ha detto che era stanco means “He said that he was tired”.']),
  REPORT_VERBS__2: V('ha chiesto se=he / she asked whether', ['Ha chiesto se venivo means “He asked whether I was coming”.']),
  PRONOUN_SHIFT: R(
    ['In reported speech, the pronouns change to match the new speaker’s point of view: «Io sono stanco» becomes Ha detto che era stanco (io becomes lui).', 'Ha detto: «Io vengo» becomes Ha detto che lui veniva.'],
    [['Marco said “Io sono stanco”. Reported: “Ha detto che ___ era stanco”', 'lui', 'io']],
  ),
  PAST_TENSES: R(
    ['The two main past tenses are the passato prossimo (ho mangiato, a finished action) and the imperfetto (mangiavo, an ongoing or habitual one).', 'Reported speech often turns one into the other.'],
    [['Which one is the imperfetto?', 'mangiavo', 'ho mangiato']],
  ),
  PAST_TENSES__2: R(
    ['The trapassato prossimo is the imperfetto of avere or essere plus the past participle: avevo mangiato (I had eaten), ero andato (I had gone).', 'It is the past of the past.'],
    [['“I had eaten”', 'avevo mangiato', 'ho mangiato']],
  ),
  FUTURE_COND: R(
    ['The future (verrò, “I will come”) and the present conditional (verrei, “I would come”) are both needed: in reported speech the future often becomes the conditional.', 'Ha detto: «Verrò» becomes Ha detto che sarebbe venuto.'],
    [['“I will come”', 'verrò', 'verrei'], ['“I would come”', 'verrei', 'verrò']],
  ),
  PRESENT_TENSE: R(
    ['The present indicative is the tense of the direct speech: Mangio, vado, vengo.', 'It is the tense that changes when you report speech in the past.'],
    [['Which is a present tense?', 'vado', 'andavo']],
  ),
  POSSESSIVES: V('il mio=my; il tuo=your (one friend)', ['Il mio libro means “my book” and il tuo libro means “your book”.']),
  POSSESSIVES__2: V('il suo=his / her / your (formal)', ['Il suo libro can mean “his book” or “her book”. The context decides.']),
  POSSESSIVE_SHIFT: R(
    ['In reported speech, possessives change with the point of view: «Il mio libro è nuovo» becomes Ha detto che il suo libro era nuovo (il mio becomes il suo).'],
    [['Marco: “Il mio libro è nuovo”. Reported: “Ha detto che ___ libro era nuovo”', 'il suo', 'il mio']],
  ),
  TIME_ADVERBS: V('oggi=today; domani=tomorrow'),
  TIME_ADVERBS__2: V('ieri=yesterday; qui=here'),
  TIME_ADVERB_SHIFT: R(
    ['In reported speech, oggi becomes quel giorno (that day), and domani becomes il giorno dopo (the next day).', '«Vengo domani» becomes Ha detto che veniva il giorno dopo.'],
    [['“Domani” in reported speech becomes...', 'il giorno dopo', 'quel giorno']],
    { say: [['What does “domani” become in reported speech?', 'il giorno dopo']] },
  ),
  TIME_ADVERB_SHIFT__2: R(
    ['Ieri becomes il giorno prima (the day before), and qui becomes lì (there).', '«Ieri ero qui» becomes Ha detto che il giorno prima era lì.'],
    [['“Qui” in reported speech becomes...', 'lì', 'qui']],
    { say: [['What does “ieri” become in reported speech?', 'il giorno prima']] },
  ),
  YN_QUESTIONS: R(
    ['A yes/no question has the same word order as a statement and a rising voice: Vieni? means “Are you coming?”.', 'In writing, the question mark is what tells you.'],
    [['“Are you coming?”', 'Vieni?', 'Come vieni?']],
  ),
  REPORT_YN_SE: R(
    ['To report a yes/no question, use se (“whether” or “if”): «Vieni?» becomes Ha chiesto se venivo, “He asked whether I was coming”.'],
    [['Reported yes/no question uses...', 'se', 'che']],
    { say: [['Which word means “whether” when you report a yes/no question?', 'se']] },
  ),
  STATEMENT_WORD_ORDER: R(
    ['Reported questions use statement word order, with the subject first: Ha chiesto dove andavo (He asked where I was going).', 'The question mark disappears, because it is no longer a direct question.'],
    [['“He asked where I was going”', 'Ha chiesto dove andavo', 'Ha chiesto dove andavo io?']],
  ),
  REPORT_WH: R(
    ['To report a wh-question, keep the question word and use statement word order: «Dove vai?» becomes Ha chiesto dove andavo.'],
    [['Report: “Cosa fai?”', 'Ha chiesto cosa facevo', 'Ha chiesto se facevo']],
  ),
  TRAPASSATO_PROSSIMO_FORM: R(
    ['The trapassato prossimo is the imperfetto of avere or essere plus the past participle: avevo mangiato, avevi mangiato, aveva mangiato; ero andato, eri andato.', 'It is used when the original speech was in the passato prossimo.'],
    [['“He had eaten”', 'aveva mangiato', 'ha mangiato']],
  ),
  REPORTING_VERB_TENSE_RULE: R(
    ['The tenses shift back only when the reporting verb is in a past tense: Ha detto che era stanco (he said he was tired).', 'If the reporting verb is in the present, nothing shifts: Dice che è stanco (he says he is tired).'],
    [['Which one shifts the tense?', 'Ha detto che era stanco', 'Dice che è stanco']],
  ),
  BACKSHIFT_PRES_IMPF: R(
    ['The present becomes the imperfetto: «Sono stanco» becomes Ha detto che era stanco.', 'Vado becomes andavo, and mangio becomes mangiava.'],
    [['«Mangio» reported (he said...): “Ha detto che ___”', 'mangiava', 'mangia']],
  ),
  BACKSHIFT_PP_TRAP: R(
    ['The passato prossimo becomes the trapassato prossimo: «Ho mangiato» becomes Ha detto che aveva mangiato.', '«Sono andato» becomes Ha detto che era andato.'],
    [['«Ho mangiato» reported: “Ha detto che ___”', 'aveva mangiato', 'ha mangiato']],
  ),
  BACKSHIFT_FUT_COND: R(
    ['The future becomes the past conditional: «Verrò» becomes Ha detto che sarebbe venuto.', '«Mangerò» becomes Ha detto che avrebbe mangiato.'],
    [['«Verrò» reported: “Ha detto che ___”', 'sarebbe venuto', 'verrà']],
  ),
  NO_BACKSHIFT_PRESENT: R(
    ['When the reporting verb is in the present, the tense stays the same: Dice che viene means “He says that he is coming”, and Dice che è andato means “He says that he went”.'],
    [['“He says that he is coming”', 'Dice che viene', 'Dice che veniva']],
  ),
  FULL_REPORTED_SPEECH: R(
    ['To report speech fully, change the tense, the pronouns and the time words together: Marco: «Domani vengo da te» becomes Marco ha detto che il giorno dopo sarebbe venuto da me.', 'Domani becomes il giorno dopo, the present becomes the conditional, and te becomes me because of the new speaker.'],
    [['Which time word fits the report of “domani”?', 'il giorno dopo', 'domani']],
  ),
};
