'use strict';
const { V, R } = require('./helpers');

// A1.1 Greetings, introductions and register
module.exports = {
  PRON_IO: V('io=I', ['Italian often leaves io out, because the verb ending already shows who is speaking.', 'Use it when you want to stress “I”, as in “I am, not you”.']),
  PRON_TU: V('tu=you (one friend, informal)', ['Use tu with a friend, a family member, a child, or somebody your own age.']),
  register_concept: R(
    ['Italian has two ways of saying “you” to one person: informal tu and formal Lei.', 'Use tu with friends, family, children and people your age. Use Lei with strangers, older people and in official situations.', 'Choosing wrongly is not a disaster, but formal Lei is the safe choice with a stranger.'],
    [['You meet an older stranger and want to be polite. Which do you use?', 'Lei (formal)', 'tu (informal)'], ['You are talking to a friend your own age. Which do you use?', 'tu (informal)', 'Lei (formal)']],
  ),
  question_words: V('come=how; dove=where', ['Come ti chiami? literally asks “How do you call yourself?”.']),
  PRON_LUILEI: V('lui=he; lei=she', ['Lei with a small l means “she”. Formal “you” is written Lei with a capital L.']),
  PRON_NOI: V('noi=we'),
  PRON_VOI: V('voi=you (more than one person)', ['Use voi for two or more people, whether they are friends or strangers.']),
  PRON_LORO: V('loro=they'),
  question_words_quando_perche: V('quando=when; perché=why', ['Perché also means “because”: it asks the question and gives the answer.']),
  question_words_chi_cosa_quanto: V('chi=who; cosa=what'),
  question_words_chi_cosa_quanto__2: V('quanto=how much', ['Quanto can also mean “how many”.']),
  greet_time: V('buongiorno=good morning; buonasera=good evening', ['Buongiorno is also used as “good day” until the afternoon.']),
  greet_time__2: V('buonanotte=good night', ['Say buonanotte when you are going to bed or saying goodbye late at night.']),
  greet_casual: V('ciao=hi / bye (informal); salve=hello (works with anyone)', [], { say: [['Which informal word means both “hi” and “bye”?', 'ciao'], ['Which neutral “hello” works with friends and strangers alike?', 'salve']] }),
  courtesy_basic: V('per favore=please; grazie=thank you'),
  courtesy_basic__2: V('prego=you’re welcome', ['Prego is also what a waiter or shopkeeper says to mean “please, go ahead”.']),
  lei_formal: R(
    ['Lei (capital L) is the formal way to say “you” to one person.', 'Use Lei for a stranger, an older person, or somebody in an official role. Use tu for a friend.', 'With a small l, lei means “she”. The capital letter is what tells you it is formal “you”.'],
    [['You are speaking to a hotel receptionist you have never met. Which word for “you” fits?', 'Lei', 'tu'], ['What does lei with a small l mean?', 'she', 'you (formal)']],
  ),
  intro_self: V('mi chiamo=my name is', ['Mi chiamo is followed by your name: Mi chiamo Marco means “My name is Marco”.', 'Literally it means “I call myself”.'], { say: [['How do you say “My name is Marco”?', 'Mi chiamo Marco']] }),
  ask_name_informal: V('come ti chiami?=what is your name? (to a friend)', ['Literally this is “How do you call yourself?”.'], { say: [['How do you ask a friend “What is your name?”', 'Come ti chiami']] }),
  ask_name_formal: V('come si chiama?=what is your name? (formal)', ['Use this with somebody you would call Lei.'], { say: [['How do you ask a stranger politely “What is your name?”', 'Come si chiama']] }),
  courtesy_apology: V('scusa=excuse me / sorry (to a friend); scusi=excuse me / sorry (formal)', [], { say: [['Which word means “excuse me” to a friend?', 'scusa'], ['Which word means “excuse me” to a stranger, formally?', 'scusi']] }),
  courtesy_response: V('di niente=it’s nothing / you’re welcome', ['Say it after somebody thanks you.']),
  ask_origin_informal: V('di dove sei?=where are you from? (to a friend)', ['Literally: “From where are you?”.'], { say: [['How do you ask a friend “Where are you from?”', 'Di dove sei']] }),
  ask_origin_formal: V('di dov’è?=where are you from? (formal)', ['Use this with somebody you would call Lei.'], { say: [['How do you ask a stranger politely “Where are you from?”', 'Di dov’è']] }),
  yesno: V('sì=yes; no=no', ['Sì with the accent means “yes”. No is the same as in English.']),
  greet_farewell: V('arrivederci=goodbye; a presto=see you soon'),
  greet_farewell__2: V('a domani=see you tomorrow'),
  piacere: V('piacere=nice to meet you', ['Say it when somebody introduces themselves to you.']),
  state_origin: V('sono di=I am from', ['Add a place: Sono di Roma means “I am from Rome”.'], { say: [['How do you say “I am from Rome”?', 'Sono di Roma']] }),
  nationality_agree: R(
    ['Italian nationality words change their ending to match the person.', 'A man is italiano and a woman is italiana. The -o ending is masculine and the -a ending is feminine.', 'So Marco è italiano, but Giulia è italiana.'],
    [['Giulia is a woman from Italy. Which word describes her?', 'italiana', 'italiano'], ['Marco is a man from Italy. Which word describes him?', 'italiano', 'italiana']],
  ),
  nationality_agree__2: R(
    ['For more than one person the ending changes again: italiani is plural masculine (or a mixed group), and italiane is plural for women only.', 'Marco e Luca sono italiani. Giulia e Anna sono italiane.'],
    [['Giulia and Anna are Italian. Which word do you use?', 'italiane', 'italiani'], ['A group of men from Italy: which word?', 'italiani', 'italiane']],
  ),
  nationality_agree__3: R(
    ['Some nationality words end in -e, like inglese (English). The same word is used for a man and a woman.', 'Only the number changes: the plural is inglesi.', 'Tom è inglese and Emma è inglese; Tom ed Emma sono inglesi.'],
    [['Emma is English. Which form do you use?', 'inglese', 'inglesa'], ['Tom and Emma are English. Which form?', 'inglesi', 'inglese']],
  ),
};
