"""Enforce a strict max-2-items-per-lesson rule on the Spanish and Italian
knowledge maps (knowledge_map_{spanish,italian}_other.json).

Works from the LIVE map (scripts/_db_export_<language>.json, produced by
export_language_maps_from_db.js) because the DB had already been through an
earlier 3-4-items-per-node split that was never written back to the JSON.
Nodes still carrying their original label use the hand-written SPANISH/ITALIAN
specs below; every other node with more than two items is re-split generically
from its own label ("Prefix: a, b, c, d" or "Prefix (a, b, c, d)").

Any node whose label bundles more than two items a student has to hold at
once (a word list, a 6-form paradigm, a set of endings...) is split into a
short chain of nodes of at most two items each. The first piece keeps the
original node id (so its DB row, uuid and incoming edges survive - only its
label/concept_id change); further pieces get ids "<id>__2", "<id>__3", ....
Incoming edges go to the first piece, the pieces are chained in order, and
outgoing edges leave from the last piece, so everything downstream still
requires the full set.

Idempotent: a node whose label already equals its first piece's label is
skipped. Usage: python scripts/split_language_maps.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def pairs(prefix, items):
    return [f"{prefix}: {', '.join(items[i:i + 2])}" for i in range(0, len(items), 2)]


def conj(prefix, forms):
    return pairs(prefix, forms)


def lst(prefix, chunks):
    return [f"{prefix}: {c}" for c in chunks]


NUM_ES = ('cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince '
          'dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro '
          'veinticinco veintiséis veintisiete veintiocho veintinueve treinta').split()
NUM_IT = ('zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici '
          'quindici sedici diciassette diciotto diciannove venti').split()

SPANISH = {
    'greet_time_of_day': pairs('Time-of-day greetings', ['buenos días', 'buenas tardes', 'buenas noches']),
    'greet_informal': pairs('Informal greetings/farewells', ['hola', 'adiós', 'hasta luego', 'hasta mañana']),
    'subj_pronouns': pairs('Subject pronouns', ['yo', 'tú']) + pairs('Subject pronouns', ['él', 'ella'])
        + pairs('Subject pronouns', ['usted', 'ustedes']) + pairs('Subject pronouns', ['nosotros(as)', 'vosotros(as)'])
        + pairs('Subject pronouns', ['ellos', 'ellas']),
    'SUBJ_PRON': pairs('Spanish subject pronouns', ['yo', 'tú']) + pairs('Spanish subject pronouns', ['él', 'ella'])
        + pairs('Spanish subject pronouns', ['nosotros', 'vosotros']) + pairs('Spanish subject pronouns', ['ellos']),
    'subject_pronouns': pairs('Subject pronouns', ['yo', 'tú']) + pairs('Subject pronouns', ['él', 'ella']),
    'possessive_adjectives': pairs('Possessive adjectives', ['mi', 'tu']) + pairs('Possessive adjectives', ['su']),
    'courtesy_expr': pairs('Basic courtesy expressions', ['por favor', 'gracias', 'de nada', 'perdón', 'disculpe']),
    'question_words': pairs('Basic question words', ['qué', 'dónde', 'cuándo', 'por qué', 'quién', 'cómo', 'cuánto']),
    'nationality_agreement': lst('Nationality adjectives', ['masculine and feminine singular (español/española)',
                                                            'masculine and feminine plural (españoles/españolas)']),
    'NUM_0_30': pairs('Cardinal numbers', NUM_ES),
    'NUM_31_100': pairs('Cardinal numbers (tens)', ['treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien'])
        + ['Cardinal numbers 31-99: tens + y + units (treinta y uno)'],
    'NUM_100PLUS': pairs('Numbers above 100', ['cien', 'doscientos', 'mil']),
    'PRON_TENER': conj('Verb tener (to have)', ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen']),
    'TENER_CONJ': conj('Present tense of tener', ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen']),
    'HACER_CONJ': conj('Present tense of hacer', ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen']),
    'DECIR_CONJ': conj('Present tense of decir', ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen']),
    'PODER_CONJ': conj('Present tense of poder', ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden']),
    'QUERER_CONJ': conj('Present tense of querer', ['quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren']),
    'DEBER_CONJ': conj('Present tense of deber', ['debo', 'debes', 'debe', 'debemos', 'debéis', 'deben']),
    'SER_CONJ': conj('Present tense conjugation of ser', ['soy', 'eres', 'es', 'somos', 'sois', 'son']),
    'ESTAR_CONJ': conj('Present tense conjugation of estar', ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están']),
    'IR_VERB_CONJ_IRREG': conj('Present tense of ir', ['voy', 'vas', 'va', 'vamos', 'vais', 'van']),
    'DAYS': pairs('Days of the week', ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']),
    'MONTHS': pairs('Months of the year', ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                                           'septiembre', 'octubre', 'noviembre', 'diciembre']),
    'SEASONS': pairs('Seasons', ['la primavera', 'el verano', 'el otoño', 'el invierno']),
    'DEF_ARTICLES': pairs('Definite articles', ['el', 'la', 'los', 'las']),
    'INDEF_ARTICLES': pairs('Indefinite articles', ['un', 'una', 'unos', 'unas']),
    'AR_CONJ': conj('Present tense of regular -ar verbs (hablar)', ['-o', '-as', '-a', '-amos', '-áis', '-an']),
    'ER_CONJ': conj('Present tense of regular -er verbs (comer)', ['-o', '-es', '-e', '-emos', '-éis', '-en']),
    'IR_CONJ': conj('Present tense of regular -ir verbs (vivir)', ['-o', '-es', '-e', '-imos', '-ís', '-en']),
    'FAM_VOCAB': pairs('Family vocabulary', ['madre', 'padre', 'hermano', 'hermana', 'abuelo', 'abuela', 'hijo', 'hija',
                                             'marido', 'esposa', 'tío', 'tía', 'primo', 'prima']),
    'POSS_ADJ': pairs('Possessive adjectives', ['mi/mis', 'tu/tus', 'su/sus', 'nuestro/a/os/as', 'vuestro/a/os/as']),
    'PHYS_ADJ': pairs('Physical appearance adjectives', ['alto', 'bajo', 'joven', 'viejo']),
    'MODAL_CONSTRUCTION': pairs('Modal verb + infinitive construction', ['poder', 'querer', 'deber']),
    'MODAL_PRESENT': pairs('Modal verbs in the present tense', ['poder', 'deber', 'querer']),
    'FOOD_VOCAB': pairs('Food and drink vocabulary', ['un café', 'un bocadillo', 'el agua', 'el vino']),
    'SHOP_VOCAB': pairs('Shopping vocabulary', ['la panadería', 'la carnicería', 'la farmacia', 'el supermercado']),
    'DE_QUANTITY': pairs('Quantity expressions with de', ['un poco de', 'un kilo de', 'una botella de', 'un vaso de']),
    'CURRENCY_VOCAB': pairs('Currency vocabulary', ['euros', 'céntimos', 'pesos']),
    'ORDINAL_NUMBERS': pairs('Ordinal numbers', ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']),
    'VERBS_COMPRAR_TOMAR_QUERER': pairs('Verbs (meaning and conjugation)', ['comprar', 'tomar', 'querer']),
    'AR_REGULAR': conj('Regular -ar preterite endings', ['-é', '-aste', '-ó', '-amos', '-asteis', '-aron']),
    'ER_IR_REGULAR': conj('Regular -er/-ir preterite endings', ['-í', '-iste', '-ió', '-imos', '-isteis', '-ieron']),
    'SER_IR_PRETERITE': conj('Ser and ir share identical preterite forms', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']),
    'TENER_PRET': conj('Irregular preterite: tener', ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron']),
    'HACER_PRET': conj('Irregular preterite: hacer', ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron']),
    'ESTAR_PRET': conj('Irregular preterite: estar', ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron']),
    'PODER_PRET': conj('Irregular preterite: poder', ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron']),
    'DECIR_PRET': conj('Irregular preterite: decir', ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron']),
    'VENIR_PRET': conj('Irregular preterite: venir', ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron']),
    'PRET_IRREG_STEM_ENDINGS': conj('Irregular preterite shared unstressed endings', ['-e', '-iste', '-o', '-imos', '-isteis', '-ieron']),
    'TIME_EXPRESSIONS': pairs('Time expressions signalling preterite', ['ayer', 'la semana pasada', 'anoche', 'hace dos días']),
    'AR_IMPF_FORM': conj('Imperfecto formation: -ar verbs', ['-aba', '-abas', '-aba', '-ábamos', '-abais', '-aban']),
    'ER_IR_IMPF_FORM': conj('Imperfecto formation: -er/-ir verbs', ['-ía', '-ías', '-ía', '-íamos', '-íais', '-ían']),
    'IMPF_IRREG_SER': conj('Irregular imperfecto: ser', ['era', 'eras', 'era', 'éramos', 'erais', 'eran']),
    'IMPF_IRREG_IR': conj('Irregular imperfecto: ir', ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban']),
    'IMPF_IRREG_VER': conj('Irregular imperfecto: ver', ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían']),
    'DOP_FORMS': pairs('Direct object pronoun forms', ['me', 'te', 'lo', 'la', 'nos', 'os', 'los', 'las']),
    'DOP': pairs('Direct object pronouns', ['me', 'te', 'lo', 'la', 'nos', 'os', 'los', 'las']),
    'IOP_FORMS': pairs('Indirect object pronoun forms', ['me', 'te', 'nos', 'os', 'le', 'les']),
    'IOP': pairs('Indirect object pronouns', ['me', 'te', 'nos', 'os', 'le', 'les']),
    'IOP_VERBS': pairs('Verbs requiring indirect object pronouns', ['gustar', 'dar', 'decir', 'escribir']),
    'REFLEX_PRONOUN_FORMS': lst('Reflexive pronoun forms', ['me, te', 'se, nos', 'os, se (plural)']),
    'REFLEX_EXAMPLES': pairs('Common reflexive verbs', ['levantarse', 'despertarse', 'lavarse', 'vestirse', 'llamarse']),
    'COMBINE_ORDER': pairs('Combining IO + DO pronouns with IO first', ['me lo', 'te la', 'nos los', 'os las']),
    'COMP_EQ_NOUN': pairs('Comparative of equality with nouns', ['tanto', 'tanta', 'tantos', 'tantas']),
    'ABS_SUPERLATIVE_ISIMO': pairs('Absolute superlative ending', ['-ísimo', '-ísima', '-ísimos', '-ísimas']),
    'FUT_ENDINGS_SHARED': conj('Future tense endings shared across all three conjugations', ['-é', '-ás', '-á', '-emos', '-éis', '-án']),
    'FUT_IRREGULAR_STEMS': pairs('Irregular future stems', ['tendré', 'podré', 'haré', 'diré', 'saldré', 'pondré', 'vendré', 'querré', 'sabré']),
    'DIR_VOCAB': pairs('Direction vocabulary', ['todo recto', 'a la derecha', 'a la izquierda', 'en la esquina', 'enfrente de', 'al lado de']),
    'TRANSPORT_VOCAB': pairs('Travel and transport nouns', ['el tren', 'el avión', 'la estación', 'el billete/boleto', 'la reserva']),
    'HEALTH_EXPRESSIONS': lst('Common health expressions', ['me duele..., tengo dolor de cabeza', 'tengo dolor de estómago, me siento bien/mal']),
    'FUTURE_TIME_EXPRESSIONS': pairs('Time expressions for future plans', ['mañana', 'la próxima semana', 'dentro de dos días']),
    'BODY_PARTS': pairs('Body vocabulary', ['la cabeza', 'el estómago', 'la garganta', 'la espalda', 'el brazo', 'la pierna', 'la mano', 'el pie']),
    'HABER_PRESENT_COND': conj('Present conditional of haber', ['habría', 'habrías', 'habría', 'habríamos', 'habríais', 'habrían']),
    'PRES_COND_FORM': conj('Present conditional endings', ['-ía', '-ías', '-ía', '-íamos', '-íais', '-ían']),
    'IRREGULAR_STEMS': pairs('Irregular present subjunctive stems', ['ser: sea', 'estar: esté', 'ir: vaya', 'saber: sepa', 'dar: dé', 'haber: haya']),
    'AR_SUBJ_ENDINGS': conj('Present subjunctive endings for -ar verbs', ['-e', '-es', '-e', '-emos', '-éis', '-en']),
    'ER_IR_SUBJ_ENDINGS': conj('Present subjunctive endings for -er/-ir verbs', ['-a', '-as', '-a', '-amos', '-áis', '-an']),
    'IMPERSONAL_TRIGGERS': pairs('Impersonal expressions triggering subjunctive', ['es necesario que', 'es posible que', 'ojalá que']),
    'PRES_SUBJ_TRIGGERS': pairs('Core subjunctive triggers', ['wish', 'emotion', 'doubt', 'necessity']),
    'PRES_SUBJ_HABER': conj('Present subjunctive forms of haber', ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan']),
    'IMPF_SUBJ_HABER': conj('Imperfect subjunctive forms of haber', ['hubiera', 'hubieras', 'hubiera', 'hubiéramos', 'hubierais', 'hubieran']),
    'IMPF_SUBJ_RA': conj('Imperfect subjunctive -ra endings', ['hablara', 'hablaras', 'hablara', 'habláramos', 'hablarais', 'hablaran']),
    'IMPF_SUBJ_SE': conj('Imperfect subjunctive -se endings', ['hablase', 'hablases', 'hablase', 'hablásemos', 'hablaseis', 'hablasen']),
    'reporting_verbs': pairs('Reporting verbs', ['dijo que', 'explicó que', 'preguntó si']),
    'past_tenses': pairs('Spanish past tenses', ['pretérito indefinido', 'imperfecto', 'pluscuamperfecto']),
    'time_expressions': pairs('Time/adverb expressions in direct speech', ['hoy', 'mañana', 'ayer', 'aquí']),
    'adverb_time_changes': pairs('Adverb/time-expression changes in reported speech',
                                 ['hoy->ese día', 'mañana->al día siguiente', 'ayer->el día anterior', 'aquí->allí']),
    'gerundio_formation_irregular': pairs('Gerundio irregularities', ['dormir->durmiendo', 'leer->leyendo', 'decir->diciendo']),
    'argumentative_paragraph_structure': lst('Structuring a short argumentative paragraph',
                                             ['thesis and connected supporting points', 'concluding connector']),
    'NUM_20_29': pairs('Cardinal numbers', ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']),
    'PAST_PARTICIPLE_B2': lst('Formation of past participle', ['regular -ado/-ido (hablado, salido)', 'irregular (hecho, dicho)']),
}

ITALIAN = {
    'greet_time': pairs('Time-of-day greetings', ['buongiorno', 'buonasera', 'buonanotte']),
    'greet_farewell': pairs('Farewell expressions', ['arrivederci', 'a presto', 'a domani']),
    'subj_pronouns': pairs('Subject pronouns', ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro']),
    'SUBJ_PRON': pairs('Italian subject pronouns', ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro']),
    'SUBJECT_PRONOUNS': pairs('Subject pronouns (recap)', ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro']),
    'courtesy_basic': pairs('Basic courtesy expressions', ['per favore', 'grazie', 'prego']),
    'nationality_agree': lst('Nationality adjectives', ['-o/-a forms (italiano, italiana)', 'plural forms (italiani, italiane)', '-e adjectives (inglese, inglesi)']),
    'question_words': pairs('Question words', ['come', 'dove', 'quando', 'perché', 'chi', 'cosa', 'quanto']),
    'NUM_0_20': pairs('Cardinal numbers', NUM_IT),
    'NUM_21_100': pairs('Cardinal numbers (tens)', ['venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta', 'cento'])
        + ['Cardinal numbers 21-99: tens + units (ventuno, ventidue)'],
    'NUM_ABOVE_100': pairs('Numbers above 100', ['cento', 'duecento', 'mille']),
    'DAYS_OF_WEEK': pairs('Days of the week', ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']),
    'MONTHS_YEAR': pairs('Months of the year', ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
                                                'settembre', 'ottobre', 'novembre', 'dicembre']),
    'SEASONS': pairs('Seasons', ['primavera', 'estate', 'autunno', 'inverno']),
    'AVERE_VERB': conj('Verb avere (to have)', ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno']),
    'AVERE_CONJ': conj('Present tense conjugation of avere', ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno']),
    'ESSERE_CONJ': conj('Present tense conjugation of essere', ['sono', 'sei', 'è', 'siamo', 'siete', 'sono (loro)']),
    'initial_sound_rule': pairs('Initial-sound rule triggers', ['vowel', 's+consonant', 'z', 'gn', 'x', 'y', 'ps']),
    'def_art_forms': pairs('Definite article forms', ['il', 'lo', 'la', "l'", 'i', 'gli', 'le']),
    'indef_art_forms': pairs('Indefinite article forms', ['un', 'uno', 'una', "un'"]),
    'adj_position_exceptions': pairs('Adjectives that commonly precede the noun', ['bello', 'buono', 'grande', 'giovane']),
    'AVERE_EXPRESSIONS': pairs('Avere fixed expressions', ['fame', 'sete', 'freddo', 'caldo', 'paura', 'ragione', 'torto', 'bisogno di']),
    'ARE_CONJ': conj('Present tense of regular -are verbs (parlare)', ['-o', '-i', '-a', '-iamo', '-ate', '-ano']),
    'ERE_CONJ': conj('Present tense of regular -ere verbs (prendere)', ['-o', '-i', '-e', '-iamo', '-ete', '-ono']),
    'IRE_NORMAL_CONJ': conj('Present tense of regular -ire verbs, normal pattern (dormire)', ['-o', '-i', '-e', '-iamo', '-ite', '-ono']),
    'IRE_ISC_CONJ': conj('Present tense of regular -ire verbs, -isc- pattern (capire)', ['-isco', '-isci', '-isce', '-iamo', '-ite', '-iscono']),
    'FAM_VOCAB': pairs('Family vocabulary', ['madre', 'padre', 'fratello', 'sorella', 'nonno', 'nonna', 'figlio', 'figlia',
                                             'marito', 'moglie', 'zio', 'zia', 'cugino', 'cugina']),
    'POSS_ADJ_FORMS': pairs('Possessive adjective forms', ['il mio', 'la mia', 'i miei', 'le mie']),
    'PHYS_APPEARANCE_ADJ': pairs('Adjectives of physical appearance', ['alto', 'basso', 'giovane', 'vecchio']),
    'ANDARE': conj('Present tense of andare', ['vado', 'vai', 'va', 'andiamo', 'andate', 'vanno']),
    'FARE': conj('Present tense of fare', ['faccio', 'fai', 'fa', 'facciamo', 'fate', 'fanno']),
    'DARE': conj('Present tense of dare', ['do', 'dai', 'dà', 'diamo', 'date', 'danno']),
    'STARE': conj('Present tense of stare', ['sto', 'stai', 'sta', 'stiamo', 'state', 'stanno']),
    'POTERE': conj('Present tense of potere', ['posso', 'puoi', 'può', 'possiamo', 'potete', 'possono']),
    'DOVERE': conj('Present tense of dovere', ['devo', 'devi', 'deve', 'dobbiamo', 'dovete', 'devono']),
    'VOLERE': conj('Present tense of volere', ['voglio', 'vuoi', 'vuole', 'vogliamo', 'volete', 'vogliono']),
    'MODAL_INFINITIVE_CONSTRUCTION': pairs('Modal verb + infinitive construction', ['potere', 'dovere', 'volere']),
    'MODAL_INFINITIVE': pairs('Modal verb + infinitive', ['potere', 'volere', 'dovere']),
    'modal_verbs_present': pairs('Modal verbs in the present tense', ['potere', 'dovere', 'volere']),
    'FOOD_VOCAB': pairs('Food and drink vocabulary', ['un caffè', 'un cappuccino', 'un panino', "l'acqua"]),
    'PARTITIVE': pairs('Partitive article forms', ['del', 'dello', 'della', 'dei', 'degli', 'delle']),
    'SHOPPING_VOCAB': pairs('Shopping vocabulary', ['il panificio', 'la macelleria', 'la farmacia', 'il supermercato']),
    'ORDINAL_NUMBERS': pairs('Ordinal numbers', ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto']),
    'CONTAINERS_QUANTITIES': pairs('Common containers/quantities', ['un chilo di', 'una bottiglia di', 'un etto di']),
    'VERBS_COMPRARE_PRENDERE_VOLERE': pairs('Verbs (conjugated forms)', ['comprare', 'prendere', 'volere']),
    'PAST_PARTICIPLE_REGULAR': lst('Regular past participle formation', ['-are→-ato, -ere→-uto', '-ire→-ito']),
    'TIME_EXPRESSIONS_KNOWN': pairs('Time expressions (vocabulary)', ['ieri', 'la settimana scorsa', 'già', 'non...ancora']),
    'IMPF_ARE': conj('Imperfetto formation: -are verbs', ['-avo', '-avi', '-ava', '-avamo', '-avate', '-avano']),
    'IMPF_ERE': conj('Imperfetto formation: -ere verbs', ['-evo', '-evi', '-eva', '-evamo', '-evate', '-evano']),
    'IMPF_IRE': conj('Imperfetto formation: -ire verbs', ['-ivo', '-ivi', '-iva', '-ivamo', '-ivate', '-ivano']),
    'IMPF_ESSERE': conj('Irregular imperfetto stem: essere', ['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano']),
    'IMPF_AVERE': conj('Imperfetto of avere', ['avevo', 'avevi', 'aveva', 'avevamo', 'avevate', 'avevano']),
    'DOP_FORMS': pairs('Direct object pronoun forms', ['mi', 'ti', 'lo', 'la', 'ci', 'vi', 'li', 'le']),
    'A_PERSON_VERBS': pairs("Verbs taking 'a + person'", ['dare', 'dire', 'scrivere', 'telefonare', 'piacere']),
    'IOP_FORMS': pairs('Indirect object pronoun forms', ['mi', 'ti', 'gli', 'le', 'ci', 'vi', 'loro']),
    'ind_obj_pron': pairs('Indirect object pronouns', ['mi', 'ti', 'gli', 'le', 'ci', 'vi', 'loro']),
    'dir_obj_pron': pairs('Direct object pronouns', ['lo', 'la', 'li', 'le']),
    'REFLEXIVE_PRONOUNS': lst('Reflexive pronoun forms', ['mi, ti', 'si, ci', 'vi, si (plural)']),
    'REFLEXIVE_EXAMPLES': pairs('Common reflexive verbs', ['svegliarsi', 'alzarsi', 'lavarsi', 'vestirsi', 'chiamarsi']),
    'abs_superlative_issimo': pairs('Absolute superlative ending', ['-issimo', '-issima', '-issimi', '-issime']),
    'future_endings_are_ere': conj('Future endings for -are/-ere verbs (-er- stem)', ['-ò', '-ai', '-à', '-emo', '-ete', '-anno']),
    'future_irr_stems': pairs('Key irregular future stems', ['essere→sar-', 'avere→avr-', 'andare→andr-', 'fare→far-',
                                                             'potere→potr-', 'dovere→dovr-', 'volere→vorr-', 'venire→verr-']),
    'DIR_VOCAB': pairs('Direction vocabulary', ['sempre dritto', 'a destra', 'a sinistra', "all'angolo", 'di fronte a', 'vicino a']),
    'TRANSPORT_VOCAB': pairs('Travel and transport vocabulary', ['il treno', "l'aereo", 'la stazione', 'il biglietto', 'la prenotazione']),
    'PREP_PLACE_MOVE': pairs('Prepositions of place/movement', ['a', 'in', 'da', 'per', 'su', 'con']),
    'BODY_PARTS': pairs('Body vocabulary', ['la testa', 'lo stomaco', 'la gola', 'la schiena', 'il braccio', 'la gamba', 'la mano', 'il piede']),
    'HEALTH_EXPR': lst('Health expressions', ['mi fa male..., ho mal di testa', 'ho mal di stomaco']),
    'FUTURE_TIME_EXPR': pairs('Time expressions for future plans', ['domani', 'la prossima settimana', 'tra due giorni']),
    'pres_cond_endings': conj('Present conditional endings', ['-ei', '-esti', '-ebbe', '-emmo', '-este', '-ebbero']),
    'combined_forms': pairs('Combined pronoun forms', ['me lo', 'te la', 'glielo', 'gliela', 'ce lo', 've la']),
    'spelling_change_mi_ti_ci_vi': pairs('Spelling change before direct object pronouns', ['mi→me', 'ti→te', 'ci→ce', 'vi→ve']),
    'spelling_change_gli_le': pairs('Fused glie- forms', ['glielo', 'gliela', 'glieli', 'gliele']),
    'CUI_RELATIVE': pairs("'Cui' after a preposition", ['a cui', 'di cui', 'con cui', 'per cui']),
    'IL_QUALE_RELATIVE': pairs("Formal relative 'il quale'", ['il quale', 'la quale', 'i quali', 'le quali']),
    'TRIGGERS': pairs('Core subjunctive triggers', ['opinion', 'doubt', 'emotion', 'desire', 'necessity']),
    'IMPERSONAL_TRIGGERS': pairs('Impersonal expressions triggering subjunctive', ['bisogna che', 'è possibile che', 'sembra che']),
    'PRES_SUB_AVERE_ESSERE': pairs('Present subjunctive of avere', ['abbia', 'abbiamo', 'abbiate', 'abbiano'])
        + pairs('Present subjunctive of essere', ['sia', 'siamo', 'siate', 'siano']),
    'IMPF_SUB_ARE': conj('Congiuntivo imperfetto: -are verbs', ['-assi', '-asse', '-assimo', '-aste', '-assero']),
    'IMPF_SUB_ERE_IRE': lst('Congiuntivo imperfetto: -ere/-ire verbs', ['-essi/-issi, -esse/-isse', '-essimo/-issimo, -este/-iste', '-essero/-issero']),
    'IMPF_SUB_AVERE_ESSERE': conj('Congiuntivo imperfetto of avere', ['avessi', 'avesse', 'avessimo', 'aveste', 'avessero'])
        + conj('Congiuntivo imperfetto of essere', ['fossi', 'fosse', 'fossimo', 'foste', 'fossero']),
    'REPORT_VERBS': pairs('Reporting verbs', ['ha detto che', 'ha spiegato che', 'ha chiesto se']),
    'PAST_TENSES': pairs('Italian past tenses', ['passato prossimo', 'imperfetto', 'trapassato prossimo']),
    'POSSESSIVES': pairs('Possessive adjectives', ['il mio', 'il tuo', 'il suo']),
    'TIME_ADVERBS': pairs('Time/place adverbs in direct speech', ['oggi', 'domani', 'ieri', 'qui']),
    'TIME_ADVERB_SHIFT': pairs('Time/place adverb changes in reported speech',
                               ['oggi->quel giorno', 'domani->il giorno dopo', 'ieri->il giorno prima', 'qui->lì']),
    'connector_quindi_dunque_percio': pairs('Connectors', ['quindi', 'dunque', 'perciò']),
    'argumentative_paragraph_structure': lst('Structuring a short argumentative paragraph',
                                             ['thesis and connectors', 'conclusion']),
    'PAST_PARTICIPLE_IRREGULAR': pairs('Common irregular past participles', ['fatto', 'detto', 'visto', 'letto', 'scritto', 'aperto', 'chiuso',
                                                                             'preso', 'messo', 'venuto', 'rimasto', 'nato', 'morto', 'successo']),
    'PREPOSITIONS_BASIC': pairs('Basic Italian prepositions', ['a', 'di', 'con', 'per']),
}

# Where the generic re-split would give two sibling nodes an identical label
# (both ending in a lone "se"), name the pieces explicitly instead.
FORCE = {
    'spanish': {
        'REFL_1': ['Reflexive pronoun forms: me, te', 'Reflexive pronoun forms: se (singular)'],
        'REFL_2': ['Reflexive pronoun forms: nos, os', 'Reflexive pronoun forms: se (plural)'],
    },
    'italian': {
        'REFL_1': ['Reflexive pronoun forms: mi, ti', 'Reflexive pronoun forms: si (singular)'],
        'REFL_2': ['Reflexive pronoun forms: ci, vi', 'Reflexive pronoun forms: si (plural)'],
    },
}


def clean(s):
    return re.sub(r'[^a-z0-9]+', '_', (s or '').strip().lower())


def top_level_commas(text):
    out, depth, cur = [], 0, ''
    for ch in text:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return out


def tidy_items(raw):
    items = []
    for x in raw:
        x = re.sub(r'(\betc\.?|\.\.\.|…)', '', x).strip(' .')
        x = re.sub(r'^and\s+', '', x)
        if x:
            items.append(x)
    return items


def generic_pieces(label):
    """Two-item pieces for a label that lists more than two items, else None."""
    m = re.search(r'\(([^()]*,[^()]*)\)\s*$', label)
    if m and (label.find(':') == -1 or label.find(':') > m.start()):
        items = tidy_items(top_level_commas(m.group(1)))
        prefix = re.sub(r'\s+\d+-\d+$', '', label[:m.start()].strip())
    elif ':' in label:
        prefix, tail = label.split(':', 1)
        items = tidy_items(top_level_commas(tail))
        prefix = prefix.strip()
    else:
        return None
    if len(items) <= 2:
        return None
    return pairs(prefix, items)


def split_map(subject, specs):
    import subprocess
    orig = json.loads(subprocess.check_output(
        ['git', 'show', f'HEAD:scripts/knowledge_map_{subject}_other.json'], cwd=os.path.join(HERE, '..')).decode('utf8'))
    orig_label = {n['id']: n['label'] for n in orig['nodes']}
    with open(os.path.join(HERE, f'_db_export_{subject}.json'), encoding='utf8') as fh:
        data = json.load(fh)
    nodes = data['nodes']

    new_nodes, entry, exit_, chains = [], {}, {}, {}
    for n in nodes:
        spec = FORCE.get(subject, {}).get(n['id'])
        if n['label'] == spec[0] if spec else False:
            spec = None
        spec = spec or (specs.get(n['id']) if n['label'] == orig_label.get(n['id']) else None)
        spec = spec or generic_pieces(n['label'])
        if not spec or n['label'] == spec[0]:
            new_nodes.append(n)
            continue
        ids = [n['id']] + [f"{n['id']}__{k}" for k in range(2, len(spec) + 1)]
        chains[n['id']] = ids
        for nid, label in zip(ids, spec):
            piece = dict(n)
            piece['id'], piece['label'] = nid, label
            new_nodes.append(piece)
        entry[n['id']], exit_[n['id']] = ids[0], ids[-1]

    new_edges, seen = [], set()

    def add(src, dst, proto):
        if src == dst or (src, dst) in seen:
            return
        seen.add((src, dst))
        e = dict(proto)
        e['from'], e['to'] = src, dst
        new_edges.append(e)

    for e in data['edges']:
        add(exit_.get(e['from'], e['from']), entry.get(e['to'], e['to']), e)
    for ids in chains.values():
        for a, b in zip(ids, ids[1:]):
            add(a, b, {'difficulty': None})

    concept_keys, collisions = {}, []
    for n in new_nodes:
        key = (clean(n.get('subtopic')), clean(n['label']))
        if key in concept_keys:
            collisions.append(f"{n['id']} vs {concept_keys[key]}: {n['label']}")
        concept_keys[key] = n['id']
    if collisions:
        raise SystemExit(f'{subject}: concept_id collisions: ' + ' | '.join(collisions))

    data['nodes'], data['edges'] = new_nodes, new_edges
    with open(os.path.join(HERE, f'knowledge_map_{subject}_other.json'), 'w', encoding='utf8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'{subject}: split {len(chains)} nodes -> {len(new_nodes)} nodes, {len(new_edges)} edges')


if __name__ == '__main__':
    split_map('spanish', SPANISH)
    split_map('italian', ITALIAN)
