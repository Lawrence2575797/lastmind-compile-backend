'use strict';
const { V, R } = require('./helpers');

// A2.1 Passato prossimo
module.exports = {
  PRECEDING_DO_PRONOUNS: R(
    ['A direct object pronoun stands in for a noun and goes before the verb: Lo compro means “I buy it”, and Li prendo means “I take them”.', 'Lo is “it” for a masculine thing; la is “it” for a feminine thing; li and le are “them”.'],
    [['“I buy it” (masculine thing)', 'Lo compro', 'Compro lo'], ['“I take them” (masculine things)', 'Li prendo', 'Le prendo']],
  ),
  TIME_EXPRESSIONS_KNOWN: V('ieri=yesterday; la settimana scorsa=last week'),
  TIME_EXPRESSIONS_KNOWN__2: V('già=already; non ... ancora=not yet', ['Già goes in the middle of the verb: Ho già mangiato means “I have already eaten”.', 'Non ... ancora wraps the verb: Non ho ancora mangiato means “I have not eaten yet”.'], { say: [['How do you say “already”?', 'già']] }),
  PP_IRREG_1: V('fatto=done / made; detto=said / told', ['Fatto is the past participle of fare (to do, to make), and detto is the past participle of dire (to say).'], { say: [['What is the past participle of fare?', 'fatto'], ['What is the past participle of dire?', 'detto']] }),
  PP_IRREG_1__2: V('visto=seen; letto=read', ['Visto is the past participle of vedere (to see), and letto is the past participle of leggere (to read).'], { say: [['What is the past participle of vedere?', 'visto'], ['What is the past participle of leggere?', 'letto']] }),
  PP_IRREG_2: V('scritto=written; aperto=opened', ['Scritto comes from scrivere (to write), and aperto comes from aprire (to open).'], { say: [['What is the past participle of scrivere?', 'scritto'], ['What is the past participle of aprire?', 'aperto']] }),
  PP_IRREG_2__2: V('chiuso=closed; preso=taken', ['Chiuso comes from chiudere (to close), and preso comes from prendere (to take).'], { say: [['What is the past participle of chiudere?', 'chiuso'], ['What is the past participle of prendere?', 'preso']] }),
  PP_IRREG_3: V('messo=put; venuto=come', ['Messo comes from mettere (to put), and venuto comes from venire (to come).'], { say: [['What is the past participle of mettere?', 'messo'], ['What is the past participle of venire?', 'venuto']] }),
  PP_IRREG_3__2: V('rimasto=stayed; nato=born', ['Rimasto comes from rimanere (to stay), and nato comes from nascere (to be born).'], { say: [['What is the past participle of rimanere?', 'rimasto'], ['What is the past participle of nascere?', 'nato']] }),
  PP_IRREG_4: V('morto=died; successo=happened', ['Morto comes from morire (to die), and successo comes from succedere (to happen).'], { say: [['What is the past participle of morire?', 'morto'], ['What is the past participle of succedere?', 'successo']] }),
  PRESENT_AVERE: R(
    ['The present tense of avere is ho, hai, ha, abbiamo, avete, hanno.', 'You need these forms to build the passato prossimo: ho mangiato, hai mangiato, ha mangiato.'],
    [['“We have”', 'abbiamo', 'avete'], ['“They have”', 'hanno', 'ha']],
  ),
  PRESENT_ESSERE: R(
    ['The present tense of essere is sono, sei, è, siamo, siete, sono.', 'You need these forms to build the passato prossimo of verbs of movement: sono andato, sei andato, è andato.'],
    [['“We are”', 'siamo', 'siete'], ['“You are” (one friend)', 'sei', 'sono']],
  ),
  PAST_PARTICIPLE_REGULAR: R(
    ['To make the past participle of a regular -are verb, change -are to -ato: parlare becomes parlato, and mangiare becomes mangiato.', 'For a regular -ere verb, change -ere to -uto: ricevere becomes ricevuto, and vendere becomes venduto.'],
    [['Past participle of parlare', 'parlato', 'parluto'], ['Past participle of ricevere', 'ricevuto', 'ricevato']],
    { say: [['What is the past participle of mangiare?', 'mangiato']] },
  ),
  PAST_PARTICIPLE_REGULAR__2: R(
    ['For a regular -ire verb, change -ire to -ito: dormire becomes dormito, capire becomes capito, and finire becomes finito.'],
    [['Past participle of dormire', 'dormito', 'dormuto'], ['Past participle of finire', 'finito', 'finato']],
    { say: [['What is the past participle of capire?', 'capito']] },
  ),
  AUX_CHOICE_ESSERE_SET: R(
    ['Verbs of movement and change use essere: andare (to go), venire (to come), arrivare (to arrive), partire (to leave), nascere (to be born), morire (to die), rimanere (to stay).', 'Reflexive verbs, like svegliarsi (to wake up), use essere too.'],
    [['Which helper goes with andare?', 'essere', 'avere'], ['Which helper goes with arrivare?', 'essere', 'avere']],
  ),
  AUX_CHOICE_AVERE_SET: R(
    ['Most verbs use avere, especially the ones that take a direct object: mangiare (to eat), comprare (to buy), vedere (to see), parlare (to speak).'],
    [['Which helper goes with mangiare?', 'avere', 'essere'], ['Which helper goes with comprare?', 'avere', 'essere']],
  ),
  FORMATION_AVERE: R(
    ['With avere, the passato prossimo is the present of avere plus the past participle: Ho mangiato means “I ate” or “I have eaten”.', 'Abbiamo parlato means “We spoke”, and Hanno comprato means “They bought”.'],
    [['“I ate”', 'Ho mangiato', 'Sono mangiato']],
    { say: [['How do you say “I ate”?', 'Ho mangiato'], ['How do you say “We spoke”?', 'Abbiamo parlato']] },
  ),
  FORMATION_ESSERE: R(
    ['With essere, the passato prossimo is the present of essere plus the past participle: Sono andato means “I went” (a man), and Siamo arrivati means “We arrived”.'],
    [['“I went” (a man)', 'Sono andato', 'Ho andato']],
    { say: [['How do you say “I went” (a man)?', 'Sono andato'], ['How do you say “We arrived” (a group of men)?', 'Siamo arrivati']] },
  ),
  AGREEMENT_ESSERE: R(
    ['With essere, the past participle changes to match the subject: Marco è andato (m.), Giulia è andata (f.), Marco e Luca sono andati (m. plural), Giulia e Anna sono andate (f. plural).'],
    [['Giulia went: Giulia è ___', 'andata', 'andato'], ['Giulia and Anna went: Giulia e Anna sono ___', 'andate', 'andati']],
  ),
  NON_AGREEMENT_AVERE: R(
    ['With avere, the past participle does not change to match the subject: Giulia ha mangiato, and Le ragazze hanno mangiato.'],
    [['Giulia ate: Giulia ha ___', 'mangiato', 'mangiata'], ['The girls ate: Le ragazze hanno ___', 'mangiato', 'mangiate']],
  ),
  AGREEMENT_PRECEDING_DO_PRONOUN: R(
    ['If lo, la, li or le comes before avere, the participle matches that pronoun: La compro becomes L’ho comprata, and Li vedo becomes Li ho visti.', 'The participle agrees with what the pronoun stands for, not with the subject.'],
    [['“I bought it” (la torta, feminine): L’ho ___', 'comprata', 'comprato'], ['“I saw them” (masculine): Li ho ___', 'visti', 'visto']],
  ),
  NEGATION_PLACEMENT: R(
    ['In the passato prossimo, non goes before the helper verb: Non ho mangiato means “I did not eat”, and Non sono andato means “I did not go”.'],
    [['“I did not eat”', 'Non ho mangiato', 'Ho non mangiato']],
    { say: [['How do you say “I did not eat”?', 'Non ho mangiato']] },
  ),
  TIME_EXPRESSION_PLACEMENT: R(
    ['Short words like già sit between the helper and the participle: Ho già mangiato means “I have already eaten”.', 'Longer time words like ieri go at the start or the end: Ieri ho mangiato or Ho mangiato ieri.'],
    [['“I have already eaten”', 'Ho già mangiato', 'Ho mangiato già']],
  ),
};
