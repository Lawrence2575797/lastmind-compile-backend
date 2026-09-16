module.exports = ({ section }) => {
section('4.1 Photosynthesis', '4.4.1.1,4.4.1.2,4.4.1.3', `
energy|Energy is transferred when changes occur|observation
photosynthesis|Photosynthesis converts carbon dioxide and water into glucose and oxygen using light|reaction,carbohydrate,energy
photo_endothermic|Photosynthesis transfers energy from the environment into chemical stores|photosynthesis,energy
photo_symbols|Interpreting the chemical formulae in the photosynthesis equation|photosynthesis,model
photo_light|Increasing light intensity increases photosynthesis until another factor limits it|photosynthesis,rate
photo_co2|Increasing carbon dioxide increases photosynthesis until another factor limits it|photosynthesis,concentration,rate
photo_temperature|Temperature affects photosynthesis through enzyme activity|photosynthesis,enzyme_temp,enzyme_hot
photo_chlorophyll|Less chlorophyll reduces light absorption for photosynthesis|photosynthesis,chloroplast
limiting_factor|A limiting factor prevents an increase in photosynthesis rate|photo_light,photo_co2,photo_temperature
a_photo_graph|Identifying a limiting factor by comparing photosynthesis-rate curves|limiting_factor,p_best_fit
inverse_square|Light intensity is inversely proportional to distance squared|inverse,substitute
e_greenhouse|Additional greenhouse yield must justify the cost of removing a limiting factor|limiting_factor,e_technology
glucose_respiration|Photosynthetic glucose is used as a respiratory substrate|photosynthesis,respiration
glucose_starch|Plants convert glucose to insoluble starch for storage|photosynthesis,carbohydrate
glucose_lipid|Plants convert glucose to lipids for storage|photosynthesis,lipid
glucose_cellulose|Plants use glucose to make cellulose walls|photosynthesis,cellulose_wall
glucose_amino|Glucose and nitrate ions are used to make amino acids|photosynthesis,root_ions,protein
`);
section('4.1 Photosynthesis', '4.4.1.2,8.2.6', `
p_pondweed_distance|Changing lamp distance to vary illumination of pondweed|inverse_square,p_scale
p_pondweed_temp|Controlling pondweed temperature with a water bath or heat shield|p_pondweed_distance,p_waterbath
p_pondweed_gas|Collecting oxygen produced by pondweed for a measured time|p_pondweed_temp,p_volume,p_timer
a_pondweed_rate|Calculating photosynthesis rate from oxygen volume per time|p_pondweed_gas,photosynthesis,rate
a_pondweed_limit|Using pondweed-rate data to identify light limitation|a_pondweed_rate,limiting_factor,p_best_fit
e_bubbles|Counting bubbles assumes constant bubble volume|p_pondweed_gas,volume,uncertainty
`, [6]);
section('4.2 Respiration', '4.4.2.1,4.4.2.2,4.4.2.3', `
respiration|Cellular respiration continuously transfers energy from glucose|cell,reaction,carbohydrate,energy
resp_exothermic|Respiration transfers energy to the surroundings|respiration
aerobic|Aerobic respiration uses oxygen and produces carbon dioxide and water|respiration
anaerobic_muscle|Anaerobic respiration in muscle converts glucose into lactic acid|respiration,muscle_contract
anaerobic_energy|Incomplete glucose breakdown transfers less energy than aerobic respiration|anaerobic_muscle,aerobic
fermentation|Anaerobic respiration in yeast or plants produces ethanol and carbon dioxide|respiration
bread|Carbon dioxide from yeast fermentation makes bread dough rise|fermentation
alcohol_production|Yeast fermentation produces ethanol for alcoholic drinks|fermentation
resp_synthesis|Respiration supplies energy for building larger molecules|respiration,protein
resp_movement|Respiration supplies energy for muscle contraction|respiration,muscle_contract
resp_warmth|Respiratory energy transfer helps maintain body temperature|resp_exothermic
exercise_heart|Increased heart rate supplies exercising muscles with more oxygenated blood|resp_movement,heart,red_cell
exercise_breath_rate|Faster breathing increases oxygen supply during exercise|aerobic,alveolar_ventilation
exercise_breath_volume|Deeper breaths increase oxygen supply during exercise|aerobic,alveolar_ventilation
fatigue|Lactic-acid accumulation accompanies reduced efficiency of muscle contraction|anaerobic_muscle
oxygen_debt|Oxygen debt is extra oxygen needed after exercise to remove accumulated lactic acid|anaerobic_muscle,aerobic
lactate_liver|Blood carries lactic acid to the liver for conversion back to glucose|anaerobic_muscle,blood
metabolism|Metabolism is the sum of reactions in a cell or organism|reaction,cell
glycogen|Glucose is stored as glycogen in animal cells|carbohydrate
lipid_synthesis|One glycerol molecule combines with three fatty acids to make a lipid|lipid,reaction
protein_synthesis|Amino acids are assembled into a protein chain|protein,reaction
urea|Urea is a waste product formed from excess amino acids|protein,reaction
`);
section('5.1 Homeostasis', '4.5.1', `
homeostasis|Homeostasis regulates internal conditions around optimum levels|cell,enzyme
stimulus|A stimulus is a detectable change in conditions|variable
receptor|A receptor detects a stimulus|stimulus,cell
coordinator|A coordination centre processes information from receptors|receptor
effector|An effector produces a response to a coordination signal|coordinator
homeo_glucose|Blood glucose regulation maintains substrate supply to cells|homeostasis,respiration,blood
homeo_temperature|Temperature regulation maintains conditions for enzyme function|homeostasis,enzyme_temp,enzyme_hot
homeo_water|Water regulation prevents harmful osmotic cell changes|homeostasis,osmosis
`);
section('5.2 The human nervous system', '4.5.2.1,4.5.2.2', `
nerve_impulse|Neurones transmit electrical impulses|cell
cns|The central nervous system comprises brain and spinal cord|coordinator,nerve_impulse
sensory_neurone|Sensory neurones carry impulses from receptors to the CNS|receptor,cns
relay_neurone|Relay neurones connect neurones within the CNS|cns,nerve_impulse
motor_neurone|Motor neurones carry impulses from the CNS to effectors|cns,effector
synapse|Chemical signals transmit across gaps between neurones|nerve_impulse,reaction
reflex|A reflex is a rapid automatic response without conscious brain involvement|sensory_neurone,relay_neurone,motor_neurone,synapse
e_reflex|Rapid reflex responses protect the body from harm|reflex,risk
brain|The brain coordinates complex behaviour through interconnected neurones|cns
cortex|The cerebral cortex supports conscious thought and voluntary actions|brain
cerebellum|The cerebellum coordinates movement and balance|brain
medulla|The medulla controls unconscious activities such as breathing|brain
brain_damage_evidence|Loss of function after brain damage helps locate that function|brain,observation
brain_stimulation|Electrical stimulation helps associate brain regions with functions|brain,nerve_impulse
brain_mri|MRI scans reveal brain structure for investigation|brain,model
e_brain_complex|Interconnected brain functions complicate localisation and treatment|brain,e_model_limits
e_brain_delicate|Brain intervention risks irreversible damage to delicate tissue|brain,risk
`);
section('5.2 The human nervous system', '4.5.2.1,8.2.7', `
reaction_time|Reaction time is the interval between stimulus and response|stimulus,effector,measurement
p_ruler_drop|Measuring ruler distance fallen before a participant catches it|p_scale,reaction_time
p_reaction_factor|Changing one chosen factor while controlling other reaction-test conditions|p_ruler_drop,control,p_ethics_organism
a_reaction_time|Converting caught ruler distance to reaction time using a supplied relationship|p_ruler_drop,reaction_time,substitute
a_reaction_compare|Comparing mean reaction times for a changed factor|p_reaction_factor,a_reaction_time,mean
e_anticipation|Unpredictable release timing reduces anticipation in a ruler-drop test|p_ruler_drop,systematic_error
`, [7]);
section('5.2 The human nervous system', '4.5.2.3', `
retina|The retina contains light-sensitive receptors|receptor,organ
optic_nerve|The optic nerve carries impulses from retina to brain|retina,nerve_impulse,brain
sclera|The sclera is the tough protective outer eye layer|organ,tissue
cornea|The cornea refracts incoming light|organ,model
lens|The eye lens changes light convergence to focus an image|cornea
iris|The iris regulates pupil diameter to control light entry|retina,organ
pupil_bright|In bright light circular iris muscles contract to constrict the pupil|iris,muscle_contract
pupil_dim|In dim light radial iris muscles contract to dilate the pupil|iris,muscle_contract
ciliary|Ciliary muscles change tension on the lens-supporting ligaments|lens,muscle_contract
ligament|Suspensory ligaments transmit tension to the eye lens|lens,tissue
near_contract|For near focus ciliary contraction loosens suspensory ligaments|ciliary,ligament
near_thick|Reduced ligament tension makes the lens thicker and more refractive|near_contract,lens
far_relax|For distant focus ciliary relaxation tightens suspensory ligaments|ciliary,ligament
far_thin|Tight ligaments pull the lens thin for weaker refraction|far_relax,lens
myopia|In myopia distant light focuses in front of the retina|retina,lens
hyperopia|In hyperopia near light would focus behind the retina|retina,lens
myopia_lens|A diverging spectacle lens corrects myopia|myopia,cornea
hyperopia_lens|A converging spectacle lens corrects hyperopia|hyperopia,cornea
p_ray|Interpreting where rays converge in a supplied eye diagram|lens,model
a_myopia_ray|Identifying myopia and its correction on a ray diagram|p_ray,myopia_lens
a_hyperopia_ray|Identifying hyperopia and its correction on a ray diagram|p_ray,hyperopia_lens
contact_lens|Contact lenses correct refraction at the eye's surface|myopia_lens,hyperopia_lens
laser_eye|Laser surgery changes corneal shape to correct focusing|cornea
replacement_lens|Replacing the eye lens can correct focusing defects|lens
`);
section('5.2 The human nervous system', '4.5.2.4', `
thermoregulator|The brain's thermoregulatory centre monitors blood temperature|brain,homeo_temperature,receptor
skin_temperature|Skin receptors send temperature information to the thermoregulatory centre|thermoregulator,sensory_neurone
vasodilate|Vasodilation increases skin blood flow and energy loss|thermoregulator,blood,energy
sweat|Sweat evaporation transfers energy from skin to the environment|thermoregulator,energy
vasoconstrict|Vasoconstriction reduces skin blood flow and energy loss|thermoregulator,blood,energy
shiver|Shivering increases respiratory energy release in muscles|thermoregulator,resp_movement,resp_exothermic
stop_sweat|Reduced sweating limits evaporative energy loss|sweat,thermoregulator
`);
section('5.3 Hormonal coordination in humans', '4.5.3.1,4.5.3.2,4.5.3.3', `
hormone|A hormone is a chemical messenger secreted into blood by a gland|blood,reaction
target_hormone|A hormone affects cells in its specific target organ|hormone,organ
hormonal_duration|Hormonal effects are generally slower and longer lasting than nervous effects|hormone,nerve_impulse
pituitary|The pituitary gland beneath the brain controls several endocrine glands|hormone,brain
pancreas_glucose|The pancreas monitors blood glucose and secretes regulatory hormones|hormone,homeo_glucose
insulin|Insulin increases movement of glucose from blood into cells|pancreas_glucose
insulin_glycogen|Insulin promotes glucose storage as glycogen in liver and muscle|insulin,glycogen
type1|Type 1 diabetes results from insufficient insulin production|insulin
type1_treat|Insulin injections replace missing insulin in Type 1 diabetes|type1
type2|Type 2 diabetes involves reduced cell response to insulin|insulin,target_hormone
type2_diet|Controlling dietary carbohydrate helps manage Type 2 diabetes|type2,carbohydrate
type2_exercise|Exercise helps manage Type 2 diabetes|type2,resp_movement
glucagon|Glucagon promotes glycogen breakdown and glucose release into blood|pancreas_glucose,glycogen
negative_feedback|Negative feedback opposes a departure from an optimum|homeostasis,effector
a_glucose_feedback|Explaining the opposing insulin and glucagon responses to glucose changes|negative_feedback,insulin_glycogen,glucagon
water_lungs|Exhaled air causes uncontrolled water loss|alveolar_ventilation
water_sweat|Sweating loses water, ions and small amounts of urea|sweat,urea
osmotic_harm|Excess osmotic water gain or loss impairs cell function|osmosis,homeo_water
deamination|The liver removes amino groups from excess amino acids to form ammonia|protein_synthesis,urea
ammonia_urea|The liver converts toxic ammonia to urea for safer excretion|deamination,risk
kidney_filter|Kidneys filter small dissolved substances from blood|organ,blood,concentration
kidney_glucose|Kidneys selectively reabsorb glucose from filtrate|kidney_filter,carbohydrate
kidney_ions|Kidneys selectively reabsorb required ions from filtrate|kidney_filter
kidney_water|Kidneys selectively reabsorb water from filtrate|kidney_filter,osmosis
urine|Urine removes excess water, ions and urea from the body|kidney_water,kidney_ions,ammonia_urea
adh_release|Concentrated blood stimulates ADH release from the pituitary|pituitary,concentration,homeo_water
adh_permeability|ADH increases kidney-tubule permeability to water|adh_release,kidney_water,partial_membrane
adh_reabsorb|Greater tubule permeability increases water reabsorption into blood|adh_permeability,osmosis
a_adh_feedback|ADH negative feedback restores blood water concentration|adh_reabsorb,negative_feedback
dialysis|Dialysis removes wastes across a partially permeable membrane into dialysis fluid|kidney_filter,partial_membrane,diffusion,urea
dialysis_gradient|Dialysis-fluid composition removes wastes while retaining useful solutes|dialysis,gradient_concentration
e_dialysis_time|Repeated dialysis sessions impose time and lifestyle costs|dialysis,e_technology
kidney_transplant|A donor kidney can restore filtration and water regulation|kidney_filter,kidney_water
e_kidney_rejection|Kidney transplants require measures to limit immune rejection|kidney_transplant,antibody
`);
section('5.3 Hormonal coordination in humans', '4.5.3.4,4.5.3.5,4.5.3.6,4.5.3.7', `
puberty|Reproductive hormones trigger secondary sexual characteristics|hormone
ovary|Ovaries produce eggs and oestrogen|organ,hormone
testes|Testes produce sperm and testosterone|organ,hormone
testosterone|Testosterone stimulates sperm production|testes
ovulation|Ovulation releases a mature egg from an ovary|ovary
fsh|FSH from the pituitary stimulates egg maturation in an ovary|pituitary,ovary
lh|LH stimulates ovulation|pituitary,ovulation
oestrogen_lining|Oestrogen promotes growth of the uterus lining|ovary,hormone,tissue
progesterone_lining|Progesterone maintains the uterus lining|hormone,tissue
oestrogen_fsh|Oestrogen inhibits FSH secretion|oestrogen_lining,fsh
oestrogen_lh|High oestrogen stimulates an LH surge|oestrogen_lining,lh
progesterone_inhibit|Progesterone inhibits FSH and LH release|progesterone_lining,fsh,lh
menstruation|Falling progesterone leads to shedding of the uterus lining|progesterone_lining
a_cycle_graph|Interpreting a hormone-level change in a menstrual-cycle graph|fsh,lh,oestrogen_lining,progesterone_lining,p_plot
contraception|Contraception reduces the chance of pregnancy|fertilisation
pill|Oral contraceptive hormones inhibit FSH and egg maturation|contraception,fsh
progesterone_contraceptive|Slow-release progesterone inhibits egg maturation and release|contraception,progesterone_inhibit
condom|A condom prevents sperm reaching an egg|contraception,gamete
diaphragm|A diaphragm blocks sperm from entering the uterus|contraception,gamete
iud|An intrauterine device prevents implantation or releases contraceptive hormone|contraception
spermicide|Spermicides kill or disable sperm|contraception,gamete
abstinence|Avoiding intercourse near ovulation reduces fertilisation chance|contraception,ovulation
male_sterilise|Male sterilisation blocks sperm transport|contraception,gamete
female_sterilise|Female sterilisation blocks egg transport|contraception,gamete
e_contraception|Contraceptive decisions involve effectiveness, side effects and personal values|contraception,ethics,risk
fertility_drug|FSH and LH treatment can promote egg maturation and ovulation|fsh,lh
p_ivf_stimulate|Stimulating maturation of several eggs before IVF|fertility_drug
p_ivf_collect|Collecting eggs for fertilisation outside the body|p_ivf_stimulate,gamete
p_ivf_fertilise|Fertilising collected eggs with sperm in a laboratory|p_ivf_collect,fertilisation
p_ivf_embryo|Culturing fertilised eggs until early embryos form|p_ivf_fertilise,mitosis
p_ivf_transfer|Transferring early embryos into the uterus|p_ivf_embryo
e_ivf_stress|IVF can cause emotional and physical stress|p_ivf_transfer,health
e_ivf_success|IVF does not guarantee a successful pregnancy|p_ivf_transfer,probability
e_ivf_multiple|Transferring multiple embryos increases multiple-birth risks|p_ivf_transfer,risk
e_ivf_ethics|Decisions about unused embryos create ethical issues|p_ivf_embryo,ethics
adrenal|Adrenal glands above the kidneys release adrenaline|hormone,kidney_filter
adrenaline|Adrenaline increases heart rate for a fight-or-flight response|adrenal,heart
adrenaline_supply|Adrenaline increases oxygen and glucose delivery to brain and muscles|adrenaline,red_cell,respiration
thyroid|The thyroid gland in the neck produces thyroxine|hormone
thyroxine|Thyroxine stimulates basal metabolic rate|thyroid,metabolism
thyroxine_growth|Thyroxine contributes to growth and development|thyroxine,growth_mitosis
a_thyroxine_feedback|Negative feedback controls thyroxine levels|thyroxine,pituitary,negative_feedback
`);
section('5.4 Plant hormones', '4.5.4.1,4.5.4.2', `
auxin|Auxin regulates plant cell elongation|cell,hormone
phototropism|Phototropism is directional plant growth in response to light|auxin,stimulus
shoot_auxin|Auxin accumulates on a shoot's shaded side|phototropism
shoot_bend|Faster shaded-side elongation bends a shoot towards light|shoot_auxin,auxin
gravitropism|Gravitropism is directional growth in response to gravity|auxin,stimulus
gravity_auxin|Gravity causes auxin to accumulate on the lower side|gravitropism
root_bend|Auxin inhibits lower-side root growth so roots bend downwards|gravity_auxin,auxin
shoot_gravity|Auxin stimulates lower-side shoot growth so shoots bend upwards|gravity_auxin,auxin
gibberellin|Gibberellins initiate seed germination|hormone,organism
ethene_ripen|Ethene controls fruit ripening|hormone
ethene_divide|Ethene influences plant cell division|hormone,mitosis
auxin_weed|Auxin-based selective weedkillers disrupt growth of susceptible plants|auxin
e_weedkiller|Selective weedkillers can reduce plant biodiversity|auxin_weed,biodiversity
auxin_root|Auxin rooting powders stimulate roots on cuttings|auxin,cuttings
auxin_culture|Auxins promote growth in tissue culture|auxin,tissue_culture
ethene_storage|Managing ethene exposure controls ripening during storage and transport|ethene_ripen
gibberellin_dormancy|Gibberellins can end seed dormancy|gibberellin
gibberellin_flower|Gibberellins can promote flowering|gibberellin
gibberellin_fruit|Gibberellins can increase fruit size|gibberellin
`);
section('5.4 Plant hormones', '4.5.4.1,8.2.8', `
p_seedlings|Setting up seedlings with a controlled directional light or gravity stimulus|control,phototropism,gravitropism,p_ethics_organism
p_seedling_length|Measuring seedling length changes at set times|p_seedlings,p_scale,p_timer
p_seedling_drawing|Recording seedling growth direction in labelled drawings|p_seedlings,p_label_drawing
a_seedling_light|Explaining measured bending towards light using auxin|p_seedling_length,p_seedling_drawing,shoot_bend
a_seedling_gravity|Explaining measured growth direction under gravity using auxin|p_seedling_length,p_seedling_drawing,root_bend,shoot_gravity
e_seedling_age|Using similar starting seedlings limits developmental confounding|p_seedlings,control
`, [8]);
section('6.1 Reproduction', '4.6.1.1,4.6.1.2,4.6.1.3', `
gamete|A gamete is a reproductive cell containing one chromosome set|chromosome
animal_gametes|Animal sperm and eggs are male and female gametes|gamete
plant_gametes|Pollen carries male gametes that fuse with egg cells in flowering plants|gamete
sexual|Sexual reproduction mixes genetic information through gamete fusion|gamete,dna
asexual|Asexual reproduction produces genetically identical offspring from one parent|mitosis,dna
meiosis_copy|DNA is copied before meiotic division|dna_replication,gamete
meiosis_divide|Two meiotic divisions produce four cells with one chromosome set each|meiosis_copy,chromosome_pairs
meiosis_variation|Meiosis produces genetically different gametes|meiosis_divide
fertilisation|Gamete fusion restores the normal chromosome number|gamete,chromosome_pairs
embryo_develop|A fertilised egg grows by mitosis and its cells differentiate|fertilisation,mitosis,differentiation
sexual_variation|Sexual reproduction generates variation among offspring|sexual,meiosis_variation
e_sexual_change|Genetic variation improves the chance some offspring survive environmental change|sexual_variation,natural_selection
e_sexual_breed|Sexual variation provides traits for selective breeding|sexual_variation,selective_breeding
e_asexual_parent|Asexual reproduction requires only one parent|asexual
e_asexual_energy|Asexual reproduction avoids the time and energy cost of finding a mate|asexual,energy
e_asexual_fast|Asexual reproduction can rapidly increase numbers in favourable conditions|asexual
e_asexual_change|Genetic uniformity can make clones vulnerable to environmental change|asexual,variation
malaria_asexual|Malarial parasites reproduce asexually in human hosts|asexual,malaria
malaria_sexual|Malarial parasites reproduce sexually in mosquitoes|sexual,malaria_vector
fungal_spores|Fungi can reproduce asexually through spores|asexual,fungus_pathogen
fungal_sexual|Sexual reproduction gives fungi genetic variation|sexual,fungus_pathogen
plant_seed|Flowering plants produce seeds through sexual reproduction|sexual,plant_gametes
runner|Strawberry runners produce new plants asexually|asexual
bulb|Daffodil bulb division produces new plants asexually|asexual
`);
section('6.1 Reproduction', '4.6.1.4,4.6.1.5', `
dna_helix|DNA comprises two strands forming a double helix|dna,model
genome|A genome is an organism's entire genetic material|dna,organism
genome_disease|Genome study helps locate genes associated with disease|genome,gene,health
genome_treatment|Understanding disease genes can guide inherited-disorder treatment|genome_disease,inheritance
genome_migration|Genetic similarities help trace past human migration|genome,inheritance
nucleotide|A DNA nucleotide consists of sugar, phosphate and one base|dna,particle
dna_backbone|Alternating sugar and phosphate form each DNA strand's backbone|nucleotide,dna_helix
dna_bases|DNA has four base types represented by A, T, C and G|nucleotide
base_at|A pairs with T in complementary DNA strands|dna_bases,dna_helix
base_cg|C pairs with G in complementary DNA strands|dna_bases,dna_helix
triplet|A sequence of three DNA bases codes for an amino acid|dna_bases,protein
sequence_protein|DNA base order specifies the amino-acid order of a protein|triplet,gene
protein_template|A template carries a gene's instructions to a ribosome|sequence_protein,ribosome
protein_carrier|Carrier molecules deliver specific amino acids in the required order|protein_template,protein_synthesis
protein_fold|A completed protein chain folds into a shape suited to its function|protein_carrier,protein
mutation|A mutation is a change in DNA base sequence|dna_bases
mutation_neutral|Most mutations have little or no effect on protein function|mutation,sequence_protein
mutation_shape|Some mutations change protein shape and function|mutation,protein_fold
mutation_enzyme|An altered enzyme active site may no longer fit its substrate|mutation_shape,active_site
mutation_structural|An altered structural protein can lose strength|mutation_shape
noncoding|Non-coding DNA can regulate whether genes are expressed|gene
noncoding_variant|A non-coding variant can change gene expression and phenotype|noncoding,mutation,phenotype
`);
section('6.1 Reproduction', '4.6.1.6,4.6.1.7,4.6.1.8', `
inheritance|Offspring inherit genetic information from parents|gene,sexual,asexual
allele|An allele is a variant of a gene|gene,mutation
genotype|Genotype describes an organism's alleles|allele
phenotype|Phenotype is an organism's expressed characteristics|organism,genotype
dominant|A dominant allele affects phenotype when one copy is present|allele,phenotype
recessive|A recessive allele affects a diploid trait when no dominant allele is present|dominant,chromosome_pairs
homozygous|Homozygous means having two identical alleles for a gene|allele,chromosome_pairs
heterozygous|Heterozygous means having two different alleles for a gene|allele,chromosome_pairs
polygenic|Most characteristics depend on several interacting genes|gene,phenotype
p_punnett_gametes|Writing possible gamete alleles from parental genotypes|genotype,gamete
p_punnett_grid|Combining gamete alleles in a Punnett-square grid|p_punnett_gametes,fertilisation
a_cross_genotype|Predicting genotype proportions from a Punnett square|p_punnett_grid,genotype,probability
a_cross_phenotype|Predicting phenotype probabilities from a genetic cross|a_cross_genotype,dominant,recessive
a_pedigree|Inferring inheritance from a supplied family tree|a_cross_phenotype,inheritance,model
polydactyly|A dominant allele can cause polydactyly|dominant
cystic_fibrosis|Cystic fibrosis is caused by recessive alleles affecting cell membranes|recessive,membrane
carrier|A carrier has a recessive disorder allele without expressing the disorder|heterozygous,recessive
embryo_screen|Embryo screening identifies alleles linked to inherited disorders|allele,embryo_develop
e_embryo_screen|Screening decisions weigh disease avoidance against ethical concerns|embryo_screen,ethics
human_chromosomes|Ordinary human body cells contain 23 chromosome pairs|chromosome_pairs
sex_xx|The female sex-chromosome pair is XX in the GCSE model|human_chromosomes
sex_xy|The male sex-chromosome pair is XY in the GCSE model|human_chromosomes
a_sex_cross|Using a genetic cross to predict XX and XY offspring proportions|sex_xx,sex_xy,p_punnett_grid,probability
`);
section('6.2 Variation and evolution', '4.6.2.1,4.6.2.2,4.6.2.3,4.6.2.4,4.6.2.5', `
variation|Variation means differences between individuals in a population|phenotype,sample
genetic_variation|Inherited alleles contribute to variation|variation,inheritance,allele
environment_variation|Environmental conditions contribute to phenotype variation|variation
combined_variation|Genes and environment can jointly influence phenotype|genetic_variation,environment_variation
new_variant|Mutations are the original source of new genetic variants|mutation,allele
species|Members of a species can interbreed to produce fertile offspring|sexual
selection_survival|Better-suited variants are more likely to survive environmental pressures|genetic_variation,organism
selection_reproduce|Survivors are more likely to reproduce and pass on beneficial alleles|selection_survival,inheritance
natural_selection|Advantageous inherited variants become more common over generations|selection_reproduce
evolution|Evolution is change in inherited population characteristics over time|natural_selection
common_ancestor|Living species evolved from earlier common ancestors|evolution
selective_breeding|Humans choose breeding parents with desired inherited characteristics|inheritance,variation
p_select_offspring|Repeatedly breeding selected offspring establishes a desired characteristic|selective_breeding,sexual
crop_resistance|Selective breeding can increase crop disease resistance|p_select_offspring,pathogen
livestock_yield|Selective breeding can increase meat or milk production|p_select_offspring
dog_temperament|Selective breeding can favour a gentle temperament in dogs|p_select_offspring
flower_breeding|Selective breeding can change flower size or appearance|p_select_offspring
inbreeding|Breeding close relatives increases inherited-defect risk|p_select_offspring,recessive
genetic_engineering|Genetic engineering introduces a gene to give a desired characteristic|gene,genome,phenotype
p_isolate_gene|Using enzymes to isolate a required gene|genetic_engineering,enzyme
p_insert_vector|Inserting a gene into a plasmid or viral vector|p_isolate_gene,plasmid,virus
p_transfer_gene|Using a vector to introduce the gene into target cells|p_insert_vector,cell
p_early_gene|Introducing genes early allows the developing organism to express them|p_transfer_gene,embryo_develop
gm_insect|GM insect resistance can reduce crop losses|genetic_engineering,pathogen
gm_herbicide|GM herbicide resistance permits weed control around a crop|genetic_engineering,auxin_weed
gm_insulin|Engineered bacteria produce human insulin for treatment|genetic_engineering,insulin,prokaryote
gene_therapy|Introducing functional genes may treat some inherited disorders|genetic_engineering,inheritance
e_gm_ecology|GM crop use can affect wild plant and insect populations|gm_herbicide,community
e_gm_health|Assessing GM-food health claims requires evidence|genetic_engineering,e_evidence_limits,risk
tissue_culture|Plant tissue culture grows identical plants from small cell groups|asexual,tissue
cuttings|Plant cuttings develop into genetically identical plants|asexual,differentiation
embryo_split|Splitting an early animal embryo creates genetically identical embryos|asexual,embryo_develop
p_clone_enucleate|Removing the nucleus from an unfertilised egg|nucleus,gamete
p_clone_nucleus|Inserting an adult-cell nucleus into an enucleated egg|p_clone_enucleate,dna
p_clone_stimulate|An electric shock stimulates the reconstructed egg to divide|p_clone_nucleus,mitosis
p_clone_implant|Implanting the resulting embryo into a host uterus|p_clone_stimulate,embryo_develop
a_clone_identity|The adult nuclear donor determines a clone's nuclear genetic information|p_clone_nucleus,inheritance
e_clone_diversity|Widespread cloning reduces genetic variation in a population|asexual,genetic_variation
e_clone_welfare|Low success and developmental problems create animal-cloning welfare concerns|p_clone_implant,ethics,risk
`);
section('6.3 Development of understanding of genetics and evolution', '4.6.3.1,4.6.3.2,4.6.3.3,4.6.3.4,4.6.3.5,4.6.3.6,4.6.3.7', `
darwin|Darwin developed natural selection from observations and evidence|natural_selection,theory_revision
e_darwin_belief|Darwin's theory challenged prevailing beliefs about creation|darwin,ethics
e_darwin_evidence|Limited contemporary evidence delayed acceptance of evolution|darwin,e_evidence_limits
e_darwin_genetics|Unknown inheritance mechanisms delayed acceptance of Darwin's theory|darwin,inheritance
lamarck|Lamarck proposed inheritance of characteristics acquired during life|inheritance
e_lamarck|Most acquired characteristics are not inherited genetically|lamarck,genetic_variation,environment_variation
wallace|Wallace independently developed natural selection and contributed to speciation theory|natural_selection
isolation_species|Geographic isolation prevents gene exchange between populations|species,inheritance
divergent_selection|Different environments favour different variants in isolated populations|isolation_species,natural_selection
speciation|Accumulated divergence can prevent interbreeding to produce fertile offspring|divergent_selection,species
mendel|Mendel inferred inherited discrete units from pea-breeding experiments|inheritance,a_cross_phenotype
e_mendel|Limited knowledge of chromosomes delayed recognition of Mendel's work|mendel,chromosome
genes_chromosomes|Matching inheritance patterns located Mendel's units on chromosomes|mendel,chromosome
dna_discovery|Discovering DNA structure helped explain how genes function|dna_helix,sequence_protein,genes_chromosomes
fossil|A fossil is preserved evidence of an organism from the distant past|organism,observation
fossil_no_decay|Remains can fossilise when conditions prevent decay|fossil,decomposition
fossil_mineral|Mineral replacement can preserve remains as fossils|fossil,decomposition
fossil_trace|Footprints and other traces can be preserved as fossils|fossil
e_fossil_soft|Soft-bodied early organisms left few fossil traces|fossil
e_fossil_destroy|Geological activity destroys parts of the fossil record|fossil
a_fossil_change|Fossil sequences provide evidence of evolutionary change|fossil,evolution
extinction|Extinction means no living members of a species remain|species
extinct_environment|Environmental change can make a species unable to survive|extinction,environment_variation
extinct_predator|A new predator can drive a vulnerable species towards extinction|extinction,predator
extinct_pathogen|A new pathogen can contribute to extinction|extinction,pathogen
extinct_competition|Competition can contribute to species extinction|extinction,competition
extinct_catastrophe|A catastrophic event can cause extinction|extinction,environment_variation
resistant_mutation|Mutation can produce an antibiotic-resistant bacterial variant|mutation,antibiotic,prokaryote
resistant_survive|Antibiotic treatment selects surviving resistant bacteria|resistant_mutation,natural_selection
resistant_bacteria|Rapid bacterial reproduction increases the resistant population|resistant_survive,binary_fission
mrsa|MRSA is an example of antibiotic-resistant bacteria|resistant_bacteria
antibiotic_appropriate|Avoiding inappropriate antibiotic use reduces selection for resistance|resistant_survive,antibiotic_virus
antibiotic_course|Following the prescribed antibiotic course helps eliminate the infection|antibiotic,resistant_bacteria
antibiotic_farm|Restricting agricultural antibiotics reduces resistance selection|resistant_survive
e_antibiotic_develop|Slow costly drug development struggles to match emerging resistance|resistant_bacteria,clinical_patient
`);
section('6.4 Classification of living organisms', '4.6.4', `
classification|Classification groups organisms by shared characteristics|organism,variation
kingdom|A kingdom is a broad traditional classification group|classification
phylum|A phylum groups related classes within a kingdom|kingdom
class|A class groups related orders within a phylum|phylum
order|An order groups related families within a class|class
family|A family groups related genera within an order|order
genus|A genus groups closely related species within a family|family,species
binomial|A binomial scientific name consists of genus and species|genus,species
classification_evidence|Microscopy and biochemical evidence can revise classification|classification,electron_resolution,theory_revision
domain|Woese's three-domain system reflects biochemical evidence|classification_evidence
archaea|Archaea are a domain distinct from true bacteria|domain,prokaryote
bacteria_domain|Bacteria form the domain containing true bacteria|domain,prokaryote
eukaryota|Eukaryota includes organisms with eukaryotic cells|domain,eukaryote
evolution_tree|Evolutionary-tree branch points represent shared ancestors|common_ancestor,classification,model
a_tree|Inferring relative relatedness from an evolutionary tree|evolution_tree
`);
section('7.1 Adaptations, interdependence and competition', '4.7.1.1,4.7.1.2,4.7.1.3,4.7.1.4', `
population|A population comprises one species in an area|species
community|A community comprises interacting populations|population
ecosystem|An ecosystem combines a community with its non-living environment|community
competition|Organisms compete for limited resources|organism,population
plant_compete_light|Plants compete for light needed in photosynthesis|competition,photosynthesis
plant_compete_space|Plants compete for space to grow|competition
plant_compete_water|Plants compete for water|competition,root_water
plant_compete_ions|Plants compete for mineral ions|competition,root_ions
animal_compete_food|Animals compete for food|competition,respiration
animal_compete_mates|Animals compete for reproductive mates|competition,sexual
animal_compete_territory|Animals compete for territory|competition
interdependence|A change in one species can affect others that depend on it|community
stable_community|A stable community has relatively constant populations over time|community,interdependence
abiotic|Abiotic factors are non-living environmental conditions|ecosystem
abiotic_light|Light availability affects photosynthetic organisms' distribution|abiotic,photo_light
abiotic_temperature|Temperature affects organisms through reaction rates and survival limits|abiotic,enzyme_temp,enzyme_hot
abiotic_water|Water availability affects organism survival and distribution|abiotic,osmosis
abiotic_ph|Soil pH affects plant growth and distribution|abiotic,ph
abiotic_mineral|Soil mineral availability affects plant growth|abiotic,root_ions
abiotic_wind|Wind affects water loss and organism distribution|abiotic,trans_wind
abiotic_co2|Carbon dioxide availability affects photosynthetic organisms|abiotic,photo_co2
abiotic_oxygen|Dissolved oxygen affects aerobic aquatic organisms|abiotic,aerobic
biotic|Biotic factors arise from living organisms|ecosystem
biotic_food|Food availability affects population size|biotic,respiration
biotic_predator|A new predator can reduce prey numbers|biotic,predator
biotic_pathogen|A new pathogen can reduce population size|biotic,pathogen
biotic_competitor|A more effective competitor can suppress another population|biotic,competition
adaptation|An adaptation helps an organism survive in its usual environment|organism,natural_selection
structural_adapt|A structural adaptation is a beneficial physical feature|adaptation
behaviour_adapt|A behavioural adaptation is a beneficial pattern of activity|adaptation
functional_adapt|A functional adaptation is a beneficial internal process|adaptation
extremophile|Extremophiles survive unusually harsh environmental conditions|adaptation,abiotic
`);
section('7.2 Organisation of an ecosystem', '4.7.2.1', `
biomass|Biomass is the mass of living biological material|organism,measurement
producer|Photosynthetic producers make the biomass that supports food chains|photosynthesis,biomass
primary_consumer|A primary consumer feeds on producers|producer
secondary_consumer|A secondary consumer feeds on primary consumers|primary_consumer
tertiary_consumer|A tertiary consumer feeds on secondary consumers|secondary_consumer
food_chain|Food-chain arrows show transfer from food to consumer|producer,primary_consumer,model
predator|A predator kills and eats prey|organism,primary_consumer
predator_rise|Greater prey availability can increase predator numbers|predator,population
prey_fall|Increased predation can reduce prey numbers|predator_rise
predator_fall|Reduced prey availability can lower predator numbers|prey_fall,biotic_food
prey_recover|Lower predation permits prey numbers to recover|predator_fall
a_predator_cycle|Reading the time lag in predator-prey population cycles|prey_recover,p_plot
`);
section('7.2 Organisation of an ecosystem', '4.7.2.1,8.2.9', `
p_quadrat|Counting a species within a quadrat using a consistent boundary rule|population,p_scale
p_quadrat_random|Placing quadrats using randomly selected coordinates|p_quadrat,p_random_sample
p_transect|Sampling along a transect across an environmental gradient|p_quadrat,abiotic,p_scale
p_field_factor|Measuring the environmental factor at each sampling position|p_transect,p_instrument
a_population_estimate|Estimating total population from mean density and habitat area|p_quadrat_random,population,mean,area
a_distribution|Relating transect abundance to the measured environmental factor|p_field_factor,p_transect,abiotic,correlation
e_quadrat_number|More representative quadrats improve a population estimate|p_quadrat_random,representative,uncertainty
`, [9]);
section('7.2 Organisation of an ecosystem', '4.7.2.2,4.7.2.3,4.7.2.4', `
material_cycle|Matter is recycled between organisms and the environment|ecosystem,particle
carbon_photo|Photosynthesis transfers atmospheric carbon into biological molecules|material_cycle,photosynthesis
carbon_feed|Feeding transfers carbon between organisms|material_cycle,food_chain
carbon_respire|Respiration returns biological carbon to the atmosphere as carbon dioxide|material_cycle,aerobic
carbon_combustion|Burning biological material returns carbon dioxide to the atmosphere|material_cycle,reaction
water_evaporate|Evaporation transfers liquid water into atmospheric vapour|material_cycle,energy
water_condense|Cooling water vapour condenses into droplets|water_evaporate
water_precipitate|Precipitation returns atmospheric water to land and sea|water_condense
water_drain|Water drains from land towards rivers and seas|water_precipitate
water_plant|Plant water uptake and transpiration connect soil and atmosphere|water_precipitate,root_water,transpiration
decomposition|Decomposers break down dead material by secreting digestive enzymes|digestion,enzyme,organism
decomposer_absorb|Soluble digestion products diffuse into decomposer cells|decomposition,diffusion
decay_carbon|Decomposer respiration returns carbon dioxide to the atmosphere|decomposer_absorb,aerobic,carbon_respire
decay_minerals|Decomposition returns mineral ions to the soil|decomposition,material_cycle
decay_temperature|Temperature affects decay through decomposer enzyme activity|decomposition,enzyme_temp,enzyme_hot
decay_water|Moisture supports decomposer activity|decomposition,homeo_water
decay_oxygen|Oxygen availability supports aerobic decomposition|decomposition,aerobic
compost|Managing warmth, moisture and aeration speeds compost production|decay_temperature,decay_water,decay_oxygen
biogas|Anaerobic decomposition can produce methane fuel|decomposition,fermentation
environment_distribution|Environmental change alters where species can survive|abiotic,adaptation,population
seasonal_distribution|Seasonal changes can alter species distribution|environment_distribution
geographic_distribution|Geographic differences can alter species distribution|environment_distribution
human_distribution|Human-driven environmental changes can alter species distribution|environment_distribution
`);
section('7.2 Organisation of an ecosystem', '4.7.2.3,8.2.10', `
p_milk_temperature|Equilibrating equal fresh-milk samples at chosen temperatures|p_waterbath,p_volume,control
p_milk_ph|Recording milk pH at regular time intervals|p_milk_temperature,p_ph,p_timer
a_milk_decay|Calculating decay rate from milk pH change per unit time|p_milk_ph,decomposition,rate
a_milk_temperature|Interpreting temperature effects on milk-decay rate|a_milk_decay,decay_temperature,p_best_fit
e_milk_equilibrate|Starting before equilibration makes the assigned temperature unreliable|p_milk_temperature,accuracy
`, [10]);
section('7.3 Biodiversity and human interaction', '4.7.3.1,4.7.3.2,4.7.3.3,4.7.3.4,4.7.3.5,4.7.3.6', `
biodiversity|Biodiversity is the variety of species in an ecosystem or on Earth|species,ecosystem
biodiversity_stability|Biodiversity reduces dependence on individual species and supports stability|biodiversity,interdependence
human_resource|Population growth and higher living standards increase resource demand and waste|population,material_cycle
water_pollution|Sewage, fertilisers or toxic chemicals can pollute water|human_resource,ecosystem
air_pollution|Smoke and acidic gases can pollute air|human_resource,ecosystem
land_pollution|Landfill and toxic chemicals can pollute land|human_resource,ecosystem
pollution_biodiversity|Pollution can kill organisms and reduce biodiversity|water_pollution,air_pollution,land_pollution,biodiversity
habitat_build|Building reduces habitat available to other species|ecosystem,population
habitat_quarry|Quarrying removes habitats|ecosystem
habitat_farm|Converting land to farming removes existing habitats|ecosystem
habitat_waste|Waste disposal occupies and damages habitats|ecosystem,land_pollution
peat_habitat|Peat extraction destroys a distinctive habitat and reduces biodiversity|biodiversity,ecosystem
peat_carbon|Decay or burning of peat releases stored carbon dioxide|carbon_combustion,decay_carbon
e_peat|Using peat compost trades horticultural benefit against habitat and carbon costs|peat_habitat,peat_carbon,e_technology
deforest_food|Forests are cleared to provide cattle-grazing and crop land|habitat_farm
deforest_biofuel|Forests are cleared to grow biofuel crops|habitat_farm,energy
deforest_carbon|Deforestation increases net carbon dioxide through loss of photosynthesis and biomass removal|carbon_photo,carbon_combustion,deforest_food
greenhouse_gas|Increasing carbon dioxide and methane contributes to global warming|energy,carbon_respire,biogas
warming_distribution|Global warming can shift species distributions|greenhouse_gas,environment_distribution
warming_extinction|Rapid climate change can increase extinction risk|greenhouse_gas,extinct_environment
climate_consensus|Scientific climate consensus draws on many peer-reviewed studies|greenhouse_gas,peer_review
conserve_breed|Breeding programmes help sustain endangered populations|extinction,sexual,biodiversity
conserve_habitat|Protecting and restoring habitats supports biodiversity|biodiversity,ecosystem
conserve_margin|Field margins and hedgerows provide habitats in farmland|conserve_habitat,habitat_farm
conserve_forest|Reducing deforestation preserves habitats and carbon uptake|deforest_carbon,conserve_habitat
conserve_emissions|Reducing carbon emissions limits climate-related biodiversity loss|warming_extinction
recycle|Recycling materials reduces resource extraction and landfill demand|material_cycle,land_pollution
e_conservation|Conservation decisions can conflict with demand for land and resources|conserve_habitat,human_resource,e_technology
`);
section('7.4 Trophic levels in an ecosystem', '4.7.4.1,4.7.4.2,4.7.4.3', `
trophic_level|A trophic level is an organism's feeding position starting with producers at level one|food_chain
apex|An apex predator has no predators in its food web|predator
biomass_pyramid|A biomass pyramid compares total biomass at successive trophic levels|biomass,trophic_level
p_pyramid|Drawing biomass bars to a consistent scale with producers at the base|biomass_pyramid,p_scale
a_pyramid|Reading relative trophic biomass from a scaled pyramid|p_pyramid,biomass_pyramid
light_efficiency|Producers transfer about one percent of incident light energy in photosynthesis|photosynthesis,percentage
biomass_uneaten|Uneaten material is not transferred to the next trophic level|biomass,food_chain
biomass_faeces|Egested undigested material reduces biomass transfer|digestion,biomass,food_chain
biomass_respiration|Respiration removes absorbed biomass as carbon dioxide and water|aerobic,biomass,food_chain
biomass_urine|Excretion removes absorbed material as urea and water|urine,biomass,food_chain
biomass_efficiency|Typically only about ten percent of biomass passes to the next trophic level|biomass_uneaten,biomass_faeces,biomass_respiration,biomass_urine
a_biomass_efficiency|Calculating biomass-transfer efficiency as output divided by input times 100|biomass_efficiency,percentage
e_trophic_numbers|Limited biomass transfer constrains populations at higher trophic levels|biomass_efficiency,population
`);
section('7.5 Food production', '4.7.5.1,4.7.5.2,4.7.5.3,4.7.5.4', `
food_security|Food security means enough food to feed a population|population
food_birth|Rising birth rates increase food demand|food_security,population
food_diet|Changing diets alter demand for scarce food resources|food_security,animal_compete_food
food_pathogen|New pests and pathogens reduce agricultural output|food_security,pathogen
food_environment|Adverse environmental change can cause crop failure and famine|food_security,abiotic_water
food_inputs|Expensive agricultural inputs can limit food production|food_security,e_technology
food_conflict|Conflict can interrupt food and water availability|food_security
farm_movement|Restricting livestock movement reduces respiratory energy expenditure|resp_movement,biomass_efficiency
farm_temperature|Maintaining suitable housing temperature reduces livestock energy loss|resp_warmth,biomass_efficiency
farm_protein|Protein-rich feed supports livestock growth|protein_synthesis,growth_mitosis
e_farm_welfare|Intensive-farming efficiency can conflict with animal welfare|farm_movement,p_ethics_organism
sustainable_fish|Fish harvesting must leave enough breeding adults to replenish stocks|food_security,population,sexual
fish_mesh|Larger net mesh allows young fish to escape and reach breeding age|sustainable_fish
fish_quota|Catch quotas limit removal of breeding fish stocks|sustainable_fish
mycoprotein|Fusarium biomass provides a protein-rich food source|protein,biomass
p_fusarium|Culturing Fusarium on glucose syrup with an oxygen supply|mycoprotein,aerobic,culture_medium
p_harvest_fungus|Harvesting and purifying Fusarium biomass for food|p_fusarium
a_fusarium|Explaining oxygen and nutrient needs in mycoprotein production|p_fusarium,aerobic,resp_synthesis
p_harvest_insulin|Harvesting and purifying insulin made by engineered bacteria|gm_insulin,culture_medium
golden_rice|Genetic modification can improve a crop's nutritional value|genetic_engineering,food_security
`);
};
