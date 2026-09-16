// Explicit editorial corrections following source and graph review.
module.exports = ({ nodes, edges, section }) => {
  const node = id => { const n = nodes.find(n => n.id === id); if (!n) throw new Error(id); return n; };
  const rename = (id, label) => Object.assign(node(id), { label, objective: label, essentialPoints: [label] });
  const removeEdge = (from, to) => { const index = edges.findIndex(e => e.from === from && e.to === to); if (index >= 0) edges.splice(index, 1); };
  const addEdge = (from, to) => { if (!edges.some(e => e.from === from && e.to === to)) edges.push({ from, to, difficulty: 0.45 }); };
  const remove = id => { nodes.splice(nodes.findIndex(n => n.id === id), 1); for (let i = edges.length - 1; i >= 0; i--) if (edges[i].from === id || edges[i].to === id) edges.splice(i, 1); };
  // Honest foundations, rather than artificial observation-to-everything gates.
  for (const id of ['organism', 'particle', 'energy', 'ethics']) removeEdge('observation', id);
  Object.assign(node('organism'), { rootReason: 'A living individual is a foundational observational definition.' });
  Object.assign(node('particle'), { rootReason: 'The particulate description of matter grounds the course chemistry without presupposing another biology concept.' });
  Object.assign(node('energy'), { rootReason: 'Energy transfer is a foundational scientific idea used throughout the course.' });
  Object.assign(node('ethics'), { rootReason: 'Ethical judgement is a foundational distinction from empirical observation.' });
  rename('nucleus', 'The nucleus encloses a eukaryotic cell\'s genetic material');
  section('1.1 Cell structure', '4.1.1.2', 'nucleus_control|Nuclear genetic information controls cell activities|nucleus,gene');
  rename('stem_cell', 'A stem cell is an undifferentiated cell capable of producing specialised cells');
  section('1.2 Cell division', '4.1.2.3', 'stem_selfrenew|Stem cells can divide to make more undifferentiated stem cells|stem_cell,mitosis');
  rename('heart', 'The heart is a muscular organ that pumps blood');
  section('2.2 Animal tissues, organs and organ systems', '4.2.2.2', 'double_circulation|Blood passes through the heart twice in one complete body-and-lung circuit|right_ventricle,left_ventricle');
  for (const id of ['amylase_sites', 'protease_sites', 'lipase_sites']) remove(id);
  section('2.2 Animal tissues, organs and organ systems', '4.2.2.1', `
amylase_pancreas|The pancreas produces amylase|pancreas_digest,amylase
amylase_intestine|The small intestine produces amylase|small_intestine,amylase
protease_stomach|The stomach produces proteases|stomach,protease
protease_pancreas|The pancreas produces proteases|pancreas_digest,protease
protease_intestine|The small intestine produces proteases|small_intestine,protease
lipase_pancreas|The pancreas produces lipases|pancreas_digest,lipase
lipase_intestine|The small intestine produces lipases|small_intestine,lipase
`);
  addEdge('amylase', 'salivary');
  rename('mechanical_valve', 'A mechanical replacement valve restores one-way blood flow');
  section('2.2 Animal tissues, organs and organ systems', '4.2.2.4', 'e_mechanical_valve|Mechanical heart valves may require long-term anticoagulants|mechanical_valve,platelet');
  rename('ovary', 'Ovaries are the organs where egg cells mature');
  rename('testes', 'Testes are the organs that produce sperm');
  removeEdge('hormone', 'ovary'); removeEdge('hormone', 'testes');
  section('5.3 Hormonal coordination in humans', '4.5.3.1,4.5.3.4', `
ovary_oestrogen|Ovaries produce oestrogen|ovary,hormone
testes_testosterone|Testes produce testosterone|testes,hormone
`);
  addEdge('ovary_oestrogen', 'oestrogen_lining'); addEdge('testes_testosterone', 'testosterone');
  rename('iud', 'A non-hormonal intrauterine device reduces the chance of pregnancy');
  node('iud').objective = 'Explain the specification model of a non-hormonal intrauterine device preventing implantation; do not introduce hormonal IUS action into this node.';
  node('iud').essentialPoints = [node('iud').objective];
  section('5.3 Hormonal coordination in humans', '4.5.3.5', 'ius|A hormonal intrauterine system releases contraceptive hormone locally|contraception,progesterone_contraceptive');
  remove('photo_symbols');
  section('4.1 Photosynthesis', '4.4.1.1', `
symbol_co2|CO2 represents carbon dioxide|particle
symbol_water|H2O represents water|particle
symbol_oxygen|O2 represents oxygen|particle
symbol_glucose|C6H12O6 represents glucose|carbohydrate
`);
  rename('p_seedlings', 'Setting up seedlings under controlled one-sided illumination');
  removeEdge('gravitropism', 'p_seedlings');
  section('5.4 Plant hormones', '4.5.4.1,8.2.8', `
p_seedlings_gravity|Orienting seedlings to test a response to gravity while controlling light|gravitropism,control,p_ethics_organism
a_root_gravity|Explaining measured downward root growth using auxin|p_seedlings_gravity,p_seedling_length,p_seedling_drawing,root_bend
a_shoot_gravity|Explaining measured upward shoot growth using auxin|p_seedlings_gravity,p_seedling_length,p_seedling_drawing,shoot_gravity
`, [8]);
  remove('a_seedling_gravity');
  // Measurement/drawing are reusable across the two alternative investigations.
  removeEdge('p_seedlings', 'p_seedling_length'); removeEdge('p_seedlings', 'p_seedling_drawing');
  addEdge('organism', 'p_seedling_length'); addEdge('organism', 'p_seedling_drawing');
  addEdge('p_seedlings', 'a_seedling_light');
  rename('e_contraception', 'Contraceptive choices involve ethical and personal values');
  removeEdge('risk', 'e_contraception');
  section('5.3 Hormonal coordination in humans', '4.5.3.5', `
a_contraceptive_effectiveness|Comparing contraceptive effectiveness using supplied failure-rate data|contraception,probability
e_contraceptive_effects|Evaluating a specified contraceptive side effect against its benefit|contraception,risk
`);
  rename('deforest_carbon', 'Removing forests reduces photosynthetic carbon-dioxide uptake');
  removeEdge('carbon_combustion', 'deforest_carbon');
  section('7.3 Biodiversity and human interaction', '4.7.3.4', 'deforest_release|Burning or decomposing felled trees releases stored carbon dioxide|deforest_food,carbon_combustion,decay_carbon');
  // Remove an inaccurate suggestion that pathogenicity is required to learn a fungal cell.
  section('1.1 Cell structure', '4.1.1.1,4.3.1.1', 'fungus|Fungi are organisms with eukaryotic cells|eukaryote');
  for (const id of ['fungal_spores', 'fungal_sexual', 'penicillin']) { removeEdge('fungus_pathogen', id); addEdge('fungus', id); }
  addEdge('fungus', 'fungus_pathogen');
  rename('gonorrhoea', 'Gonorrhoea is a bacterial sexually transmitted infection');
  removeEdge('bacterial_toxin', 'gonorrhoea'); addEdge('prokaryote', 'gonorrhoea');
  section('3.1 Communicable diseases', '4.3.1.3', 'gonorrhoea_symptoms|Gonorrhoea can cause thick coloured discharge and painful urination|gonorrhoea');
  // Medical/biological procedures must not silently inherit an unrelated mechanism.
  removeEdge('fermentation', 'biogas'); addEdge('respiration', 'biogas');
  rename('phylum', 'A phylum is a traditional classification rank below kingdom');
  rename('class', 'A class is a traditional classification rank below phylum');
  rename('order', 'An order is a traditional classification rank below class');
  rename('family', 'A family is a traditional classification rank below order');
  rename('genus', 'A genus groups closely related species below the family rank');
  for (const [from, to] of [['artery','chd'], ['gene','genes_chromosomes'], ['p_ivf_stimulate','e_ivf_stress']]) addEdge(from, to);
  section('0.1 Working scientifically', 'WS 1.2', 'a_test_model|Testing a model prediction against an observation|model,p_hypothesis,observation');
  section('0.1 Working scientifically', 'WS 3.6', 'a_compare_hypotheses|Comparing two hypotheses against the same evidence|a_hypothesis');
  section('0.1 Working scientifically', 'WS 1.5', `
e_voluntary_risk|People may accept voluntary risks more readily than imposed risks|risk
e_familiar_risk|Familiar risks may be perceived as smaller than unfamiliar risks|risk
e_visible_risk|Visibility can affect the perception of a hazard|risk
`);
  section('0.1 Working scientifically', 'WS 2.5', 'p_choose_sample|Choosing a sampling method that represents a specified population|representative,p_random_sample');
  section('0.2 Mathematical skills', 'MS 3a', `
symbol_equal|The equals sign states that two quantities are equal|measurement
symbol_less|The less-than sign compares a smaller quantity with a larger one|measurement
symbol_greater|The greater-than sign compares a larger quantity with a smaller one|measurement
symbol_muchless|A double less-than sign means much less than|symbol_less
symbol_muchgreater|A double greater-than sign means much greater than|symbol_greater
symbol_proportion|The proportionality symbol expresses a proportional relationship|proportional
symbol_approx|The approximation symbol indicates an approximate equality|estimate
linear_equation|In y equals mx plus c, m is gradient and c is the y-intercept|gradient,intercept
`);
  section('1.1 Cell structure', '4.1.1.2', 'a_estimate_cell|Estimating relative cell-structure size from an image|a_cell_image,estimate,ratio');
  section('6.1 Reproduction', '4.6.1.4', 'human_genome_study|The human genome has been studied to map human genetic information|genome');
  // Narrow broad section references to the actual source statements used by a node.
  function refs(start, end, reference) {
    const a = nodes.findIndex(n => n.id === start), b = nodes.findIndex(n => n.id === end);
    if (a < 0 || b < a) throw new Error('Bad source range ' + start + ' - ' + end);
    for (let i = a; i <= b; i++) nodes[i].specRefs = reference.split(',');
  }
  const ranges = [
    ['observation','e_evidence_limits','WS 1.1,WS 1.2'], ['ethics','e_technology','WS 1.3,WS 1.4'], ['hazard','e_risk_perception','WS 1.5'], ['peer_review','e_media','WS 1.6'],
    ['variable','p_hypothesis','WS 2.1,WS 2.2'], ['p_instrument','p_instrument','WS 2.3'], ['p_risk','p_risk','WS 2.4'], ['sample','p_random_sample','WS 2.5'], ['e_validity','e_validity','WS 2.7'],
    ['measurement','resolution_measure','WS 2.6'], ['accuracy','systematic_error','WS 3.7'], ['uncertainty','uncertainty','WS 3.4'], ['anomaly','e_repeats','WS 3.7'], ['a_range_uncertainty','a_range_uncertainty','WS 3.4'], ['p_table','p_table','WS 3.1'], ['a_trend','a_trend','WS 3.5'], ['a_hypothesis','a_hypothesis','WS 3.6'], ['e_causation','e_causation','WS 3.5'], ['a_report','a_report','WS 3.8'],
    ['ratio','rate','MS 1c'], ['standard_form','standard_form','MS 1b'], ['order_magnitude','order_magnitude','MS 2h'], ['unit_conversion','unit_conversion','WS 4.3,WS 4.4,WS 4.5'], ['sig_fig','sig_fig','MS 2a'], ['estimate','estimate','MS 1d'], ['mean','mode','MS 2b,MS 2f'], ['range','range','WS 3.3'], ['probability','probability','MS 2e'], ['p_frequency','p_histogram','MS 2c'], ['p_graph_axes','p_best_fit','MS 4c'], ['correlation','correlation','MS 2g'], ['a_interpolate','a_extrapolate','MS 4a'], ['gradient','intercept','MS 4d'], ['p_tangent','a_graph_area','WS 3.3'], ['substitute','rearrange','MS 3d'], ['proportional','inverse','MS 3a'], ['area','sa_volume','MS 5c'],
    ['p_scale','p_timer','AT 1'], ['p_thermometer','p_thermometer','AT 1'], ['p_waterbath','p_waterbath','AT 2'], ['p_ph','p_ph','AT 1'], ['p_calibrate','p_calibrate','WS 3.7'], ['p_ethics_organism','p_ethics_organism','AT 4'], ['p_biological_drawing','p_label_drawing','AT 7'],
    ['energy','photo_endothermic','4.4.1.1'], ['photo_light','e_greenhouse','4.4.1.2'], ['glucose_respiration','glucose_amino','4.4.1.3'], ['respiration','resp_warmth','4.4.2.1'], ['exercise_heart','lactate_liver','4.4.2.2'], ['metabolism','urea','4.4.2.3'],
    ['nerve_impulse','e_reflex','4.5.2.1'], ['brain','e_brain_delicate','4.5.2.2'], ['hormone','pituitary','4.5.3.1'], ['pancreas_glucose','a_glucose_feedback','4.5.3.2'], ['water_lungs','e_kidney_rejection','4.5.3.3'], ['puberty','a_cycle_graph','4.5.3.4'], ['contraception','e_contraception','4.5.3.5'], ['fertility_drug','e_ivf_ethics','4.5.3.6'], ['adrenal','a_thyroxine_feedback','4.5.3.7'], ['auxin','ethene_divide','4.5.4.1'], ['auxin_weed','gibberellin_fruit','4.5.4.2'],
    ['gamete','asexual','4.6.1.1'], ['meiosis_copy','embryo_develop','4.6.1.2'], ['sexual_variation','bulb','4.6.1.3'], ['dna_helix','genome_migration','4.6.1.4'], ['nucleotide','noncoding_variant','4.6.1.5'], ['inheritance','a_pedigree','4.6.1.6'], ['polydactyly','e_embryo_screen','4.6.1.7'], ['human_chromosomes','a_sex_cross','4.6.1.8'],
    ['variation','new_variant','4.6.2.1'], ['species','common_ancestor','4.6.2.2'], ['selective_breeding','inbreeding','4.6.2.3'], ['genetic_engineering','e_gm_health','4.6.2.4'], ['tissue_culture','e_clone_welfare','4.6.2.5'], ['darwin','e_lamarck','4.6.3.1'], ['wallace','speciation','4.6.3.2'], ['mendel','dna_discovery','4.6.3.3'], ['fossil','a_fossil_change','4.6.3.5'], ['extinction','extinct_catastrophe','4.6.3.6'], ['resistant_mutation','e_antibiotic_develop','4.6.3.7'],
    ['population','stable_community','4.7.1.1'], ['abiotic','abiotic_oxygen','4.7.1.2'], ['biotic','biotic_competitor','4.7.1.3'], ['adaptation','extremophile','4.7.1.4'], ['material_cycle','water_plant','4.7.2.2'], ['decomposition','biogas','4.7.2.3'], ['environment_distribution','human_distribution','4.7.2.4'],
    ['biodiversity','biodiversity_stability','4.7.3.1'], ['human_resource','pollution_biodiversity','4.7.3.2'], ['habitat_build','e_peat','4.7.3.3'], ['deforest_food','deforest_carbon','4.7.3.4'], ['greenhouse_gas','climate_consensus','4.7.3.5'], ['conserve_breed','e_conservation','4.7.3.6'], ['trophic_level','apex','4.7.4.1'], ['biomass_pyramid','a_pyramid','4.7.4.2'], ['light_efficiency','e_trophic_numbers','4.7.4.3'], ['food_security','food_conflict','4.7.5.1'], ['farm_movement','e_farm_welfare','4.7.5.2'], ['sustainable_fish','fish_quota','4.7.5.3'], ['mycoprotein','golden_rice','4.7.5.4']
  ];
  ranges.forEach(([a,b,r]) => refs(a,b,r));
  node('a_fossil_change').specRefs.push('4.6.3.4');
  node('resistant_bacteria').specRefs.push('4.6.3.4');
  // Magnification arithmetic and population doubling are reusable calculations,
  // not interpretations of data the student must first generate in a practical.
  for (const id of ['a_size','a_bacterial_population']) {
    node(id).practicalIds = [];
    node(id).specRefs = node(id).specRefs.filter(ref=>!ref.startsWith('8.2.'));
  }
  remove('a_cell_image'); remove('a_microscope_structure');
  addEdge('cell','a_estimate_cell'); addEdge('p_focus','a_estimate_cell');
  const structures = [['nucleus','nucleus'],['cytoplasm','cytoplasm'],['membrane','cell membrane'],['mitochondrion','mitochondrion'],['ribosome','ribosome'],['chloroplast','chloroplast'],['vacuole','permanent vacuole'],['cellulose_wall','cellulose cell wall'],['plasmid','plasmid']];
  for (const [id,label] of structures) {
    section('1.1 Cell structure','4.1.1.2',`a_image_${id}|Recognising the ${label} in a supplied cell representation|${id},p_label_drawing`);
  }
  section('1.1 Cell structure','4.1.1.2,8.2.1','a_light_nucleus|Identifying a nucleus in an observed stained cell|nucleus,p_focus,p_stain',[1]);
  // Store explicit supporting detail scope where one distinction needs several
  // conditions: no more than four, all still belong to one biological idea.
  node('osmosis').essentialPoints = ['Net movement of water','From dilute to more concentrated solution','Across a partially permeable membrane'];
  node('diffusion').essentialPoints = ['Net particle movement','Down a concentration gradient'];
  node('active_transport').essentialPoints = ['Movement against a concentration gradient','Requires energy from respiration'];
  rename('p_loop','Sterilising an inoculating loop in a flame');
  section('1.1 Cell structure','4.1.1.6,8.2.2',`
p_loop_cool|Cooling a sterilised inoculating loop before touching a culture|p_loop
e_loop_heat|A hot inoculating loop can kill the transferred microorganisms|p_loop_cool,bacteria_growth
e_tape_contamination|Securing the lid reduces contamination of an inoculated plate|p_tape,aseptic
e_sealed_plate|Avoiding an airtight seal reduces conditions favouring harmful anaerobic bacteria|p_tape,pathogen,respiration
`,[2]);
  removeEdge('p_loop','p_inoculate'); addEdge('p_loop_cool','p_inoculate');
  section('2.2 Animal tissues, organs and organ systems','4.2.2.1,8.2.4','p_food_blank|Running the chosen food-test reagent on a known negative sample|food_test,p_volume,control',[4]);
  addEdge('p_food_blank','e_food_control');
  // Plant chemical signalling does not require animal glands or a bloodstream.
  section('5.4 Plant hormones','4.5.4.1','plant_hormone|Plant hormones are chemical messengers coordinating growth and responses|organism,reaction');
  for (const id of ['auxin','gibberellin','ethene_ripen','ethene_divide']) {
    removeEdge('hormone',id); addEdge('plant_hormone',id);
  }
};
