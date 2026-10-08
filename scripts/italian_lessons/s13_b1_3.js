'use strict';
const { V, R } = require('./helpers');

// B1.3 Relative clauses
module.exports = {
  MAIN_CLAUSE_SUBORD: R(
    ['A sentence can have a main clause and a subordinate clause joined by a linking word: Mangio perché ho fame means “I eat because I am hungry”.', 'Mangio is the main clause. Perché ho fame depends on it, and perché is the link.'],
    [['In “Mangio perché ho fame”, which word links the two clauses?', 'perché', 'mangio'], ['Which part could not stand alone as a sentence?', 'perché ho fame', 'Mangio']],
  ),
  GENDER_NUMBER_AGREEMENT: R(
    ['Adjectives and pronouns agree with the noun they refer to, in gender and number: il libro interessante, la casa grande, i libri nuovi, le case nuove.', 'This will matter for il quale, la quale, i quali and le quali.'],
    [['“The new houses”', 'le case nuove', 'le case nuovi']],
  ),
  ANTECEDENT_CONCEPT: R(
    ['The antecedent is the noun that a pronoun refers back to. In Il libro che leggo è bello, the antecedent of che is il libro.', 'The relative pronoun stands for it and links the clause to it.'],
    [['In “La ragazza che parla è mia sorella”, what is the antecedent of che?', 'la ragazza', 'mia sorella']],
  ),
  PREPOSITIONS_BASIC: V('a=to / at; di=of / from', ['A is used for a person or a town; di links two nouns: il libro di Marco means “Marco’s book”.']),
  PREPOSITIONS_BASIC__2: V('con=with; per=for', ['Con Marco means “with Marco”, and per Marco means “for Marco”.']),
  CUI_RELATIVE: R(
    ['After a preposition, use cui, which does not change: la ragazza a cui scrivo means “the girl to whom I write”.', 'Di cui means “of whom / of which”: il libro di cui parlo means “the book that I am talking about”.'],
    [['“The girl to whom I write”', 'la ragazza a cui scrivo', 'la ragazza che a scrivo'], ['“The book I am talking about”', 'il libro di cui parlo', 'il libro che parlo']],
  ),
  CUI_RELATIVE__2: R(
    ['Con cui means “with whom / with which”: l’amico con cui esco means “the friend I go out with”.', 'Per cui means “for whom / for which”, and also “so, for that reason”.'],
    [['“The friend I go out with”', 'l’amico con cui esco', 'l’amico che con esco']],
  ),
  IL_QUALE_RELATIVE: R(
    ['Il quale is a formal alternative to che or cui. It agrees with the noun: il quale (masculine), la quale (feminine).', 'La sorella di Marco, la quale abita a Roma, è medico means “Marco’s sister, who lives in Rome, is a doctor”.'],
    [['Which form fits a feminine singular noun?', 'la quale', 'il quale']],
  ),
  IL_QUALE_RELATIVE__2: R(
    ['The plural forms are i quali (masculine) and le quali (feminine): Gli amici, i quali abitano a Roma, sono simpatici.'],
    [['Which form fits a feminine plural noun?', 'le quali', 'i quali']],
  ),
  IL_QUALE_DISAMBIG: R(
    ['Il quale helps when it would otherwise be unclear which noun is meant. In La sorella di Marco, la quale abita a Roma, la quale is feminine, so it refers to the sister and not to Marco.'],
    [['In “Il fratello di Anna, il quale abita a Roma”, who lives in Rome?', 'the brother', 'Anna']],
  ),
  CHI_RELATIVE: R(
    ['Chi means “the person who” or “whoever”: Chi studia impara means “Whoever studies learns”.', 'It stands for a person in general, and it is followed by a singular verb.'],
    [['“Whoever studies learns”', 'Chi studia impara', 'Che studia impara']],
  ),
  SUBJ_OBJ_DISTINCTION: R(
    ['The subject does the action and the object receives it: in Marco vede Luca, Marco is the subject and Luca is the direct object.', 'The pronoun che can stand for either: l’uomo che vede Luca (che is the subject), l’uomo che Luca vede (che is the object).'],
    [['In “Marco vede Luca”, which is the direct object?', 'Luca', 'Marco']],
  ),
  CHE_RELATIVE: R(
    ['Che is the most common relative pronoun. It is “who”, “which” or “that”, for people and things, as subject or direct object, and it never follows a preposition.', 'Il libro che leggo è bello, and La ragazza che parla è mia sorella.'],
    [['“The book that I read”', 'il libro che leggo', 'il libro che di leggo'], ['“The girl who speaks”', 'la ragazza che parla', 'la ragazza cui parla']],
  ),
  AVOID_NOUN_RESTATEMENT: R(
    ['Do not say the noun again after the relative pronoun. The pronoun already stands for it.', 'Say Il libro che leggo è bello, not “Il libro che leggo il libro è bello”.'],
    [['Which is correct?', 'Il libro che leggo è bello', 'Il libro che leggo il libro è bello']],
  ),
  FORMING_COMPLEX_SENTENCES: R(
    ['A relative pronoun joins two short sentences into one: Ho un amico. Lui vive a Roma becomes Ho un amico che vive a Roma, “I have a friend who lives in Rome”.'],
    [['Join: “Ho un libro. Il libro è nuovo.”', 'Ho un libro che è nuovo', 'Ho un libro il libro è nuovo']],
  ),
  RESTRICTIVE_CLAUSE: R(
    ['A restrictive clause gives essential information and has no commas: Gli studenti che studiano passano means “The students who study pass”, so only the students who study pass.'],
    [['Which has no commas?', 'Gli studenti che studiano passano', 'Gli studenti, che studiano, passano']],
  ),
  NONRESTRICTIVE_CLAUSE: R(
    ['A non-restrictive clause adds extra information, separated by commas: Gli studenti, che studiano, passano means “The students, who study, pass”, so all of them study.'],
    [['Which adds extra information about all the students?', 'Gli studenti, che studiano, passano', 'Gli studenti che studiano passano']],
  ),
  RESTRICTIVE_VS_NON: R(
    ['No commas: the clause identifies which ones (only those who study). With commas: the clause only adds a detail (all of them study).', 'The commas change the meaning.'],
    [['Which means only some students pass?', 'Gli studenti che studiano passano', 'Gli studenti, che studiano, passano']],
  ),
};
