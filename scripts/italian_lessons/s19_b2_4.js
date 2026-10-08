'use strict';
const { V, R } = require('./helpers');

// B2.4 Gerund, advanced connectors and register
module.exports = {
  subordinate_clauses_basic: R(
    ['A subordinating conjunction joins a dependent clause to a main clause: perché (because), quando (when), se (if), anche se (even if).', 'Resto a casa perché piove means “I stay at home because it is raining”.'],
    [['Which word is the conjunction in “Resto a casa perché piove”?', 'perché', 'resto']],
  ),
  object_reflexive_pronouns: R(
    ['Object and reflexive pronouns are mi, ti, lo, la, ci, vi, li, le, gli and si. They stand in for objects or show an action on oneself: Lo vedo (I see him), Mi alzo (I get up).'],
    [['“I see her”', 'La vedo', 'La vedi'], ['“I get up”', 'Mi alzo', 'Lo alzo']],
  ),
  pronoun_attachment_rules: R(
    ['Pronouns attach to the end of an infinitive (without its final -e): Voglio vederlo; of a gerund: Vedendolo; and of a tu-command: Guardalo!', 'Before a conjugated verb they go in front: Lo vedo.'],
    [['“Seeing him” (vedere)', 'vedendolo', 'lo vedendo'], ['“I want to see it”', 'Voglio vederlo', 'Voglio lo vedere']],
  ),
  register_written: R(
    ['Register is how formal your language is. Written and formal Italian uses full forms and connectors; spoken Italian is looser and uses contractions and fillers.', 'A formal essay avoids spoken shortcuts that you would use with a friend.'],
    [['Which is more suited to a formal essay?', 'Tuttavia, la situazione è cambiata', 'Però, la situazione è cambiata, eh']],
  ),
  lexical_register_choice: R(
    ['Some words are more formal than their everyday partners: comprendere (to understand, formal) vs capire (everyday); iniziare vs cominciare; ottenere vs prendere.', 'In a formal text, comprendere is the better choice, and with friends you would say capire.'],
    [['Which is the more formal verb for “to understand”?', 'comprendere', 'capire']],
  ),
  verb_conj_basic: R(
    ['Regular verbs follow their group: parlare (-are) gives parlo, parli, parla, parliamo, parlate, parlano; prendere (-ere) gives prendo, prendi, prende, prendiamo, prendete, prendono.'],
    [['“We take” (prendere)', 'prendiamo', 'prendete']],
  ),
  verb_conj_basic__2: R(
    ['Regular -ire verbs: dormire gives dormo, dormi, dorme, dormiamo, dormite, dormono. Many -ire verbs add -isc-: finire gives finisco, finisci, finisce, finiamo, finite, finiscono.'],
    [['“I finish” (finire)', 'finisco', 'finio'], ['“We finish”', 'finiamo', 'finiscono']],
  ),
  gerund_formation: R(
    ['The gerund means “doing”. For -are verbs, change -are to -ando: parlare becomes parlando. For -ere and -ire verbs, change the ending to -endo: prendere becomes prendendo, and dormire becomes dormendo.'],
    [['Gerund of parlare', 'parlando', 'parlendo'], ['Gerund of dormire', 'dormendo', 'dormando']],
    { say: [['What is the gerund of prendere?', 'prendendo']] },
  ),
  gerund_pronoun_attached: R(
    ['A pronoun attaches to the end of the gerund: vedendolo means “seeing him / it”, and alzandosi means “getting up”.', 'The pronoun is written as one word with the gerund.'],
    [['“Seeing him”', 'vedendolo', 'lo vedendo']],
  ),
  essere_stare_present: R(
    ['Stare in the present is sto, stai, sta, stiamo, state, stanno, and in the imperfect stavo, stavi, stava, stavamo, stavate, stavano.', 'It is the helper of the progressive: sto mangiando (I am eating), stavo mangiando (I was eating).'],
    [['“I am” (with a gerund)', 'sto', 'sono'], ['“I was” (with a gerund)', 'stavo', 'ero']],
  ),
  progressive_tense: R(
    ['The progressive tense is stare plus the gerund: Sto mangiando means “I am eating (right now)”, and Stavo mangiando means “I was eating”.'],
    [['“I am eating (right now)”', 'Sto mangiando', 'Sono mangiando'], ['“I was eating”', 'Stavo mangiando', 'Ero mangiando']],
    { say: [['How do you say “I am eating (right now)”?', 'Sto mangiando']] },
  ),
  gerund_adverbial: R(
    ['The gerund can express how, why or while something happens, without a conjunction: Camminando, ho incontrato Marco means “While walking, I met Marco”, and Studiando impari means “By studying, you learn”.'],
    [['“By studying, you learn”', 'Studiando impari', 'Studio impari']],
  ),
  subjunctive_mood: R(
    ['The present subjunctive is used after expressions of opinion, doubt, emotion, desire and necessity, and after connectors like sebbene and nonostante: Penso che sia vero; Sebbene piova, esco.', 'Its forms: che io parli, che lui prenda, che lui dorma.'],
    [['Which connector takes the subjunctive?', 'sebbene', 'perché sono']],
  ),
  connector_tuttavia: V('tuttavia=however', ['Tuttavia is a formal connector: Il progetto è utile; tuttavia, è costoso means “The project is useful; however, it is expensive”.']),
  connector_quindi_dunque_percio: V('quindi=therefore; dunque=so / therefore', ['Penso, dunque sono is “I think, therefore I am”. Quindi is the everyday “therefore”.']),
  connector_quindi_dunque_percio__2: V('perciò=for this reason', ['Perciò is slightly more formal: Era tardi, perciò sono tornato means “It was late, so I went back”.']),
  connector_daltra_parte: V('d’altra parte=on the other hand', ['It introduces a contrast: È caro; d’altra parte, è di qualità.']),
  connector_nonostante: R(
    ['Nonostante means “despite” or “although”. With a clause it takes the subjunctive: Nonostante piova, esco means “Although it is raining, I am going out”.', 'With a noun, no subjunctive is needed: nonostante la pioggia.'],
    [['“Despite the fact that it is raining”', 'nonostante piova', 'nonostante piove']],
    { say: [['What word means “despite”?', 'nonostante']] },
  ),
  connector_sebbene: R(
    ['Sebbene means “although” and takes the subjunctive: Sebbene sia stanco, lavoro means “Although I am tired, I work”.'],
    [['“Although he is tired”', 'sebbene sia stanco', 'sebbene è stanco']],
    { say: [['What word means “although” (with the subjunctive)?', 'sebbene']] },
  ),
  connector_malgrado: R(
    ['Malgrado means “despite” and works like nonostante: Malgrado piova, esco means “Although it is raining, I am going out”.', 'With a noun: malgrado la pioggia.'],
    [['“Despite the rain”', 'malgrado la pioggia', 'malgrado che la pioggia']],
    { say: [['What word, close to nonostante, also means “despite”?', 'malgrado']] },
  ),
  avoid_contractions_colloquialisms: R(
    ['In formal writing, avoid spoken shortcuts such as “cioè”, “tipo”, “boh” and clipped forms. Choose full, neutral words and connectors instead.', 'Write Tuttavia rather than Però when you want a more formal tone.'],
    [['Which is better in a formal essay?', 'Tuttavia', 'Boh']],
  ),
  concluding_connectors: V('in conclusione=in conclusion; in sintesi=in short', ['Use them to begin your last paragraph: In conclusione, il progetto è utile.']),
  si_impersonale: R(
    ['Si impersonale says “one” or “people” in general: Si dice che il progetto sia utile means “It is said that the project is useful”.', 'It keeps a formal text neutral, without saying “you”.'],
    [['“One eats well here”', 'Si mangia bene qui', 'Tu mangi bene qui']],
  ),
  passive_construction: R(
    ['The passive is essere plus the past participle: Il progetto è stato approvato means “The project was approved”.', 'It is common in formal writing because it focuses on the action.'],
    [['“The project was approved”', 'Il progetto è stato approvato', 'Il progetto ha approvato']],
  ),
  formal_vs_tu_directed: R(
    ['In formal writing, prefer the impersonal si or the passive over addressing the reader as tu: Si può notare che... or Va osservato che..., not Come vedi...', 'It keeps the tone objective.'],
    [['Which is more formal?', 'Si può notare che', 'Come vedi']],
  ),
  thesis_statement: R(
    ['A thesis statement is the main claim of your paragraph, stated clearly at the start: Il lavoro da remoto migliora la qualità della vita means “Working from home improves quality of life”.', 'Everything after it supports or limits that claim.'],
    [['Which sentence is a thesis?', 'Il lavoro da remoto migliora la qualità della vita', 'Ieri sono andato al lavoro']],
  ),
  argumentative_paragraph_structure: R(
    ['A short argumentative paragraph starts with a thesis, then adds an argument or example linked by connectors: Il lavoro da remoto migliora la qualità della vita. Infatti, si risparmia tempo. Tuttavia, può isolare.'],
    [['What comes first in an argumentative paragraph?', 'the thesis', 'the conclusion']],
  ),
  argumentative_paragraph_structure__2: R(
    ['End the paragraph with a conclusion that begins with a connector: In conclusione, il lavoro da remoto è un vantaggio se ben organizzato.', 'It restates the thesis in light of the arguments.'],
    [['Which connector fits a conclusion?', 'In conclusione', 'Tuttavia']],
    { say: [['How do you say “in conclusion”?', 'in conclusione']] },
  ),
};
