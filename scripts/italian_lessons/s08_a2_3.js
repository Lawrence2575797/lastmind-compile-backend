'use strict';
const { V, R } = require('./helpers');

// A2.3 Object pronouns, reflexive verbs and piacere
module.exports = {
  TRANSITIVE_VERB: R(
    ['A transitive verb is one that acts on something: comprare (to buy) needs a thing that is bought, as in Compro un libro.', 'Some verbs do not take an object: dormire (to sleep) and andare (to go) are not transitive.'],
    [['Which verb is transitive?', 'comprare', 'dormire'], ['In “Compro un libro”, what does compro act on?', 'un libro', 'io']],
  ),
  DOBJ_1: V('mi=me; ti=you', ['Direct object pronouns go before the verb: Mi vedi means “You see me”, and Ti vedo means “I see you”.']),
  DOBJ_1__2: V('lo=him / it (masculine); la=her / it (feminine)', ['Lo vedo means “I see him”, and La vedo means “I see her”.']),
  DOBJ_2: V('ci=us; vi=you (more than one person)', ['Ci vedono means “They see us”, and Vi vedo means “I see you all”.']),
  DOBJ_2__2: V('li=them (masculine); le=them (feminine)', ['Li vedo means “I see them” (men or mixed), and Le vedo means “I see them” (women).']),
  DOP_PLACEMENT: R(
    ['A direct object pronoun goes immediately before the conjugated verb: Lo compro means “I buy it”.', 'With non, the order is non + pronoun + verb: Non lo compro means “I do not buy it”.'],
    [['“I buy it”', 'Lo compro', 'Compro lo'], ['“I do not buy it”', 'Non lo compro', 'Lo non compro']],
  ),
  REFLEXIVE_VERB_CONCEPT: R(
    ['A reflexive verb describes an action people do to themselves: lavarsi means “to wash oneself”.', 'The infinitive of a reflexive verb ends in -si: lavarsi, alzarsi, vestirsi.'],
    [['Which of these is a reflexive verb?', 'lavarsi', 'lavare'], ['What does lavarsi mean?', 'to wash oneself', 'to wash something']],
  ),
  REFL_1: V('mi=myself; ti=yourself', ['Mi lavo means “I wash myself”, and ti lavi means “you wash yourself”.']),
  REFL_1__2: V('si=himself / herself', ['Si lava means “he / she washes himself / herself”.']),
  REFL_2: V('ci=ourselves; vi=yourselves', ['Ci laviamo means “we wash ourselves”, and vi lavate means “you wash yourselves”.']),
  REFL_2__2: V('si=themselves', ['Si lavano means “they wash themselves”.']),
  REFLEXIVE_FORMATION: R(
    ['A reflexive verb is the reflexive pronoun plus the verb, conjugated for the person: mi lavo, ti lavi, si lava, ci laviamo, vi lavate, si lavano.', 'The pronoun goes before the verb.'],
    [['“I wash (myself)”', 'Mi lavo', 'Lavo mi'], ['“They wash (themselves)”', 'Si lavano', 'Ci lavano']],
    { say: [['How do you say “I wash myself”?', 'Mi lavo']] },
  ),
  A_PERSON_VERBS: R(
    ['Some verbs take a before the person who receives the action: dare (to give) and dire (to say).', 'Do un libro a Marco means “I give a book to Marco”, and Dico la verità a Marco means “I tell Marco the truth”.'],
    [['“I give a book to Marco”', 'Do un libro a Marco', 'Do un libro Marco']],
  ),
  A_PERSON_VERBS__2: R(
    ['Scrivere (to write) and telefonare (to phone) also take a before the person: Scrivo a Marco means “I write to Marco”, and Telefono a Marco means “I phone Marco”.', 'In Italian you phone “to” somebody.'],
    [['“I phone Marco”', 'Telefono a Marco', 'Telefono Marco']],
  ),
  A_PERSON_VERBS__3: R(
    ['Piacere (to like) also takes a before the person: A Marco piace la pizza means “Marco likes pizza”.', 'Literally it says “Pizza is pleasing to Marco”.'],
    [['“Marco likes pizza”', 'A Marco piace la pizza', 'Marco piace la pizza']],
  ),
  IOBJ2_1: V('mi=to me; ti=to you', ['Indirect object pronouns replace a + person: Mi scrivi means “You write to me”, and Ti scrivo means “I write to you”.']),
  IOBJ2_1__2: V('gli=to him; le=to her', ['Gli scrivo means “I write to him”, and Le scrivo means “I write to her”.']),
  IOBJ2_2: V('ci=to us; vi=to you (more than one person)', ['Ci scrivi means “You write to us”, and Vi scrivo means “I write to you all”.']),
  IOBJ2_2__2: V('gli=to them; loro=to them', ['In everyday speech gli is used for “to them” as well: Gli scrivo. The formal alternative is Scrivo loro, which goes after the verb.']),
  IOP_PLACEMENT: R(
    ['An indirect object pronoun goes immediately before the conjugated verb: Gli scrivo means “I write to him”.', 'With non, the order is non + pronoun + verb: Non gli scrivo means “I do not write to him”.'],
    [['“I write to him”', 'Gli scrivo', 'Scrivo gli'], ['“I do not write to her”', 'Non le scrivo', 'Le non scrivo']],
  ),
  PIACERE_INVERSION: R(
    ['Italian does not say “I like pizza”. It says “Pizza is pleasing to me”: Mi piace la pizza.', 'The thing you like is the subject of piacere, and the person who likes it is the indirect object: mi, ti, gli, le.'],
    [['“I like pizza”', 'Mi piace la pizza', 'Piaccio la pizza'], ['In “Mi piace il caffè”, what is the subject?', 'il caffè', 'mi']],
    { say: [['How do you say “I like pizza”?', 'Mi piace la pizza']] },
  ),
  PIACERE_SG_PL: R(
    ['Piacere agrees with the thing that is liked. Use piace for one thing: Mi piace il caffè.', 'Use piacciono for more than one thing: Mi piacciono i panini means “I like sandwiches”.'],
    [['“I like sandwiches”', 'Mi piacciono i panini', 'Mi piace i panini'], ['“I like coffee”', 'Mi piace il caffè', 'Mi piacciono il caffè']],
  ),
  REFLEXIVE_EXAMPLES: V('svegliarsi=to wake up; alzarsi=to get up', ['Mi sveglio alle sette means “I wake up at seven”, and Mi alzo presto means “I get up early”.']),
  REFLEXIVE_EXAMPLES__2: V('lavarsi=to wash (oneself); vestirsi=to get dressed', ['Mi lavo means “I wash”, and Mi vesto means “I get dressed”.']),
  REFLEXIVE_EXAMPLES__3: V('chiamarsi=to be called', ['Mi chiamo Marco literally means “I call myself Marco”. Come ti chiami? means “What are you called?”.']),
  PASSATO_PROSSIMO: R(
    ['The passato prossimo is a helper verb (avere or essere) in the present plus the past participle: Ho mangiato, Sono andato.', 'Use it for actions that happened and are finished.'],
    [['Which is a passato prossimo?', 'Ho mangiato', 'Mangio']],
  ),
  ESSERE_AGREEMENT: R(
    ['When the helper is essere, the past participle matches the subject: Marco è andato, Giulia è andata, Marco e Luca sono andati, Giulia e Anna sono andate.'],
    [['Giulia went: Giulia è ___', 'andata', 'andato']],
  ),
  REFLEXIVE_PASSATO: R(
    ['Reflexive verbs always use essere in the passato prossimo, and the participle matches the subject: Mi sono alzato (a man) or Mi sono alzata (a woman) means “I got up”.', 'Giulia si è lavata means “Giulia washed”.'],
    [['A woman says “I got up”', 'Mi sono alzata', 'Ho alzata'], ['Which helper do reflexive verbs use?', 'essere', 'avere']],
  ),
  MODAL_INFINITIVE: R(
    ['Potere (can) and volere (want) are followed by an infinitive: Posso venire means “I can come”, and Voglio mangiare means “I want to eat”.'],
    [['“I can come”', 'Posso venire', 'Posso vengo']],
  ),
  MODAL_INFINITIVE__2: R(
    ['Dovere (must) is followed by an infinitive too: Devo studiare means “I must study”.'],
    [['“I must study”', 'Devo studiare', 'Devo studio']],
  ),
  PRONOUN_MODAL_PLACEMENT: R(
    ['With a modal verb and an infinitive, the object pronoun has two correct places: before the modal verb, or attached to the end of the infinitive.', 'Lo voglio comprare and Voglio comprarlo both mean “I want to buy it”. When the pronoun attaches, the infinitive drops its final -e: comprare becomes comprarlo.'],
    [['Which means “I want to buy it”?', 'Voglio comprarlo', 'Voglio lo comprare'], ['Another way to say “I can see it”', 'Lo posso vedere', 'Posso lo vedere']],
  ),
};
