'use strict';
const { V, R } = require('./helpers');

// A1.6 Food, shopping and prices
module.exports = {
  FOOD_VOCAB: V('un caffè=a coffee; un cappuccino=a cappuccino', ['Un is the word for “a” in front of a masculine noun.']),
  FOOD_VOCAB__2: V('un panino=a sandwich; l’acqua=the water'),
  SHOPPING_VOCAB: V('il panificio=the bakery; la macelleria=the butcher’s'),
  SHOPPING_VOCAB__2: V('la farmacia=the pharmacy; il supermercato=the supermarket'),
  NUMBERS_CARDINAL: R(
    ['You can use the numbers you already know for quantities and prices. The number goes before the noun: due caffè means “two coffees”, and tre panini means “three sandwiches”.', 'Caffè does not change in the plural, because it ends in an accented vowel.'],
    [['“Two coffees”', 'due caffè', 'caffè due'], ['“Three sandwiches”', 'tre panini', 'panini tre']],
  ),
  CURRENCY_VOCAB: V('euro=euro; centesimi=cents', ['A euro is made of 100 centesimi. Euro stays the same in the plural: due euro.']),
  ORDINAL_NUMBERS: V('primo=first; secondo=second', ['Ordinal numbers match their noun: primo and secondo are masculine, prima and seconda are feminine.']),
  ORDINAL_NUMBERS__2: V('terzo=third; quarto=fourth'),
  ORDINAL_NUMBERS__3: V('quinto=fifth; sesto=sixth'),
  ORDINALS_CONTEXT: R(
    ['On a menu, il primo is the first course and il secondo is the main course.', 'For floors, use piano: il primo piano is “the first floor” and il secondo piano is “the second floor”.'],
    [['Which means “the first floor”?', 'il primo piano', 'il uno piano'], ['On a menu, what is il secondo?', 'the main course', 'the dessert']],
  ),
  VORREI: R(
    ['Vorrei means “I would like” and is the polite way to ask for something.', 'Use it with a noun: Vorrei un caffè means “I would like a coffee”. Use it with an infinitive: Vorrei mangiare means “I would like to eat”.'],
    [['Which is the polite way to ask for a coffee?', 'Vorrei un caffè', 'Voglio un caffè']],
    { say: [['How do you politely say “I would like a coffee”?', 'Vorrei un caffè']] },
  ),
  DEFINITE_ARTICLES: R(
    ['The Italian words for “the” are il, lo, l’, la (singular) and i, gli, le (plural). They are the base for the “some” forms you will learn next.', 'Il pane (the bread), lo zucchero (the sugar), la pasta (the pasta), i panini (the sandwiches), gli spaghetti (the spaghetti), le mele (the apples).'],
    [['“The sugar”', 'lo zucchero', 'il zucchero'], ['“The apples”', 'le mele', 'i mele']],
  ),
  VERBS_COMPRARE_PRENDERE_VOLERE: V('compro=I buy; compra=he / she buys; prendo=I take; prende=he / she takes', ['Comprare means “to buy” and prendere means “to take”. In a shop, prendere is also “to have”: Prendo il pane.']),
  VERBS_COMPRARE_PRENDERE_VOLERE__2: V('voglio=I want; vuole=he / she wants; vogliamo=we want'),
  DIRECT_OBJECT_NOUNS: R(
    ['A direct object is what the verb acts on, and it comes straight after the verb with no word between: Compro il pane means “I buy the bread”.', 'The bread is what is being bought.'],
    [['In “Compro il pane”, what is the direct object?', 'il pane', 'compro']],
  ),
  DI_PREPOSITION: R(
    ['Use di to link a quantity to what it measures: un chilo di pane is “a kilo of bread”.', 'Before a vowel, di becomes d’: una bottiglia d’acqua is “a bottle of water”.'],
    [['“A kilo of bread”', 'un chilo di pane', 'un chilo pane'], ['“A bottle of water”', 'una bottiglia d’acqua', 'una bottiglia acqua']],
  ),
  PARTITIVE: V('del=some (before most masculine nouns); dello=some (before z, s + consonant)', ['Del pane means “some bread”. Dello zucchero means “some sugar”.'], { say: [['How do you say “some bread”?', 'del pane'], ['How do you say “some sugar”?', 'dello zucchero']] }),
  PARTITIVE__2: V('della=some (feminine singular); dei=some (masculine plural)', ['Della pasta means “some pasta”. Dei panini means “some sandwiches”.'], { say: [['How do you say “some pasta”?', 'della pasta'], ['How do you say “some sandwiches”?', 'dei panini']] }),
  PARTITIVE__3: V('degli=some (masculine plural before a vowel, z or s + consonant); delle=some (feminine plural)', ['Degli spaghetti means “some spaghetti”. Delle mele means “some apples”.'], { say: [['How do you say “some spaghetti”?', 'degli spaghetti'], ['How do you say “some apples”?', 'delle mele']] }),
  CONTAINERS_QUANTITIES: V('un chilo di=a kilo of; una bottiglia di=a bottle of', ['Un chilo di pane is “a kilo of bread”.']),
  CONTAINERS_QUANTITIES__2: V('un etto di=100 grams of', ['Italian shops sell by the etto: un etto di prosciutto is 100 grams of ham.']),
  QUANTO_COSTA: R(
    ['Quanto costa? asks the price of one thing: Quanto costa il pane? means “How much is the bread?”.', 'Quanto costano? asks about more than one thing: Quanto costano le mele? means “How much are the apples?”.'],
    [['Asking the price of one loaf of bread', 'Quanto costa il pane?', 'Quanto costano il pane?'], ['Asking the price of the apples', 'Quanto costano le mele?', 'Quanto costa le mele?']],
    { say: [['How do you ask “How much is the bread?”', 'Quanto costa il pane']] },
  ),
  NUMBERS_WITH_CURRENCY: R(
    ['Say the number and then the currency: cinque euro means “five euros”. Euro does not change in the plural.', 'For small amounts use centesimi: cinquanta centesimi means “fifty cents”.'],
    [['“Five euros”', 'cinque euro', 'cinque euri']],
    { say: [['How do you say “five euros”?', 'cinque euro']] },
  ),
};
