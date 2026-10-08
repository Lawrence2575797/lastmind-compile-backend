'use strict';
const { V, R } = require('./helpers');

// B1.5 The passive and the impersonal si
module.exports = {
  TRANS_VERBS: R(
    ['Only transitive verbs, which take a direct object, can be made passive: Marco legge il libro becomes Il libro è letto da Marco.', 'Verbs like andare or dormire have no object, so they have no passive.'],
    [['Which verb can be made passive?', 'leggere', 'dormire']],
  ),
  SIMPLE_TENSES: R(
    ['A simple tense is one verb word: parlo, parlavo, parlerò. A compound tense uses a helper plus a participle: ho parlato, ero andato.', 'The venire passive works only with simple tenses.'],
    [['Which is a simple tense?', 'parlavo', 'ho parlato'], ['Which is a compound tense?', 'ho parlato', 'parlerò']],
  ),
  SI_REFLEXIVE_FORM: R(
    ['Si is also the reflexive pronoun: lavarsi means “to wash oneself”, and Marco si lava means “Marco washes himself”.', 'The same word si builds the impersonal and the passive si constructions.'],
    [['What does Marco si lava mean?', 'Marco washes himself', 'Marco washes it']],
  ),
  DIRECT_OBJECT_CONCEPT: R(
    ['The direct object is the thing or person the verb acts on, with no preposition: in Leggo il libro, il libro is the direct object.', 'In the passive, the direct object becomes the subject: Il libro è letto.'],
    [['In “Compro il pane”, what is the direct object?', 'il pane', 'compro']],
  ),
  SUBJ_VERB_AGREEMENT: R(
    ['A verb agrees with its subject in number: Il libro è nuovo, I libri sono nuovi.', 'This is what makes si passivante work: the verb matches the noun that follows.'],
    [['“The books are new”', 'I libri sono nuovi', 'I libri è nuovi']],
  ),
  SI_PASSIVANTE: R(
    ['Si passivante is a passive without saying who does the action: Si vende un libro means “A book is sold”, and Si vendono libri means “Books are sold”.', 'The verb agrees with the noun that follows: vende (singular), vendono (plural).'],
    [['“Books are sold here”', 'Si vendono libri', 'Si vende libri'], ['“A book is sold here”', 'Si vende un libro', 'Si vendono un libro']],
  ),
  PP_AGREE: R(
    ['With essere, the past participle agrees with the subject: La porta è chiusa, Le porte sono chiuse, Il negozio è aperto.', 'This is how the essere passive works: the participle matches the subject.'],
    [['“The doors are closed”', 'Le porte sono chiuse', 'Le porte sono chiusi']],
  ),
  PASSIVE_ESSERE: R(
    ['The passive is essere plus the past participle: Il libro è letto means “The book is read”, and Le case sono vendute means “The houses are sold”.', 'The participle agrees with the subject.'],
    [['“The book is read”', 'Il libro è letto', 'Il libro ha letto'], ['“The houses are sold”', 'Le case sono vendute', 'Le case sono venduto']],
  ),
  PASSIVE_AGENT_DA: R(
    ['To say who does the action in a passive, use da: Il libro è letto da Marco means “The book is read by Marco”.', 'Da introduces the agent.'],
    [['“The book is read by Marco”', 'Il libro è letto da Marco', 'Il libro è letto per Marco']],
  ),
  VENIRE_CONJ: V('vengo=I come; viene=he / she comes', ['Venire is irregular in the present: vengo, vieni, viene, veniamo, venite, vengono.']),
  PASSIVE_VENIRE: R(
    ['In simple tenses you can use venire instead of essere to make a passive: Il libro viene letto means “The book is (being) read”.', 'Il libro viene letto da molti means “The book is read by many people”.'],
    [['Which uses venire?', 'Il libro viene letto', 'Il libro è letto']],
  ),
  VENIRE_ESSERE_STYLE: R(
    ['Venire is a common substitute for essere in a passive because it avoids confusion with the plain description: La porta è chiusa can mean “is closed” (a state) or “is being closed”. La porta viene chiusa is clearly the action.'],
    [['Which one clearly describes the action of closing?', 'La porta viene chiusa', 'La porta è chiusa']],
  ),
  SI_IMPERSONALE: R(
    ['Si impersonale means “one”, “people” or “you” in general: Si mangia bene qui means “One eats well here”, and In Italia si parla italiano means “In Italy people speak Italian”.', 'The verb is singular.'],
    [['“One eats well here”', 'Si mangia bene qui', 'Si mangiano bene qui']],
  ),
  SI_IMPERSONALE_REFLEXIVE: R(
    ['With a reflexive verb, the impersonal si becomes ci si: Ci si alza presto means “One gets up early”.', 'You cannot put two si next to each other, so the first one becomes ci.'],
    [['“One gets up early”', 'Ci si alza presto', 'Si si alza presto']],
  ),
  PASSIVE_ESSERE_EVAL: R(
    ['The essere passive is a good choice when you want to describe a state or when you use a compound tense: Il libro è stato letto means “The book has been read”.', 'Venire cannot be used in compound tenses.'],
    [['“The book has been read”', 'Il libro è stato letto', 'Il libro è venuto letto']],
  ),
  PASSIVE_VENIRE_EVAL: R(
    ['The venire passive is a good choice for an action in a simple tense: La porta viene chiusa alle sei means “The door is closed at six”.', 'It is clear that this is an action, not a state.'],
    [['Which is a natural choice for an action in progress?', 'La porta viene chiusa alle sei', 'La porta è stata venuta chiusa']],
  ),
  SI_DISTINGUISH: R(
    ['Si passivante has a direct object noun that the verb agrees with: Si vendono libri. Si impersonale has no such noun: Si mangia bene.', 'If there is a noun being acted on, it is probably si passivante.'],
    [['Which has a noun the verb agrees with?', 'Si vendono libri', 'Si mangia bene']],
  ),
  SI_PASSIVANTE_EVAL: R(
    ['Si passivante is a good choice for general statements about what is done: Si vendono libri usati means “Used books are sold”, as on a sign.', 'It is short and does not name who does it.'],
    [['Which suits a shop sign?', 'Si vendono libri', 'Libri sono venduti da noi']],
  ),
  PASSIVE_FORM_CHOICE: R(
    ['You now have three ways to express a passive idea: essere + participle (Il libro è letto), venire + participle (Il libro viene letto) and si passivante (Si legge il libro).', 'Choose by context: a state or a compound tense needs essere, an action in a simple tense can use venire, and a general statement can use si.'],
    [['A sign saying “Books are sold here” would use...', 'si passivante', 'venire'], ['“The book has been read” (compound tense) needs...', 'essere', 'venire']],
  ),
};
