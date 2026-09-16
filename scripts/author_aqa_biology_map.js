// Source-grounded curriculum authoring. No API calls, no database writes.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { validate } = require('./build_aqa_biology_map');
const nodes = [], edges = [];
const themes = ['Scientific and mathematical skills', 'Cell biology', 'Organisation', 'Infection and response', 'Bioenergetics', 'Homeostasis and response', 'Inheritance, variation and evolution', 'Ecology'];
function section(subtopic, ref, rows, practicalIds = []) {
  const topic = Number(subtopic[0]);
  for (const row of rows.trim().split('\n')) {
    const [id, label, prerequisites = '', objective = label] = row.trim().split('|');
    if (!id || !label) throw new Error('Malformed curriculum row: ' + row);
    const kind = id.startsWith('p_') ? 'procedure' : id.startsWith('a_') ? 'application' : id.startsWith('e_') ? 'evaluation' : 'concept';
    nodes.push({ id, label, subtopic, theme: `Topic ${topic} - ${themes[topic]}`, difficulty: kind === 'evaluation' ? 0.65 : kind === 'application' ? 0.6 : kind === 'procedure' ? 0.4 : prerequisites.split(',').filter(Boolean).length > 1 ? 0.45 : 0.25, objective, essentialPoints: [objective], specRefs: ref.split(','), kind, practicalIds });
    for (const from of prerequisites.split(',').filter(Boolean)) edges.push({ from, to: id, difficulty: kind === 'application' || kind === 'evaluation' ? 0.6 : 0.35 });
  }
}
section('0.1 Working scientifically', 'WS 1.1,WS 1.2,WS 1.3,WS 1.4,WS 1.5,WS 1.6', `
observation|An observation is recorded evidence about the world
model|A scientific model represents selected features of reality|observation
hypothesis|A hypothesis is a testable explanation|observation,model
theory_revision|New evidence can change scientific explanations|hypothesis
e_model_limits|A model is limited by its assumptions|model
e_evidence_limits|Insufficient evidence limits scientific conclusions|observation
ethics|Ethical judgements concern what ought to be done|observation
e_technology|Weighing evidence of a technology's benefit against a specified harm|ethics,observation
hazard|A hazard is a potential source of harm|observation
risk|Risk combines likelihood and severity of harm|hazard
e_risk_perception|Perceived risk can differ from measured risk|risk
peer_review|Peer review checks scientific work before publication|observation
e_media|Scientific media claims may omit evidence or be biased|peer_review
`);
section('0.1 Working scientifically', 'WS 2.1,WS 2.2,WS 2.3,WS 2.4,WS 2.5,WS 2.6,WS 2.7', `
variable|A variable is a quantity or condition that can change|observation
independent|An independent variable is deliberately changed or selected|variable
dependent|A dependent variable is measured as the outcome|variable
control|Control variables are kept constant for a valid comparison|independent,dependent
p_hypothesis|Making a prediction from a hypothesis|hypothesis,independent,dependent
p_instrument|Selecting an instrument with suitable resolution|measurement,resolution_measure
p_risk|Reducing a specified experimental risk|risk
sample|A sample is a subset of a population|observation
representative|A representative sample reflects the population|sample
p_random_sample|Random selection reduces sampling bias|representative
e_validity|Checking whether a method tests its intended variable|control,hypothesis
`);
section('0.1 Working scientifically', 'WS 3.1,WS 3.2,WS 3.3,WS 3.4,WS 3.5,WS 3.6,WS 3.7,WS 3.8,WS 4.1,WS 4.2', `
measurement|A measurement expresses a quantity using a unit|observation
resolution_measure|Instrument resolution is its smallest distinguishable change|measurement
accuracy|Accuracy is closeness to the true value|measurement
precision|Precision describes how closely repeated measurements agree|measurement
repeatability|Repeatable results agree for the same investigator and method|precision
reproducibility|Reproducible results agree across investigators or equipment|precision
random_error|Random error causes unpredictable variation in measurements|measurement
systematic_error|Systematic error consistently biases measurements|accuracy
uncertainty|A measurement has a range of possible values|measurement
anomaly|An anomalous result does not fit the pattern of other results|observation
e_anomaly|Investigating an anomaly before deciding whether to exclude it|anomaly,accuracy
p_repeats|Repeating a measurement to estimate a representative mean|random_error,mean
e_repeats|Repeats reduce random error but do not remove systematic bias|p_repeats,systematic_error
a_range_uncertainty|Using the spread of repeat readings to estimate uncertainty|range,uncertainty
p_table|Recording measurements in a table with headings and units|measurement,independent,dependent
a_trend|Describing a trend using evidence from data|p_table
a_hypothesis|Judging whether data support a hypothesis|a_trend,hypothesis
e_causation|Correlation alone does not establish causation|correlation,control
a_report|Supporting a scientific conclusion with relevant evidence|a_hypothesis
`);
section('0.2 Mathematical skills', 'MS 1a,MS 1b,MS 1c,MS 1d,MS 2a,MS 2b,MS 2c,MS 2d,MS 2e,MS 2f,MS 2g,MS 2h,MS 3a,MS 3b,MS 3c,MS 3d,MS 4a,MS 4b,MS 4c,MS 4d,MS 5a,MS 5b,MS 5c,WS 4.3,WS 4.4,WS 4.5,WS 4.6', `
ratio|A ratio compares quantities by division|measurement
percentage|A percentage expresses a proportion out of 100|ratio
percentage_change|Percentage change is change divided by starting value times 100|percentage
percentile|A percentile gives position within an ordered distribution|percentage
rate|A rate is change per unit time|ratio
standard_form|Writing a quantity as a number from 1 to 10 times a power of ten|measurement
order_magnitude|Comparing quantities by powers of ten|standard_form,ratio
unit_conversion|Converting units using their powers-of-ten scale factors|standard_form
sig_fig|Rounding a result to an appropriate number of significant figures|measurement
estimate|Using rounded quantities to check an answer's order of magnitude|order_magnitude
mean|The arithmetic mean is the sum divided by the number of values|ratio
median|The median is the middle value of ordered data|measurement
mode|The mode is the most frequent value|measurement
range|The range is the largest value minus the smallest|measurement
probability|Probability expresses the chance of an outcome|ratio
p_frequency|Counting occurrences in a frequency table|measurement
p_bar|Drawing a bar chart for categorical data|p_frequency
p_histogram|Drawing a histogram for continuous grouped data|p_frequency
p_graph_axes|Choosing graph axes with labelled units and appropriate scales|independent,dependent,measurement
p_plot|Plotting coordinates on chosen graph axes|p_graph_axes
p_best_fit|Drawing an appropriate line or curve of best fit|p_plot,anomaly
correlation|Recognising correlation in a scatter plot|p_plot
a_interpolate|Reading an intermediate value from a graph|p_best_fit
a_extrapolate|Recognising uncertainty in predictions beyond measured data|p_best_fit,uncertainty
gradient|Calculating a straight-line gradient as change in y over change in x|p_plot,ratio
intercept|Reading the value where a line meets an axis|p_plot
p_tangent|Drawing a tangent to a curve at a point|p_best_fit
a_tangent_rate|Using a tangent's gradient to find an instantaneous rate|p_tangent,gradient,rate
a_graph_area|Estimating area under a graph by counting squares|p_plot,area
substitute|Substituting values with consistent units into an equation|unit_conversion
rearrange|Rearranging an equation to isolate an unknown|substitute
proportional|Recognising direct proportionality|ratio,p_plot
inverse|Recognising inverse proportionality|ratio,p_plot
area|Calculating an area from measured lengths|measurement
circle_area|Calculating a circle's area using pi times radius squared|area,substitute
volume|Calculating a volume from measured lengths|measurement
sa_volume|Calculating a surface-area-to-volume ratio|area,volume,ratio
`);
section('0.1 Working scientifically', 'AT 1,AT 2,AT 3,AT 4,AT 5,AT 6,AT 7,AT 8,WS 2.4', `
p_scale|Reading a scale at eye level|measurement,resolution_measure
p_balance|Zeroing a balance before measuring mass|measurement,systematic_error
p_volume|Reading liquid volume at the meniscus|p_scale
p_timer|Measuring an interval with a stopwatch|measurement
p_thermometer|Reading a thermometer after equilibration|p_scale
p_waterbath|Maintaining a chosen temperature using a water bath|p_thermometer,control,p_risk
p_ph|Measuring the pH of a solution|p_scale,ph
p_calibrate|Checking an instrument against a known standard|systematic_error
p_ethics_organism|Minimising harm when investigating living organisms|ethics,risk,organism
p_biological_drawing|Drawing a clear proportional biological outline|observation,ratio
p_label_drawing|Adding unambiguous label lines to a biological drawing|p_biological_drawing
`);
section('1.1 Cell structure', '4.1.1.1,4.1.1.2', `
organism|An organism is an individual living thing|observation
cell|Cells are the basic structural units of organisms|organism
membrane|The cell membrane controls movement into and out of a cell|cell
cytoplasm|Cytoplasm is where many cellular reactions occur|cell,reaction
nucleus|The nucleus encloses genetic material and controls cell activities|cell,dna
mitochondrion|Mitochondria are the site of most aerobic respiration|cell,aerobic
ribosome|Ribosomes are the site of protein synthesis|cell,protein
chloroplast|Chloroplasts contain chlorophyll for photosynthesis|cell,photosynthesis
vacuole|A permanent vacuole contains cell sap|cell
cellulose_wall|A cellulose cell wall strengthens plant and algal cells|cell,carbohydrate
eukaryote|Eukaryotic cells enclose their genetic material in a nucleus|nucleus
prokaryote|Prokaryotic cells have a DNA loop outside a nucleus|cell,dna,nucleus
plasmid|A plasmid is a small additional ring of bacterial DNA|prokaryote
bacterial_wall|The bacterial cell wall surrounds its membrane|prokaryote,membrane
cell_size|Bacterial cells are typically smaller than plant and animal cells|prokaryote,eukaryote,order_magnitude
a_cell_image|Identifying a cell structure from its appearance in an image|cell,p_label_drawing
`);
section('1.1 Cell structure', '4.1.1.3,4.1.1.4', `
specialised|A specialised cell has structures suited to its function|cell
sperm_tail|A sperm cell's tail enables movement towards an egg|specialised
sperm_mito|Mitochondria supply energy for sperm movement|sperm_tail,mitochondrion
sperm_acrosome|Acrosome enzymes help sperm penetrate an egg|specialised,enzyme
nerve_axon|A long nerve-cell axon carries impulses over distance|specialised,nerve_impulse
nerve_branches|Branched nerve-cell endings connect with other cells|specialised
muscle_contract|Contractile structures allow muscle cells to shorten|specialised,protein
muscle_mito|Many mitochondria support the energy demands of muscle contraction|muscle_contract,mitochondrion
root_hair_area|A root-hair extension increases the surface for absorption|specialised,area
differentiation|Differentiation develops a cell's specialised structures|specialised
animal_diff|Most animal cell differentiation occurs early in development|differentiation
plant_diff|Many plant cells retain differentiation capacity throughout life|differentiation
adult_division|Adult animal cell division mainly repairs and replaces cells|mitosis,animal_diff
`);
section('1.1 Cell structure', '4.1.1.5,8.2.1', `
magnification|Magnification is image size divided by actual size|ratio
resolution_micro|Microscope resolution distinguishes two nearby points|observation
electron_magnification|Electron microscopes achieve greater magnification than light microscopes|magnification
electron_resolution|Higher electron-microscope resolution reveals finer cell detail|resolution_micro,cell
a_size|Calculating actual size from magnification and image size|magnification,rearrange,unit_conversion
p_slide|Preparing a thin specimen under a coverslip|cell,p_risk
p_stain|Applying a suitable stain to improve specimen contrast|p_slide
p_focus|Focusing a light microscope starting at low power|p_slide,magnification
p_microscope_power|Changing to higher magnification and refocusing carefully|p_focus,magnification
a_microscope_structure|Identifying a taught cell structure in a microscope image|p_focus,a_cell_image
p_scale_bar|Adding a magnification scale to a specimen drawing|p_biological_drawing,magnification,a_size
e_microscope|A specimen that is too thick obscures overlapping cells|p_slide,resolution_micro
`, [1]);
section('1.1 Cell structure', '4.1.1.6,8.2.2', `
binary_fission|Binary fission divides one bacterial cell into two|prokaryote
bacteria_growth|Nutrients and suitable temperature permit bacterial multiplication|binary_fission
a_bacterial_population|Calculating population after repeated bacterial divisions|binary_fission,standard_form,substitute
culture_medium|Nutrient broth or agar supports growth of microorganisms|bacteria_growth
aseptic|Aseptic technique prevents contamination by unwanted microorganisms|culture_medium
p_sterilise_media|Sterilising culture media and Petri dishes before inoculation|aseptic,p_risk
p_loop|Flaming and cooling an inoculating loop before transfer|aseptic,p_risk
p_inoculate|Transferring a culture while minimising lid opening|p_loop,p_sterilise_media
p_tape|Securing a culture lid with tape without sealing it completely|p_inoculate
p_invert|Incubating an agar plate upside down|p_inoculate
e_condensation|Inverting plates prevents condensation spreading colonies|p_invert,culture_medium
p_incubate|Keeping school bacterial cultures at or below 25 degrees Celsius|p_inoculate,p_thermometer
e_incubation|Low incubation temperature reduces growth of human pathogens|p_incubate,pathogen
p_discs|Placing antibiotic or antiseptic discs on an inoculated agar plate|p_inoculate,antibiotic,control
p_zone|Measuring the diameter of a clear inhibition zone|p_discs,p_scale
a_zone_area|Calculating inhibition-zone area from measured diameter|p_zone,circle_area,antibiotic
a_antimicrobial|Comparing antimicrobial effectiveness using inhibition-zone data|p_zone,antibiotic
e_discs|Keeping disc concentration consistent for a valid comparison|p_discs,control
`, [2]);
section('1.2 Cell division', '4.1.2.1,4.1.2.2', `
dna|DNA is the molecule carrying genetic information|cell
gene|A gene is a section of DNA coding for a protein|dna,protein
chromosome|A chromosome is a long DNA molecule carrying many genes|gene
chromosome_pairs|Body-cell chromosomes are normally found in pairs|chromosome
cell_growth|Before division a cell grows and increases its subcellular structures|cell
dna_replication|Before division DNA is copied to form two copies of each chromosome|chromosome
mitosis|Mitosis separates chromosome copies into two identical nuclei|dna_replication,nucleus
cytokinesis|Division of cytoplasm and membrane produces two daughter cells|mitosis,membrane,cytoplasm
growth_mitosis|Mitosis enables growth by increasing cell number|cytokinesis,organism
`);
section('1.2 Cell division', '4.1.2.3', `
stem_cell|A stem cell can self-renew and produce differentiated cells|differentiation,mitosis
embryonic_stem|Embryonic stem cells can differentiate into most human cell types|stem_cell
adult_stem|Bone-marrow stem cells can produce blood cells|stem_cell,blood
meristem|Plant meristem cells retain the capacity to form different cell types|stem_cell,plant_diff
stem_treatment|Stem cells can replace damaged specialised cells|stem_cell
therapeutic_clone|Therapeutic cloning creates embryonic cells with the patient's genes|embryonic_stem,gene
e_clone_rejection|Matching genes reduces immune rejection of therapeutic-clone cells|therapeutic_clone,antibody
e_stem_infection|Stem-cell treatment can transfer viral infection|stem_treatment,virus
e_stem_ethics|Embryo destruction creates ethical objections to embryonic stem cells|embryonic_stem,ethics
meristem_clone|Meristem cells can produce genetically identical plants rapidly|meristem,gene
e_rare_clone|Cloning rare plants can help preserve a species|meristem_clone,extinction
e_crop_clone|Cloning preserves a desirable crop characteristic|meristem_clone,inheritance
`);
section('1.3 Transport in cells', '4.1.3.1', `
particle|Matter consists of particles|observation
concentration|Concentration expresses the amount of solute in a given volume|particle,volume
gradient_concentration|A concentration gradient is a difference in concentration|concentration
diffusion|Diffusion is net particle movement down a concentration gradient|gradient_concentration,particle
diffusion_gradient|A steeper concentration gradient increases net diffusion rate|diffusion,rate
diffusion_temperature|Higher temperature increases particle movement and diffusion rate|diffusion
diffusion_area|A larger exchange surface increases diffusion rate|diffusion,area
diffusion_distance|A shorter diffusion path increases diffusion rate|diffusion,measurement
single_exchange|A high surface-area-to-volume ratio supports exchange in single cells|sa_volume,diffusion,cell
multicellular_exchange|Low surface-area-to-volume ratios require specialised exchange systems|single_exchange,organ_system
exchange_blood|Blood flow maintains concentration gradients at exchange surfaces|diffusion_gradient,blood
exchange_ventilation|Ventilation maintains a concentration gradient for gas exchange|diffusion_gradient
gill_area|Gill filaments provide a large gas-exchange surface|diffusion_area
intestinal_villi|Villi increase the intestine's absorption surface|diffusion_area,small_intestine
leaf_airspaces|Leaf air spaces shorten diffusion routes for gases|diffusion_distance,spongy
urea_diffusion|Urea diffuses from cells into blood plasma for excretion|diffusion,urea,plasma
`);
section('1.3 Transport in cells', '4.1.3.2,8.2.3', `
partial_membrane|A partially permeable membrane permits some particles through|membrane,particle
osmosis|Osmosis is net water movement from dilute to concentrated solution through a partially permeable membrane|partial_membrane,concentration,diffusion
p_tissue_cut|Cutting plant-tissue samples to consistent dimensions|control,p_scale,p_risk
p_osmosis_solutions|Preparing a range of labelled salt or sugar concentrations|concentration,p_volume
p_tissue_mass|Measuring plant-tissue mass before and after immersion|p_balance,p_osmosis_solutions,p_tissue_cut,p_timer
p_blot|Blotting surface liquid before weighing immersed tissue|p_tissue_mass
a_mass_change|Calculating percentage mass change in an osmosis experiment|p_blot,percentage_change,osmosis
a_isotonic|Reading the concentration at zero mass change from an osmosis graph|a_mass_change,p_best_fit,osmosis
e_blot|Unremoved surface liquid biases the measured tissue mass|p_blot,systematic_error
`, [3]);
section('1.3 Transport in cells', '4.1.3.3', `
active_transport|Active transport moves substances against a concentration gradient using respiratory energy|gradient_concentration,respiration,membrane
root_ions|Root hairs absorb mineral ions by active transport|active_transport,root_hair_area
gut_sugar|Active transport absorbs sugar against its gradient from gut to blood|active_transport,small_intestine,blood
a_transport_choice|Selecting the transport process for a specified gradient and substance|active_transport,osmosis,diffusion
`);
section('2.1 Principles of organisation', '4.2.1', `
tissue|A tissue is a group of cells with similar structure and function|specialised
organ|An organ comprises tissues working together for a function|tissue
organ_system|An organ system comprises cooperating organs|organ
`);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.1', `
reaction|A chemical reaction changes substances into different substances|particle
protein|Proteins are molecules built from amino acids|particle
carbohydrate|Carbohydrates include sugars and polymers such as starch|particle
lipid|Lipids include fats built from glycerol and fatty acids|particle
ph|pH indicates how acidic or alkaline a solution is|concentration
enzyme|An enzyme is a biological catalyst that speeds a reaction without being used up|reaction,protein
active_site|An enzyme's active site fits its specific substrate|enzyme
lock_key|The lock-and-key model explains enzyme specificity|active_site,model
enzyme_temp|Increasing temperature increases enzyme reaction rate up to the optimum|enzyme,rate
denaturation|Denaturation changes the active-site shape so substrate no longer fits|active_site
enzyme_hot|Excess heat reduces enzyme activity by denaturation|enzyme_temp,denaturation
enzyme_ph|Departure from optimum pH reduces enzyme activity|ph,denaturation
digestion|Digestion breaks large food molecules into small soluble molecules|reaction
absorption|Soluble digested molecules pass into the blood|digestion,blood
small_intestine|The small intestine is a major site of digestion and absorption|organ,digestion,absorption
stomach|The stomach mixes food with acid and digestive enzymes|organ,digestion,enzyme,ph
pancreas_digest|The pancreas releases digestive enzymes into the small intestine|enzyme,small_intestine
salivary|Salivary glands secrete amylase into the mouth|enzyme,organ
amylase|Amylase breaks down starch into sugars|enzyme,carbohydrate,digestion
amylase_sites|Amylase is produced in salivary glands, pancreas and small intestine|amylase,salivary,pancreas_digest,small_intestine
protease|Proteases break proteins into amino acids|protein,enzyme,digestion
protease_sites|Proteases are produced in the stomach, pancreas and small intestine|protease,stomach,pancreas_digest,small_intestine
lipase|Lipases break lipids into glycerol and fatty acids|lipid,enzyme,digestion
lipase_sites|Lipases are produced in the pancreas and small intestine|lipase,pancreas_digest,small_intestine
bile_made|The liver produces bile|organ
bile_stored|The gall bladder stores bile|bile_made,organ
bile_neutralise|Alkaline bile neutralises stomach acid entering the intestine|bile_made,stomach,ph
bile_emulsify|Bile emulsifies fat into smaller droplets|bile_made,lipid
bile_lipase|Emulsification increases the surface available for lipase action|bile_emulsify,lipase,area
digestion_build|Absorbed digestion products are used to build new biological molecules|absorption,protein,lipid,carbohydrate
`);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.1,8.2.4', `
food_test|A qualitative food test identifies presence rather than amount|observation
p_benedict|Heating a sample with Benedict's reagent in a water bath|food_test,p_waterbath,p_volume
a_benedict|A Benedict's colour change or precipitate indicates reducing sugar|p_benedict,carbohydrate
p_iodine|Adding iodine solution to a food sample|food_test,p_volume
a_iodine|A blue-black iodine result identifies starch|p_iodine,carbohydrate
p_biuret|Adding Biuret reagent to a food sample|food_test,p_volume,p_risk
a_biuret|A lilac Biuret result identifies protein|p_biuret,protein
p_lipid|Performing a lipid emulsion test away from ignition sources|food_test,p_risk,p_volume
a_lipid|A cloudy emulsion indicates lipid|p_lipid,lipid
e_food_control|A known negative control checks food-test contamination|food_test,control
`, [4]);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.1,8.2.5', `
p_amylase_ph|Using buffer solutions to vary pH in an amylase investigation|amylase,ph,control,p_volume
p_amylase_temp|Keeping amylase reaction mixtures at a fixed temperature|p_amylase_ph,p_waterbath
p_sample_iodine|Sampling the reaction into iodine at 30-second intervals|p_amylase_temp,p_timer,p_iodine
p_endpoint|Recording the first sample showing no starch remains|p_sample_iodine,a_iodine
a_amylase_rate|Estimating relative amylase rate as one divided by time to endpoint|p_endpoint,amylase,rate
a_amylase_optimum|Identifying optimum pH from amylase-rate data|a_amylase_rate,enzyme_ph,p_best_fit
e_sampling_interval|Shorter sampling intervals improve endpoint-time resolution|p_sample_iodine,resolution_measure
`, [5]);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.2,4.2.2.3', `
blood|Blood is a transport tissue with cells suspended in plasma|tissue
plasma|Plasma carries dissolved substances and suspended blood cells|blood,concentration
red_cell|Red blood cells transport oxygen using haemoglobin|blood,protein
red_biconcave|A biconcave shape increases red-cell exchange surface|red_cell,diffusion_area
red_no_nucleus|No nucleus leaves more room for haemoglobin in red blood cells|red_cell,nucleus
white_cell|White blood cells defend the body against pathogens|blood,pathogen
platelet|Platelets initiate clotting to limit blood loss|blood
heart|The heart pumps blood through a double circulatory system|organ,blood
right_ventricle|The right ventricle pumps blood towards the lungs|heart
left_ventricle|The left ventricle pumps blood around the body|heart
left_wall|A thick left-ventricle wall generates high pressure for body circulation|left_ventricle,muscle_contract
valve|Heart valves prevent backflow of blood|heart
aorta|The aorta carries blood from the left ventricle to the body|left_ventricle
vena_cava|The vena cava returns blood from the body to the right atrium|heart
pulmonary_artery|The pulmonary artery carries blood from the right ventricle to the lungs|right_ventricle
pulmonary_vein|The pulmonary vein returns blood from the lungs to the left atrium|heart
coronary|Coronary arteries supply the heart muscle with oxygenated blood|heart,red_cell
pacemaker|Cells in the right atrium set the natural resting heart rhythm|heart
artificial_pacemaker|An artificial pacemaker corrects an irregular heart rhythm|pacemaker
artery|Thick muscular elastic artery walls withstand high pressure|heart,tissue
vein|Vein valves prevent backflow at low pressure|valve
capillary|Thin capillary walls provide short diffusion paths|blood,diffusion_distance
trachea|The trachea conducts air towards the bronchi|organ
bronchi|The bronchi carry air from the trachea into the lungs|trachea
alveoli|Alveoli provide a large surface for gas exchange|bronchi,diffusion_area
alveolar_wall|Thin alveolar walls shorten the gas diffusion path|alveoli,diffusion_distance
alveolar_blood|Alveolar capillaries maintain gas concentration gradients|alveoli,capillary,exchange_blood
alveolar_ventilation|Ventilation refreshes air in alveoli to sustain gas exchange|alveoli,exchange_ventilation
a_blood_flow|Calculating blood flow as volume per unit time|heart,rate,volume
e_blood_products|Balancing a blood product's benefit against infection risk|blood,pathogen,risk
`);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.4', `
chd|Fatty deposits narrow coronary arteries|coronary,lipid
chd_oxygen|Reduced coronary flow deprives heart muscle of oxygen|chd,aerobic
stent|A stent holds a narrowed coronary artery open|chd
e_stent|Stent procedures carry risks including clotting|stent,platelet,risk
statin|Statins lower cholesterol to slow fatty-deposit formation|chd
e_statin|Statin benefits must be weighed against adverse effects and long-term use|statin,risk
leaky_valve|A leaky heart valve allows backward blood flow|valve
narrow_valve|A narrowed heart valve restricts forward blood flow|valve
mechanical_valve|A mechanical replacement valve restores flow but may require anticoagulants|leaky_valve,narrow_valve,platelet
biological_valve|A biological replacement valve can wear out and require replacement|leaky_valve,narrow_valve
transplant_heart|A donor heart can replace a failing heart|heart
e_transplant|Immune rejection limits donor-heart transplantation|transplant_heart,antibody
artificial_heart|An artificial heart can temporarily maintain circulation|heart
e_artificial_heart|Artificial-heart blood contact can increase clotting risk|artificial_heart,platelet
`);
section('2.2 Animal tissues, organs and organ systems', '4.2.2.5,4.2.2.6,4.2.2.7', `
health|Health includes physical and mental wellbeing|organism
noncommunicable|Non-communicable diseases are not transmitted between individuals|health
e_stress|Stress and life circumstances can affect wellbeing|health
immune_defect|Immune-system defects increase susceptibility to infections|white_cell,pathogen
virus_cancer|Some viral infections can trigger cancer|virus,cancer
allergy|An immune response can trigger an allergic condition|antibody
illness_mental|Severe physical illness can impair mental wellbeing|health
risk_factor|A risk factor is associated with increased disease incidence|risk,noncommunicable
e_disease_cost|Disease imposes personal and economic costs|health,e_technology
diet_cvd|An unhealthy diet can increase cardiovascular-disease risk|risk_factor,chd
smoke_cvd|Smoking increases cardiovascular-disease risk|risk_factor,chd
exercise_cvd|Physical activity can reduce cardiovascular-disease risk|risk_factor,chd
obesity_diabetes|Obesity increases the risk of Type 2 diabetes|risk_factor,type2
alcohol_liver|Excess alcohol can damage the liver|risk_factor,organ
alcohol_brain|Alcohol impairs brain function|risk_factor,brain
smoke_lung|Smoking damages lung function|alveoli,risk_factor
smoke_cancer|Smoking increases lung-cancer risk|cancer,risk_factor
smoke_fetus|Smoking in pregnancy can reduce oxygen delivery to the fetus|red_cell,risk_factor
alcohol_fetus|Alcohol in pregnancy can harm fetal development|risk_factor
carcinogen|A carcinogen increases cancer risk by damaging genetic material|dna,cancer
ionising|Ionising radiation is a cancer risk factor|carcinogen
multifactor|Several interacting factors can contribute to one disease|risk_factor
cancer|Cancer results from changes causing uncontrolled cell growth and division|mitosis,dna
benign|A benign tumour remains contained in one area|cancer
malignant|A malignant tumour invades neighbouring tissues|cancer,tissue
metastasis|Malignant cells spread in blood and form secondary tumours|malignant,blood
genetic_cancer|Inherited variants can increase cancer risk|inheritance,cancer
`);
section('2.3 Plant tissues, organs and systems', '4.2.3.1,4.2.3.2', `
epidermis|Epidermal tissue covers and protects a plant organ|tissue,organ
palisade|Palisade cells contain many chloroplasts for photosynthesis|chloroplast,tissue
spongy|Spongy mesophyll has air spaces for gas exchange|tissue,diffusion
stoma|A stoma is a pore permitting leaf gas exchange|epidermis,diffusion
guard_cell|Guard cells regulate stomatal opening|stoma,specialised
xylem|Xylem transports water and mineral ions from roots upwards|tissue,root_ions
xylem_hollow|Dead hollow xylem cells form continuous water-conducting tubes|xylem,specialised
xylem_lignin|Lignified xylem walls provide strength|xylem_hollow
phloem|Phloem translocates dissolved sugars around a plant|tissue,carbohydrate
phloem_pores|Pores in phloem end walls allow sap movement between cells|phloem,specialised
root_water|Water enters root-hair cells by osmosis|root_hair_area,osmosis
transpiration|Transpiration is loss of water vapour from leaves|stoma,diffusion
transpiration_stream|Leaf water loss draws water through xylem from roots|transpiration,xylem,root_water
trans_temp|Higher temperature increases transpiration rate|transpiration,diffusion_temperature
trans_humidity|Higher humidity reduces the water-vapour concentration gradient|transpiration,diffusion_gradient
trans_wind|Air movement maintains a steep water-vapour gradient|transpiration,diffusion_gradient
trans_light|Light-induced stomatal opening increases water loss|transpiration,guard_cell
p_potometer|Measuring water uptake using movement along a calibrated tube|p_scale,p_timer,transpiration_stream
a_potometer|Calculating water-uptake rate from potometer readings|p_potometer,rate,transpiration
e_potometer|Water uptake is an estimate rather than a direct measure of water loss|p_potometer,transpiration
p_stomata|Sampling leaf surfaces to count stomata per unit area|p_focus,representative,stoma
a_stomata|Calculating stomatal density from sampled counts|p_stomata,ratio,area
`);
section('3.1 Communicable diseases', '4.3.1.1', `
pathogen|A pathogen causes infectious disease|organism,health
communicable|Communicable disease can spread between organisms|pathogen
bacterial_toxin|Some bacteria release toxins that damage tissues|prokaryote,pathogen,tissue
virus|Viruses reproduce inside host cells and damage them|pathogen,cell
fungus_pathogen|Some fungi infect plants or animals|pathogen
protist_pathogen|Some protists cause infectious disease|pathogen,eukaryote
contact_spread|Direct contact can transfer pathogens|communicable
water_spread|Contaminated water can transmit pathogens|communicable
air_spread|Airborne droplets can transmit pathogens|communicable
hygiene|Hygiene reduces transfer of pathogens|contact_spread,water_spread
isolation|Isolating infected individuals reduces pathogen spread|communicable
vector|A vector carries a pathogen between hosts|communicable
`);
section('3.1 Communicable diseases', '4.3.1.2', `
measles|Measles is a viral illness recognised by fever and a red rash|virus
measles_spread|Measles spreads by inhaled droplets|measles,air_spread
measles_vaccine|Vaccination reduces the risk of serious measles|measles,vaccination
hiv|HIV attacks immune cells and can progress to AIDS|virus,white_cell
hiv_spread|HIV is transmitted through infected body fluids|hiv,contact_spread
hiv_treatment|Antiretroviral drugs suppress HIV progression|hiv
tmv|Tobacco mosaic virus causes mosaic leaf discolouration|virus
tmv_growth|TMV reduces photosynthesis and therefore plant growth|tmv,photosynthesis
`);
section('3.1 Communicable diseases', '4.3.1.3,4.3.1.4,4.3.1.5', `
salmonella|Salmonella bacteria and toxins cause food-poisoning symptoms|bacterial_toxin
salmonella_spread|Salmonella infection follows ingestion of contaminated food|salmonella,hygiene
salmonella_vaccine|Vaccinating poultry reduces salmonella transmission|salmonella,vaccination
gonorrhoea|Gonorrhoea is a bacterial STI causing discharge and painful urination|bacterial_toxin,communicable
gonorrhoea_barrier|Condoms reduce sexual transmission of gonorrhoea|gonorrhoea,contact_spread
gonorrhoea_treat|Antibiotic resistance can make gonorrhoea harder to treat|gonorrhoea,resistant_bacteria
blackspot|Rose black spot is a fungal infection producing dark leaf spots|fungus_pathogen
blackspot_growth|Black-spot leaf loss reduces photosynthesis and growth|blackspot,photosynthesis
blackspot_spread|Water and wind spread rose black spot|blackspot,water_spread,air_spread
blackspot_fungicide|Fungicides can control rose black spot|blackspot
blackspot_remove|Removing infected leaves reduces black-spot spread|blackspot_spread
malaria|Malaria is a protist disease causing recurrent fever|protist_pathogen
malaria_vector|Mosquitoes transmit the malaria protist between people|malaria,vector
malaria_breed|Preventing mosquito breeding reduces malaria transmission|malaria_vector
malaria_net|Mosquito nets reduce bites that transmit malaria|malaria_vector
`);
section('3.1 Communicable diseases', '4.3.1.6,4.3.1.7,4.3.1.8', `
skin_barrier|Skin forms a physical barrier to pathogen entry|tissue,pathogen
nose_barrier|Nose hairs and mucus trap inhaled pathogens|pathogen,air_spread
airway_cilia|Cilia move pathogen-trapping mucus away from the lungs|trachea,pathogen
stomach_acid|Stomach acid kills many swallowed pathogens|stomach,pathogen
phagocytosis|Phagocytes engulf and digest pathogens|white_cell,enzyme
antigen|An antigen is a molecular target recognised by an antibody|protein
antibody|Antibodies bind specifically to matching antigens|white_cell,antigen
antitoxin|Antitoxins neutralise toxins released by pathogens|white_cell,bacterial_toxin
vaccination|Dead or inactive pathogen material stimulates antibody production|antibody,pathogen
immune_memory|Re-exposure produces a faster specific antibody response|vaccination
herd_immunity|High vaccination coverage reduces pathogen transmission|immune_memory,communicable
antibiotic|Antibiotics kill susceptible bacteria|prokaryote,pathogen
antibiotic_specific|Different bacteria may require different antibiotics|antibiotic
antibiotic_virus|Antibiotics do not kill viruses|antibiotic,virus
painkiller|Painkillers relieve symptoms without killing pathogens|pathogen
e_antiviral|Targeting viruses is difficult without damaging host cells|virus,risk
`);
section('3.1 Communicable diseases', '4.3.1.9', `
digitalis|Digitalis originated from foxgloves|organism
aspirin|Aspirin originated from willow|organism
penicillin|Fleming discovered penicillin from Penicillium mould|antibiotic,fungus_pathogen
synthetic_drug|Modern drugs may be synthesised from plant-derived starting chemicals|reaction
drug_toxicity|Drug toxicity testing checks harmful effects|risk
drug_efficacy|Drug efficacy testing checks whether treatment works|hypothesis
drug_dose|Dose testing seeks an effective amount with acceptable harm|drug_efficacy,drug_toxicity
preclinical|Preclinical tests use cells, tissues and live animals|drug_toxicity,drug_efficacy,cell,tissue
clinical_healthy|Clinical testing initially assesses low doses in healthy volunteers|preclinical,drug_dose
clinical_patient|Patient trials test effectiveness and optimum dose|clinical_healthy,drug_efficacy
placebo|A placebo comparison separates drug effects from expectations|clinical_patient,control
double_blind|Double-blind trials reduce participant and researcher bias|placebo
drug_review|Peer review scrutinises drug-trial methods and findings|clinical_patient,peer_review
`);
section('3.2 Monoclonal antibodies', '4.3.2.1,4.3.2.2', `
monoclonal|Monoclonal antibodies bind one specific antigen site|antibody
p_mouse_antibody|Stimulating mouse lymphocytes to make a chosen antibody|monoclonal,vaccination
p_hybridoma|Fusing a lymphocyte with a tumour cell creates a hybridoma|p_mouse_antibody,cancer
p_clone_hybridoma|Cloning a hybridoma produces identical antibody-secreting cells|p_hybridoma,mitosis
p_purify_antibody|Collecting and purifying antibodies from hybridoma cultures|p_clone_hybridoma
a_pregnancy|Specific antibody binding can detect a pregnancy hormone|monoclonal,hormone
a_assay|Specific antibodies can detect or measure a target chemical or pathogen|monoclonal,pathogen
a_fluorescent|Fluorescently labelled antibodies locate a target molecule|monoclonal
a_target_drug|Antibodies can deliver a treatment to cells with a matching antigen|monoclonal,cancer
e_monoclonal|Unexpected side effects limit monoclonal-antibody treatments|a_target_drug,risk
`);
section('3.3 Plant disease', '4.3.3.1,4.3.3.2', `
plant_stunted|Stunted growth can indicate plant disease|pathogen,organism
plant_spots|Leaf spots can indicate plant disease|pathogen
plant_rot|Decaying areas can indicate plant disease|pathogen
plant_growths|Abnormal growths can indicate plant disease|pathogen
plant_malformed|Malformed stems or leaves can indicate plant disease|pathogen
plant_discolour|Discolouration can indicate plant disease|pathogen
aphid|Aphids damage plants by feeding on sap|phloem
p_manual_disease|Using a reference guide to identify plant-disease symptoms|plant_spots,observation
p_lab_disease|Laboratory examination can identify a plant pathogen|pathogen,p_focus
a_plant_kit|A monoclonal-antibody kit identifies a matching plant pathogen|monoclonal,pathogen
nitrate_deficient|Nitrate deficiency limits protein synthesis and plant growth|root_ions,protein
magnesium_deficient|Magnesium deficiency reduces chlorophyll and causes chlorosis|root_ions,chloroplast
plant_wall_defence|Cellulose walls resist pathogen invasion|cellulose_wall,pathogen
cuticle_defence|A waxy cuticle forms a barrier to pathogens|epidermis,pathogen
bark_defence|Shedding dead bark cells removes invading pathogens|tissue,pathogen
antibacterial_plant|Plant antibacterial chemicals inhibit bacteria|prokaryote,pathogen
plant_poison|Plant poisons deter herbivores|organism
plant_thorn|Thorns and hairs deter animals from feeding|organism
plant_curl|Touch-induced leaf movement can deter herbivores|organism
plant_mimic|Mimicry can deter animals by resembling something unappealing|organism
`);

// Remaining specification topics are kept in a separate source file for review.
require('./author_aqa_biology_topics4_7')({ section });
require('./refine_aqa_biology_map')({ nodes, edges, section });

const rootReasons = {
  observation: 'Recording what is observed requires ordinary language and numeracy, with no other taught biological idea.'
};
for (const n of nodes) if (rootReasons[n.id]) n.rootReason = rootReasons[n.id];
const graph = { nodes, edges };
const report = validate(graph);
const rank = new Map(report.order.map((id, i) => [id, i]));
nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
const source = require('./aqa_biology_8461_sources.json');
const revision = createHash('sha256').update(JSON.stringify(graph)).digest('hex').slice(0, 16);
const map = { subject: 'Biology', qualification: 'GCSE Higher', examBoard: 'AQA', specification: '8461', revision, rule17: true, verified: false, sourceUrls: source.sources.map(s => s.url), ...graph };
const target = path.join(__dirname, '../src/data/aqaBiologyHigher.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(map, null, 2));
fs.writeFileSync(path.join(path.dirname(target), 'aqaBiologySources.json'), JSON.stringify(source.sources.map(s => ({ url: s.url, text: s.text })), null, 2));
fs.writeFileSync(path.join(__dirname, 'aqa_biology_build/authored-validation.json'), JSON.stringify({ ...report, nodes: nodes.length, edges: edges.length }, null, 2));
console.log(`${nodes.length} atomic objectives, ${edges.length} prerequisites; roots: ${report.roots.map(n => n.id).join(', ')}`);
