'use strict';
const { V, R } = require('./helpers');

// A1.3 Nouns, adjectives and articles; A1.4 Present tense of avere, essere and regular verbs
module.exports = {
  noun_o_masc: R(
    ['Most Italian nouns that end in -o are masculine: libro means “book” and ragazzo means “boy”.', 'So the ending -o is a good clue that a noun is masculine.'],
    [['Is libro (book) masculine or feminine?', 'masculine', 'feminine'], ['Which ending usually shows a masculine noun?', '-o', '-a']],
    { say: [['How do you say “book”?', 'libro']] },
  ),
  noun_a_fem: R(
    ['Most Italian nouns that end in -a are feminine: casa means “house” and ragazza means “girl”.', 'So the ending -a is a good clue that a noun is feminine.'],
    [['Is casa (house) masculine or feminine?', 'feminine', 'masculine'], ['Which ending usually shows a feminine noun?', '-a', '-o']],
    { say: [['How do you say “house”?', 'casa']] },
  ),
  noun_e_either: R(
    ['Nouns that end in -e can be masculine or feminine, and the ending does not tell you which.', 'Il nome (name) is masculine; la notte (night) is feminine. Learn the article together with the noun.'],
    [['Is notte (night) masculine or feminine?', 'feminine', 'masculine'], ['Is nome (name) masculine or feminine?', 'masculine', 'feminine']],
  ),
  plural_o_i: R(
    ['To make a masculine noun plural, -o becomes -i: libro becomes libri, and ragazzo becomes ragazzi.'],
    [['What is the plural of libro?', 'libri', 'libre'], ['What is the plural of ragazzo?', 'ragazzi', 'ragazze']],
    { say: [['How do you say “books”?', 'libri']] },
  ),
  plural_a_e: R(
    ['To make a feminine noun plural, -a becomes -e: casa becomes case, and ragazza becomes ragazze.'],
    [['What is the plural of casa?', 'case', 'casi'], ['What is the plural of ragazza?', 'ragazze', 'ragazzi']],
    { say: [['How do you say “houses”?', 'case']] },
  ),
  plural_e_i: R(
    ['Nouns that end in -e make the plural with -i, whether they are masculine or feminine: nome becomes nomi, and notte becomes notti.'],
    [['What is the plural of notte?', 'notti', 'notte'], ['What is the plural of nome?', 'nomi', 'nome']],
  ),
  adj_agreement_number: R(
    ['An adjective changes with the number of its noun: un libro rosso is “a red book”, but due libri rossi is “two red books”.', 'Rosso means “red”.'],
    [['Two red books: due libri ___', 'rossi', 'rosso'], ['One red book: un libro ___', 'rosso', 'rossi']],
  ),
  plural_irregular: R(
    ['A few nouns do not change in the plural. Words ending in an accented vowel stay the same: la città (the city) is le città in the plural.', 'Short words like foto (photo) also stay the same: le foto.'],
    [['What is the plural of città?', 'città', 'citte'], ['What is the plural of foto?', 'foto', 'fote']],
  ),
  plural_irregular__2: R(
    ['Il re means “the king” and the plural is i re, “the kings”: the noun does not change.', 'Words that end in a stressed vowel, and a few short words like re, stay the same in the plural.'],
    [['What is the plural of re (king)?', 're', 'ri']],
  ),
  indef_art_forms: R(
    ['“A” or “an” before a masculine noun is un: un libro, un amico.', 'Before masculine nouns that start with z, with s + another consonant, or with gn or ps, use uno: uno zaino (a backpack), uno studente (a student).'],
    [['Which is correct for “a student”?', 'uno studente', 'un studente'], ['Which is correct for “a book”?', 'un libro', 'uno libro']],
  ),
  indef_art_forms__2: R(
    ['“A” or “an” before a feminine noun is una: una casa, una ragazza.', 'Before a feminine noun that starts with a vowel, una shortens to un’: un’amica (a female friend).'],
    [['Which is correct for “a female friend”?', 'un’amica', 'una amica'], ['Which is correct for “a house”?', 'una casa', 'un casa']],
  ),
  adj_agreement_gender: R(
    ['An adjective also matches the gender of its noun: un libro rosso (masculine) but una casa rossa (feminine).', 'The -o ending is masculine and the -a ending is feminine, just as with nouns.'],
    [['A red house: una casa ___', 'rossa', 'rosso'], ['A red book: un libro ___', 'rosso', 'rossa']],
  ),
  adj_e_ending: R(
    ['Adjectives that end in -e use the same form for masculine and feminine: verde means “green”, so un libro verde and una casa verde.', 'Only the number changes: the plural is verdi.'],
    [['Green houses: due case ___', 'verdi', 'verde'], ['A green house: una casa ___', 'verde', 'verda']],
  ),
  adj_position_default: R(
    ['Italian adjectives normally come after the noun: una macchina rossa is “a red car”, and un libro interessante is “an interesting book”.'],
    [['Which is the normal word order for “a red car”?', 'una macchina rossa', 'una rossa macchina']],
  ),
  adj_position_exceptions: V('bello=beautiful; buono=good', ['These two commonly come before the noun: una bella casa is “a beautiful house” and un buon libro is “a good book”.']),
  adj_position_exceptions__2: V('grande=big; giovane=young', ['These also commonly come before the noun: una grande città is “a big city”.']),
  DEFART_SG: R(
    ['“The” before a masculine singular noun is il: il libro, il ragazzo.', 'Before masculine nouns that start with z, with s + another consonant, or with gn or ps, use lo: lo zaino (the backpack), lo studente (the student).'],
    [['Which is correct for “the student”?', 'lo studente', 'il studente'], ['Which is correct for “the book”?', 'il libro', 'lo libro']],
  ),
  DEFART_SG__2: R(
    ['“The” before a feminine singular noun is la: la casa, la ragazza.', 'Before any singular noun that starts with a vowel, use l’ for “the”: l’amica (the female friend), l’amico (the male friend).'],
    [['Which is correct for “the house”?', 'la casa', 'il casa'], ['Which is correct for “the male friend”?', 'l’amico', 'la amico']],
  ),
  DEFART_PL: R(
    ['The plural of il is i: i libri (the books).', 'The plural of lo (and of masculine l’) is gli: gli zaini (the backpacks), gli amici (the friends).'],
    [['What is the plural of il libro?', 'i libri', 'gli libri'], ['What is the plural of lo studente?', 'gli studenti', 'i studenti']],
  ),
  DEFART_PL__2: R(
    ['The plural of la is le: le case (the houses), le ragazze (the girls).', 'Le is used for every feminine plural noun, including the ones that begin with a vowel: le amiche.'],
    [['What is the plural of la casa?', 'le case', 'i case'], ['What is the plural of l’amica?', 'le amiche', 'gli amiche']],
  ),
  INITSND_1: R(
    ['Some beginning sounds change the article. A masculine noun starting with s + a consonant takes lo: lo studente, lo sport.', 'A noun starting with a vowel takes l’: l’amico.'],
    [['Which is correct for “the sport”?', 'lo sport', 'il sport'], ['Which is correct for “the friend” (m.)?', 'l’amico', 'il amico']],
  ),
  INITSND_1__2: R(
    ['A masculine noun that starts with z takes lo: lo zaino (the backpack), lo zio (the uncle).', 'Its plural takes gli: gli zaini, gli zii.'],
    [['Which is correct for “the uncle”?', 'lo zio', 'il zio'], ['What is the plural of lo zaino?', 'gli zaini', 'i zaini']],
  ),
  INITSND_2: R(
    ['A masculine noun starting with gn or x also takes lo: lo gnocco (the dumpling), lo xilofono (the xylophone).'],
    [['Which is correct for “the dumpling” (gnocco)?', 'lo gnocco', 'il gnocco']],
  ),
  INITSND_2__2: R(
    ['A masculine noun starting with y or ps takes lo too: lo yogurt (the yoghurt), lo psicologo (the psychologist).'],
    [['Which is correct for “the psychologist” (psicologo)?', 'lo psicologo', 'il psicologo'], ['Which is correct for “the yoghurt”?', 'lo yogurt', 'il yogurt']],
  ),
  def_art_selection: R(
    ['To pick “the”, check the gender and the first sound of the noun.', 'Masculine: il before most consonants, lo before z, s + consonant, gn, ps, l’ before a vowel. Feminine: la, or l’ before a vowel.', 'Plural: i (for il), gli (for lo and masculine l’), le (for all feminine).'],
    [['“The girls”', 'le ragazze', 'i ragazze'], ['“The student” (m.)', 'lo studente', 'il studente'], ['“The books”', 'i libri', 'gli libri']],
  ),
  indef_art_selection: R(
    ['To pick “a”, check the gender and the first sound of the noun.', 'Masculine: un before most sounds, uno before z, s + consonant, gn, ps. Feminine: una, or un’ before a vowel.'],
    [['“A house”', 'una casa', 'un casa'], ['“A student” (m.)', 'uno studente', 'un studente'], ['“A female friend”', 'un’amica', 'una amica']],
  ),

  PRON_SG: V('io=I; tu=you (one friend)'),
  PRON_SG__2: V('lui=he; lei=she'),
  PRON_PL: V('noi=we; voi=you (more than one person)'),
  PRON_PL__2: V('loro=they'),
  VERB_ENDINGS_CONCEPT: R(
    ['Every Italian verb has an infinitive that ends in -are, -ere or -ire: parlare (to speak), prendere (to take), dormire (to sleep).', 'Remove the ending to get the stem: parl-, prend-, dorm-. You add different endings to the stem to say who is doing the action.'],
    [['What is the stem of parlare?', 'parl-', 'parlar-'], ['Which of these is an -ere verb?', 'prendere', 'dormire']],
  ),
  AVERE_SG: V('ho=I have; hai=you have', ['Avere means “to have”.']),
  AVERE_SG__2: V('ha=he / she has'),
  AVERE_PL: V('abbiamo=we have; avete=you (more than one person) have'),
  AVERE_PL__2: V('hanno=they have'),
  ARE_CONJ: V('parlo=I speak; parli=you speak', ['Take the stem parl- from parlare and add -o for io, or -i for tu.']),
  ARE_CONJ__2: V('parla=he / she speaks; parliamo=we speak', ['Add -a for lui/lei and -iamo for noi.']),
  ARE_CONJ__3: V('parlate=you (more than one person) speak; parlano=they speak', ['Add -ate for voi and -ano for loro.']),
  ERE_CONJ: V('prendo=I take; prendi=you take', ['Take the stem prend- from prendere and add -o for io, or -i for tu.']),
  ERE_CONJ__2: V('prende=he / she takes; prendiamo=we take', ['Add -e for lui/lei and -iamo for noi.']),
  ERE_CONJ__3: V('prendete=you (more than one person) take; prendono=they take', ['Add -ete for voi and -ono for loro.']),
  IRE_NORMAL_CONJ: V('dormo=I sleep; dormi=you sleep', ['Take the stem dorm- from dormire and add -o for io, or -i for tu.']),
  IRE_NORMAL_CONJ__2: V('dorme=he / she sleeps; dormiamo=we sleep', ['Add -e for lui/lei and -iamo for noi.']),
  IRE_NORMAL_CONJ__3: V('dormite=you (more than one person) sleep; dormono=they sleep', ['Add -ite for voi and -ono for loro.']),
  IRE_ISC_CONJ: V('capisco=I understand; capisci=you understand', ['Many -ire verbs, like capire, add -isc- between the stem and the ending for io, tu, lui/lei and loro.']),
  IRE_ISC_CONJ__2: V('capisce=he / she understands; capiamo=we understand', ['Capiamo (noi) has no -isc-.']),
  IRE_ISC_CONJ__3: V('capite=you (more than one person) understand; capiscono=they understand', ['Capite (voi) has no -isc-, but capiscono (loro) does.']),
  ESSERE_SG: V('sono=I am; sei=you are', ['Essere means “to be”. Sono means “I am” here, and it also means “they are” (see below).']),
  ESSERE_SG__2: V('è=is (he / she / it)', ['Written with an accent, è means “is”. Without the accent, e means “and”.']),
  ESSERE_PL: V('siamo=we are; siete=you (more than one person) are'),
  ESSERE_PL__2: V('sono=they are', ['Sono looks the same for “I am” and “they are”. The sentence shows which one is meant.']),
  NEGATION_NON: R(
    ['To make a sentence negative, put non before the verb: Io sono italiano becomes Io non sono italiano, “I am not Italian”.', 'Non does not change, and it always sits right before the conjugated verb.'],
    [['Which means “I am not Italian”?', 'Io non sono italiano', 'Io sono non italiano']],
  ),
  AVERE_EXPR_1: V('avere fame=to be hungry; avere sete=to be thirsty', ['Italian says “to have hunger” and “to have thirst”. Ho fame means “I am hungry”, and Ho sete means “I am thirsty”.'], { say: [['How do you say “I am hungry”?', 'Ho fame'], ['How do you say “I am thirsty”?', 'Ho sete']] }),
  AVERE_EXPR_1__2: V('avere freddo=to be cold; avere caldo=to be hot', ['For how you feel, Italian uses avere: Ho freddo means “I am cold” and Ho caldo means “I am hot”.'], { say: [['How do you say “I am cold”?', 'Ho freddo'], ['How do you say “I am hot”?', 'Ho caldo']] }),
  ESSERE_IDENTITY: R(
    ['Use essere to say who somebody is: Sono Marco means “I am Marco”.', 'Chi sei? means “Who are you?” and Chi è? means “Who is he / she?”.'],
    [['How do you say “I am Marco”?', 'Sono Marco', 'Ho Marco']],
    { say: [['How do you say “I am Marco”?', 'Sono Marco']] },
  ),
  ESSERE_NATIONALITY: R(
    ['Use essere with a nationality: Io sono italiano means “I am Italian”.', 'The nationality changes with the person: italiano for a man, italiana for a woman.'],
    [['A woman says “I am Italian”. Which is correct?', 'Sono italiana', 'Sono italiano']],
  ),
  ESSERE_CHARACTERISTICS: R(
    ['Use essere to describe what somebody or something is like: È simpatico means “He is nice”.', 'The adjective matches the person: simpatico for a man, simpatica for a woman.'],
    [['Describe a woman as nice: Lei è ___', 'simpatica', 'simpatico']],
  ),
  ESSERE_LOCATION: R(
    ['Use essere to say where somebody is: Sono a Roma means “I am in Rome”, and Sono in Italia means “I am in Italy”.', 'Use a for a town and in for a country.'],
    [['Which is correct: “I am in Rome”?', 'Sono a Roma', 'Sono in Roma'], ['Which is correct: “I am in Italy”?', 'Sono in Italia', 'Sono a Italia']],
  ),
  AVERE_POSSESSION: R(
    ['Use avere to say what somebody has: Ho un libro means “I have a book”.', 'Ha una casa means “He / she has a house”.'],
    [['How do you say “I have a book”?', 'Ho un libro', 'Sono un libro']],
    { say: [['How do you say “I have a book”?', 'Ho un libro']] },
  ),
  AVERE_AGE: R(
    ['Italian uses avere for age: Ho venti anni means “I am twenty years old”.', 'Literally it says “I have twenty years”.'],
    [['Which is correct: “I am twenty years old”?', 'Ho venti anni', 'Sono venti anni']],
  ),
  AVERE_EXPR_2: V('avere paura=to be afraid; avere ragione=to be right', ['Ho paura means “I am afraid” and Hai ragione means “You are right”.']),
  AVERE_EXPR_2__2: V('avere torto=to be wrong; avere bisogno di=to need', ['Hai torto means “You are wrong”.', 'Ho bisogno di followed by a noun means “I need”: Ho bisogno di un caffè.']),
};
