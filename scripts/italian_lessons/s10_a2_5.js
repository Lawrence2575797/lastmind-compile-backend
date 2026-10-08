'use strict';
const { V, R } = require('./helpers');

// A2.5 Body, directions, travel, invitations and plans
module.exports = {
  BODY_PARTS: V('la testa=the head; lo stomaco=the stomach'),
  BODY_PARTS__2: V('la gola=the throat; la schiena=the back'),
  BODY_PARTS__3: V('il braccio=the arm; la gamba=the leg'),
  BODY_PARTS__4: V('la mano=the hand; il piede=the foot', ['La mano is feminine even though it ends in -o.']),
  DIR_1: V('sempre dritto=straight on; a destra=to the right'),
  DIR_1__2: V('a sinistra=to the left'),
  DIR_2: V('all’angolo=at the corner; di fronte a=opposite'),
  DIR_2__2: V('vicino a=near'),
  TRAVEL_1: V('il treno=the train; l’aereo=the plane'),
  TRAVEL_1__2: V('la stazione=the station'),
  TRAVEL_2: V('il biglietto=the ticket; la prenotazione=the booking'),
  Q_DOVE: R(
    ['Dov’è...? asks where one thing is: Dov’è la stazione? means “Where is the station?”.', 'Dov’è is dove (where) and è (is) joined together.'],
    [['“Where is the station?”', 'Dov’è la stazione?', 'Dove la stazione?']],
    { say: [['How do you ask “Where is the station?”', 'Dov’è la stazione']] },
  ),
  VERB_CONJ_KNOWLEDGE: R(
    ['Regular verbs follow the endings for their group, and the common irregular verbs (essere, avere, fare, andare, potere, volere, dovere) have to be learned one by one.', 'Io parlo, tu parli, lui parla; io vado, tu vai, lui va.'],
    [['“I go”', 'vado', 'vo'], ['“He speaks”', 'parla', 'parli']],
  ),
  TU_LEI_DISTINCTION: R(
    ['Tu is informal and used with one friend; Lei is formal and used with one stranger or an older person.', 'This matters for commands too: you will use different forms for tu and Lei.'],
    [['You are speaking to a shop assistant you do not know. Which one do you use?', 'Lei', 'tu'], ['You are speaking to your friend. Which one do you use?', 'tu', 'Lei']],
  ),
  IMP_TU: R(
    ['To tell one friend what to do, use the imperative. For an -are verb the tu form ends in -a: gira means “turn”. For -ere and -ire verbs it ends in -i: prendi means “take”.', 'Gira a destra means “Turn right”, and Prendi il treno means “Take the train”.'],
    [['“Turn right” (to a friend)', 'Gira a destra', 'Giri a destra'], ['“Take the train” (to a friend)', 'Prendi il treno', 'Prenda il treno']],
  ),
  IMP_LEI: R(
    ['For a formal command, use the Lei form. For -are verbs it ends in -i: Giri a destra means “Turn right”. For -ere verbs it ends in -a: Prenda il treno means “Take the train”.', 'Continui means “Continue”.'],
    [['“Turn right” (to a stranger)', 'Giri a destra', 'Gira a destra'], ['“Take the train” (to a stranger)', 'Prenda il treno', 'Prendi il treno']],
  ),
  INFINITIVE_KNOWLEDGE: R(
    ['The infinitive is the “to ___” form of a verb: andare (to go), prendere (to take), venire (to come).', 'After vuoi, vorresti and ti va di, the next verb stays in the infinitive.'],
    [['Which is an infinitive?', 'andare', 'vado']],
  ),
  VUOI_VORRESTI: R(
    ['To invite somebody, use vuoi followed by an infinitive: Vuoi venire? means “Do you want to come?”.', 'Vorresti is the politer version: Vorresti mangiare con me? means “Would you like to eat with me?”.'],
    [['“Do you want to come?”', 'Vuoi venire?', 'Vuoi vieni?']],
    { say: [['How do you ask a friend “Do you want to come?”', 'Vuoi venire']] },
  ),
  TI_VA_DI: R(
    ['Ti va di ... ? is a friendly way to invite: Ti va di mangiare una pizza? means “Do you feel like eating a pizza?”.', 'Di is followed by the infinitive.'],
    [['“Do you feel like going out?”', 'Ti va di uscire?', 'Ti va uscire?']],
  ),
  ANDIAMO_A: R(
    ['To suggest a plan, use andiamo a and a place or an activity: Andiamo a Roma means “Let’s go to Rome”.', 'Andiamo is the noi form of andare, used here for “let’s go”.'],
    [['“Let’s go to Rome”', 'Andiamo a Roma', 'Andiamo Roma']],
    { say: [['How do you say “Let’s go to Rome”?', 'Andiamo a Roma']] },
  ),
  RESPOND_SUGGESTION: V('va bene=OK / that works; mi dispiace, ma=I’m sorry, but', ['To accept a plan, say Va bene. To refuse politely, say Mi dispiace, ma non posso, which means “I’m sorry, but I can’t”.']),
  MAKE_RESPOND_PLANS: R(
    ['A short exchange of plans: Ti va di andare al cinema? Va bene! Or: Mi dispiace, ma non posso.', 'First an invitation, then either an acceptance (Va bene) or a polite refusal (Mi dispiace, ma non posso).'],
    [['Which one accepts the invitation?', 'Va bene', 'Mi dispiace, ma non posso'], ['Which one politely refuses?', 'Mi dispiace, ma non posso', 'Va bene']],
  ),
  PREP_1: V('a=to / at (a town); in=in / to (a country)', ['Vado a Roma means “I am going to Rome”, and Vado in Italia means “I am going to Italy”.']),
  PREP_1__2: V('da=from / to somebody’s place', ['Vengo da Roma means “I come from Rome”, and Vado da Marco means “I am going to Marco’s”.']),
  PREP_2: V('per=for / towards; su=on', ['Un treno per Roma means “a train for Rome”, and Il libro è su un tavolo means “The book is on a table”.']),
  PREP_2__2: V('con=with', ['Vado con Marco means “I am going with Marco”.']),
  Q_COME: R(
    ['To ask how to get somewhere, say Come arrivo a ...? Come arrivo alla stazione? means “How do I get to the station?”.', 'Come is “how” and arrivo is “I arrive”.'],
    [['“How do I get to the station?”', 'Come arrivo alla stazione?', 'Dove arrivo alla stazione?']],
  ),
  GIVE_DIRECTIONS: R(
    ['Directions are commands plus direction words: Vai sempre dritto, poi gira a destra means “Go straight on, then turn right”.', 'Formally you would say: Vada sempre dritto, poi giri a destra.'],
    [['Which tells a friend to turn left?', 'Gira a sinistra', 'Girare a sinistra'], ['“Straight on” is...', 'sempre dritto', 'a destra']],
  ),
  PREP_TRANSPORT_USE: R(
    ['For means of transport, use in: in treno (by train), in aereo (by plane), in macchina (by car).', 'On foot is a piedi.'],
    [['“By train”', 'in treno', 'con treno'], ['“On foot”', 'a piedi', 'in piedi']],
  ),
  HEALTH_EXPR: V('mi fa male=it hurts me; ho mal di testa=I have a headache', ['Mi fa male la testa also means “My head hurts”.']),
  HEALTH_EXPR__2: V('ho mal di stomaco=I have a stomach ache'),
  STO_BENE_MALE: V('sto bene=I am well; sto male=I am not well', ['Stare is used for how you are. Come stai? means “How are you?”.']),
  FUTURE_TIME_EXPR: V('domani=tomorrow; la prossima settimana=next week'),
  FUTURE_TIME_EXPR__2: V('tra due giorni=in two days', ['Tra means “in” when you say how long until something happens.']),
  STATE_FUTURE_PLANS: R(
    ['To talk about plans, put a time expression in front: Domani vado a Roma means “Tomorrow I am going to Rome”, and La prossima settimana vado in Italia means “Next week I am going to Italy”.', 'Italian often uses the present tense for plans that are already arranged.'],
    [['“Tomorrow I am going to Rome”', 'Domani vado a Roma', 'Vado domani a Roma ieri']],
  ),
};
