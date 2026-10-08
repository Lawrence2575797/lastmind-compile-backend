'use strict';
const { V, R } = require('./helpers');

// A2.4 Future tense, comparatives and superlatives
module.exports = {
  verb_infinitive_conj: R(
    ['Italian verbs fall into three groups by their infinitive: -are (parlare), -ere (prendere) and -ire (dormire).', 'Take away the ending to find the stem: parl-, prend-, dorm-. The endings you add to the stem change with the tense.'],
    [['What is the stem of prendere?', 'prend-', 'prende-'], ['Which group does dormire belong to?', '-ire', '-ere']],
  ),
  FUT_END_SG: V('parlerò=I will speak; parlerai=you will speak', ['For the future, take the infinitive, drop the final -e (and change -are to -er-), then add -ò or -ai.']),
  FUT_END_SG__2: V('parlerà=he / she will speak', ['Add -à for lui/lei.']),
  FUT_END_PL: V('parleremo=we will speak; parlerete=you (more than one person) will speak', ['Add -emo for noi and -ete for voi.']),
  FUT_END_PL__2: V('parleranno=they will speak', ['Add -anno for loro.']),
  adj_base: R(
    ['An adjective agrees with its noun in gender and number: un ragazzo alto, una ragazza alta, due ragazzi alti, due ragazze alte.', 'You need this base form before you can compare things: più alto, meno alto.'],
    [['“A tall girl”', 'una ragazza alta', 'una ragazza alto']],
  ),
  comp_maggioranza: R(
    ['To say “more than”, use più: Marco è più alto di Luca means “Marco is taller than Luca”.', 'Più means “more”, and di means “than” when you compare two people or things.'],
    [['“Marco is taller than Luca”', 'Marco è più alto di Luca', 'Marco è più alto da Luca']],
    { say: [['What is the word for “more”, as in “more tall”?', 'più']] },
  ),
  comp_minoranza: R(
    ['To say “less than”, use meno: Luca è meno alto di Marco means “Luca is less tall than Marco”.', 'Meno means “less”, and di means “than”.'],
    [['“Luca is less tall than Marco”', 'Luca è meno alto di Marco', 'Luca è meno alto più Marco']],
    { say: [['What is the word for “less”?', 'meno']] },
  ),
  comp_uguaglianza: R(
    ['To say two things are equal, use così ... come or tanto ... quanto: Marco è così alto come Luca means “Marco is as tall as Luca”.', 'Così is often left out: Marco è alto come Luca.'],
    [['“Marco is as tall as Luca”', 'Marco è alto come Luca', 'Marco è alto più Luca']],
  ),
  irr_comp_migliore_peggiore: V('migliore=better; peggiore=worse', ['Migliore is the comparative of buono (good), and peggiore is the comparative of cattivo (bad). Questo libro è migliore means “This book is better”.']),
  irr_comp_maggiore_minore: V('maggiore=bigger / older; minore=smaller / younger', ['Mio fratello maggiore means “my older brother”, and mia sorella minore means “my younger sister”.']),
  abs_superlative_issimo: R(
    ['To say “very” strongly, drop the last vowel of the adjective and add -issimo or -issima: bello becomes bellissimo (masculine) and bellissima (feminine).', 'Bellissimo means “very beautiful”.'],
    [['“Very beautiful” (a house, feminine)', 'bellissima', 'bellissimo']],
    { say: [['How do you say “very beautiful” for a masculine thing?', 'bellissimo']] },
  ),
  abs_superlative_issimo__2: R(
    ['The plural forms are -issimi (masculine) and -issime (feminine): bellissimi and bellissime.', 'I libri sono bellissimi means “The books are very beautiful”.'],
    [['“Very beautiful” (houses, feminine plural)', 'bellissime', 'bellissimi']],
  ),
  abs_superlative_molto: R(
    ['The other way to say “very” is molto before the adjective: molto bello means “very beautiful”.', 'Molto does not change here: molto bello, molto bella, molto belli. Molto alto means “very tall”.'],
    [['“Very tall”', 'molto alto', 'alto molto']],
    { say: [['How do you say “very tall”?', 'molto alto']] },
  ),
  future_endings_ire: V('dormirò=I will sleep; dormirai=you will sleep', ['For -ire verbs the future keeps the i: dormire becomes dormir- and then the endings -ò, -ai, -à, -emo, -ete, -anno.']),
  FUT_STEM_1: V('sarò=I will be; avrò=I will have', ['These are irregular: essere becomes sar- and avere becomes avr-. The endings are the usual future endings.']),
  FUT_STEM_1__2: V('andrò=I will go; farò=I will do / make', ['Andare becomes andr- and fare becomes far-.']),
  FUT_STEM_2: V('potrò=I will be able to; dovrò=I will have to', ['Potere becomes potr- and dovere becomes dovr-.']),
  FUT_STEM_2__2: V('vorrò=I will want; verrò=I will come', ['Volere becomes vorr- and venire becomes verr-.']),
  future_prediction_planning: R(
    ['The future tense talks about plans and predictions: Domani andrò a Roma means “Tomorrow I will go to Rome”, and Domani pioverà means “Tomorrow it will rain”.'],
    [['“Tomorrow I will go to Rome”', 'Domani andrò a Roma', 'Domani vado a Roma']],
  ),
  future_probability: R(
    ['Italian also uses the future for a guess about the present: Sarà a casa means “He is probably at home”, and Avrà trent’anni means “He must be about thirty”.', 'It is not about the future. It means “probably”.'],
    [['Sarà a casa means...', 'He is probably at home', 'He will be at home tomorrow']],
  ),
  di_che_rule: R(
    ['Use di before a noun or pronoun that you compare with: Marco è più alto di Luca.', 'Use che when you compare two adjectives or two verbs: Marco è più simpatico che intelligente (more nice than clever).'],
    [['“Marco is taller than Luca”', 'più alto di Luca', 'più alto che Luca'], ['“more nice than clever”', 'più simpatico che intelligente', 'più simpatico di intelligente']],
  ),
  rel_superlative: R(
    ['To say “the most” or “the -est”, use the article + più + adjective: Marco è il più alto della classe means “Marco is the tallest in the class”.', 'Use di (in its combined form, della) for “in” or “of” the group.'],
    [['“the tallest in the class”', 'il più alto della classe', 'il più alto che la classe']],
  ),
};
