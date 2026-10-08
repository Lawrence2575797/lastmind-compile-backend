'use strict';
const { V, R } = require('./helpers');

// B1.2 Pronouns: indirect, direct, ci, ne and combined forms
module.exports = {
  IOBJ3_1: V('mi=to me; ti=to you', ['Mi dà il libro means “He gives me the book”, and Ti scrivo means “I write to you”.']),
  IOBJ3_1__2: V('gli=to him; le=to her', ['Gli telefono means “I phone him”, and Le telefono means “I phone her”.']),
  IOBJ3_2: V('ci=to us; vi=to you (more than one person)', ['Ci scrive means “He writes to us”, and Vi telefono means “I phone you all”.']),
  IOBJ3_2__2: V('gli=to them; loro=to them', ['In everyday speech gli covers “to them” too. Loro is more formal and goes after the verb: Telefono loro.']),
  dir_obj_pron: V('lo=him / it (masculine); la=her / it (feminine)', ['Lo compro means “I buy it”, and La vedo means “I see her”.']),
  dir_obj_pron__2: V('li=them (masculine); le=them (feminine)', ['Li compro means “I buy them”, and Le vedo means “I see them” (women).']),
  single_pron_placement: R(
    ['A pronoun goes before a conjugated verb: Lo vedo means “I see him / it”.', 'With an infinitive, a gerund or a command to tu, it attaches to the end: Voglio vederlo (I want to see it), Guardalo! (Look at it!).'],
    [['“I want to see it”', 'Voglio vederlo', 'Voglio lo vedere'], ['“I see it”', 'Lo vedo', 'Vedo lo']],
  ),
  combine_order: R(
    ['When two pronouns are used together, the indirect one comes first and the direct one second: Me lo dà means “He gives it to me”.', 'Me is “to me” and lo is “it”.'],
    [['“He gives it to me”', 'Me lo dà', 'Lo me dà']],
  ),
  spelling_change_mi_ti_ci_vi: V('me lo=it to me; te lo=it to you', ['Before lo, la, li, le, mi becomes me and ti becomes te: Me lo dai means “You give it to me”.']),
  spelling_change_mi_ti_ci_vi__2: V('ce lo=it to us; ve lo=it to you (more than one person)', ['Before lo, la, li, le, ci becomes ce and vi becomes ve.']),
  ci_location: R(
    ['Ci can mean “there”. It replaces a place that has already been mentioned: Vai a Roma? Sì, ci vado means “Are you going to Rome? Yes, I am going there”.', 'Ci sono stato means “I have been there”.'],
    [['“I am going there”', 'Ci vado', 'Vado ci'], ['“I have been there” (a man)', 'Ci sono stato', 'Ci ho stato']],
  ),
  ci_replace_a_in_su: R(
    ['Ci also stands for a thing introduced by a, in or su: Pensi al lavoro? Non ci penso means “Are you thinking about work? I am not thinking about it”.'],
    [['“I am not thinking about it”', 'Non ci penso', 'Ci non penso']],
  ),
  ne_quantity: R(
    ['Ne stands for “of it” or “of them” when you give a quantity: Quanti panini vuoi? Ne prendo due means “How many sandwiches do you want? I take two (of them)”.', 'The number stays at the end.'],
    [['“I take two (of them)”', 'Ne prendo due', 'Prendo due ne']],
  ),
  ne_topic: R(
    ['Ne can also stand for “about it”: Parliamo del problema? Ne parliamo domani means “Shall we talk about the problem? We will talk about it tomorrow”.'],
    [['“We will talk about it tomorrow”', 'Ne parliamo domani', 'Parliamo ne domani']],
  ),
  spelling_change_gli_le: V('glielo=it to him / to her; gliela=it to him / to her (feminine thing)', ['Gli and le both become glie- before lo, la, li, le and join into one word: Glielo do means “I give it to him / her”.']),
  spelling_change_gli_le__2: V('glieli=them to him / to her; gliele=them to him / to her (feminine things)'),
  COMBO_1: V('me lo=it to me; te la=it to you', ['Te la dà means “He gives it to you” (a feminine thing).']),
  COMBO_1__2: V('glielo=it to him / to her', ['Glielo dico means “I tell it to him / her”.']),
  COMBO_2: V('gliela=it to him / to her (feminine thing); ce lo=it to us', ['Gliela mando means “I send it to him / her”, and Ce lo dà means “He gives it to us”.']),
  COMBO_2__2: V('ve la=it to you (more than one person), feminine thing', ['Ve la mando means “I send it to you all”.']),
  combined_placement: R(
    ['Combined pronouns follow the same placement as single ones: before a conjugated verb, or joined to the end of an infinitive.', 'Me lo puoi dare? and Puoi darmelo? both mean “Can you give it to me?”.'],
    [['Which is correct?', 'Puoi darmelo?', 'Puoi dare melo?']],
  ),
  identify_underlying_pairing: R(
    ['Before you use a combined form, find the two pronouns: Do il libro a Marco. The book is the direct object (lo) and Marco is the indirect one (gli).', 'Together they give Glielo do, “I give it to him”.'],
    [['Do il libro a Marco. Replace both nouns.', 'Glielo do', 'Lo gli do']],
  ),
  passato_prossimo: R(
    ['Remember the passato prossimo: avere or essere in the present plus the past participle: Ho comprato il pane, Sono andato a Roma.'],
    [['“I bought the bread”', 'Ho comprato il pane', 'Sono comprato il pane']],
  ),
  participle_agreement_direct: R(
    ['When lo or la comes before the verb in the passato prossimo, the participle matches it: L’ho visto (him, masculine), L’ho vista (her, feminine).', 'La compro becomes L’ho comprata.'],
    [['“I saw her”', 'L’ho vista', 'L’ho visto']],
  ),
  participle_agreement_direct__2: R(
    ['With li and le the participle matches too: Li ho visti (them, masculine), Le ho viste (them, feminine).'],
    [['“I saw them” (women)', 'Le ho viste', 'Le ho visti']],
  ),
  participle_agreement_combined: R(
    ['With a combined pronoun, the participle still matches the direct pronoun: Me l’ha data means “He gave it to me” when “it” is feminine, and Me l’ha dato when “it” is masculine.'],
    [['“He gave it to me” (the book, il libro)', 'Me l’ha dato', 'Me l’ha data']],
  ),
};
