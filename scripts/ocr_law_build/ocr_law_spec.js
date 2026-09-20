// OCR A Level Law (H415) structure, taken from the official specification
// (https://www.ocr.org.uk/Images/315216-specification-accredited-a-level-gce-law-h415.pdf).
// `bullets` follow the specification's own content lines; `lessons` are the same
// content re-expressed in our own words as lesson-sized chunks, used for the
// "where are you in the course" plan and the Practice Questions tree.
// Subtopic numbers are ours (1.x = component 01 section A, ... 7.x = component 03 option 2).

const P1 = 'Paper 1: The legal system and criminal law';
const P2 = 'Paper 2: Law making and the law of tort';
const P3 = 'Paper 3: Further law';

const THEMES = [
  {
    theme: 'Theme 1 - The legal system: courts, legal personnel and access to justice',
    branch: P1,
    subtopics: [
      {
        code: '1.1', title: 'Civil courts and other forms of dispute resolution',
        bullets: [
          'County Court and High Court: jurisdictions, pre-trial procedures, the three tracks',
          'Appeals and appellate courts',
          'Tribunals and Alternative Dispute Resolution',
          'Online courts and Online Dispute Resolution',
          'Evaluation of the civil courts and other forms of dispute resolution',
        ],
        lessons: [
          'How civil cases start: the County Court, the High Court and pre-action steps',
          'The small claims, fast and multi-track routes',
          'Civil appeals and the courts that hear them',
          'Tribunals, mediation, arbitration, conciliation and negotiation',
          'Online courts and online dispute resolution',
          'Weighing up civil courts against other ways of settling disputes',
        ],
      },
      {
        code: '1.2', title: 'Criminal courts, sentencing and lay people',
        bullets: [
          "Criminal process: jurisdiction of the Magistrates' Court and the Crown Court, classification of offences, pre-trial procedures",
          'Appeals and appellate courts',
          'Sentencing and court powers: aims, factors and types of sentences',
          'Lay magistrates and juries: qualifications, selection, appointment and role in criminal cases',
          'Evaluation of the different types of sentences and of using lay people in criminal cases',
        ],
        lessons: [
          'Classifying offences and how a criminal case moves through the courts',
          'Bail, pre-trial procedure and the Magistrates and Crown Court',
          'Criminal appeals and the courts that hear them',
          'The aims of sentencing and the factors a court weighs',
          'Custodial, community and other sentences',
          'Lay magistrates: who they are and what they do',
          'Juries: eligibility, selection and their role',
          'Judging the value of sentences and of lay people in criminal cases',
        ],
      },
      {
        code: '1.3', title: 'Legal personnel and the judiciary',
        bullets: [
          'Barristers, solicitors and legal executives: qualifications, training, work and regulation of the legal professions',
          'Changes and trends in legal services, including the impact of technology and globalisation',
          'The judiciary: qualifications, selection and appointment, training, role, retirement and removal',
          'The separation of powers and the independence of the judiciary',
          'Evaluation of the legal professions and the judiciary',
        ],
        lessons: [
          'Barristers, solicitors and legal executives: routes in and what each does',
          'How the legal professions are regulated',
          'Technology, globalisation and changing legal services',
          'Judges: levels, appointment, training, removal and retirement',
          'The separation of powers and judicial independence',
          'Judging the legal professions and the judiciary',
        ],
      },
      {
        code: '1.4', title: 'Access to justice and funding',
        bullets: [
          'Government funding for civil and criminal cases',
          'Private funding, conditional fees, other advice agencies',
          'Evaluation of access to justice',
        ],
        lessons: [
          'Legal aid and other public funding in civil and criminal cases',
          'Paying privately: conditional fee agreements, insurance and pro bono help',
          'Advice agencies and free sources of help',
          'Judging how open justice really is',
        ],
      },
    ],
  },
  {
    theme: 'Theme 2 - Criminal law: general principles, offences and defences',
    branch: P1,
    subtopics: [
      {
        code: '2.1', title: 'Rules and theory of criminal law',
        bullets: ['An outline of the rules of criminal law', 'An overview of the theory of criminal law'],
        lessons: [
          'What criminal law is, its sources and burden and standard of proof',
          'Why we have criminal law: theories and purposes',
        ],
      },
      {
        code: '2.2', title: 'General elements of criminal liability',
        bullets: [
          'Actus reus: conduct and consequence crimes; voluntary acts and omissions; involuntariness; causation',
          'Mens rea: fault; intention and subjective recklessness; negligence and strict liability; transferred malice; coincidence of actus reus and mens rea',
        ],
        lessons: [
          'The guilty act: conduct and result crimes, voluntary acts and involuntariness',
          'Liability for omissions',
          'Causation: factual and legal cause, and breaks in the chain',
          'The guilty mind: intention and recklessness',
          'Negligence and strict liability',
          'Transferred malice and coincidence of actus reus and mens rea',
        ],
      },
      {
        code: '2.3', title: 'Fatal offences against the person',
        bullets: [
          'Murder: actus reus and mens rea',
          'Voluntary manslaughter: defences of loss of control and diminished responsibility under the Coroners and Justice Act 2009',
          'Involuntary manslaughter: unlawful act manslaughter and gross negligence manslaughter',
        ],
        lessons: [
          'Murder: the guilty act and guilty mind',
          'Voluntary manslaughter: loss of control',
          'Voluntary manslaughter: diminished responsibility',
          'Unlawful act manslaughter',
          'Gross negligence manslaughter',
        ],
      },
      {
        code: '2.4', title: 'Non-fatal offences against the person',
        bullets: [
          'Common assault: assault and battery under s39 Criminal Justice Act 1988',
          'Assault occasioning actual bodily harm, wounding and grievous bodily harm under s47, s20 and s18 Offences Against the Person Act 1861',
        ],
        lessons: [
          'Assault and battery',
          'Assault occasioning actual bodily harm (s47)',
          'Wounding and grievous bodily harm: s20 and s18',
        ],
      },
      {
        code: '2.5', title: 'Offences against property',
        bullets: [
          'Theft under s1 Theft Act 1968',
          'Robbery under s8 Theft Act 1968',
          'Burglary under s9(1)(a) and s9(1)(b) Theft Act 1968',
        ],
        lessons: [
          'Theft: the guilty act and the elements of appropriation, property and belonging to another',
          'Theft: dishonesty and intention to permanently deprive',
          'Robbery',
          'Burglary: the two forms under s9',
        ],
      },
      {
        code: '2.6', title: 'Mental capacity defences',
        bullets: ['Insanity, automatism, intoxication'],
        lessons: [
          'Insanity: the M\'Naghten rules',
          'Automatism',
          'Intoxication: voluntary and involuntary',
        ],
      },
      {
        code: '2.7', title: 'General defences',
        bullets: ['Self-defence, duress by threats, duress of circumstances and necessity', 'Consent'],
        lessons: [
          'Self-defence and defence of another',
          'Duress by threats and duress of circumstances',
          'Necessity',
          'Consent',
        ],
      },
      {
        code: '2.8', title: 'Preliminary offences',
        bullets: ['Attempts: the actus reus and mens rea; impossibility'],
        lessons: ['Attempts: the guilty act, guilty mind and impossibility'],
      },
      {
        code: '2.9', title: 'Evaluation of criminal law',
        bullets: ['Critical evaluation of offences against the person, offences against property and defences including ideas for reform'],
        lessons: [
          'Judging the offences against the person and the case for reform',
          'Judging the property offences and the defences, and the case for reform',
        ],
      },
    ],
  },
  {
    theme: 'Theme 3 - Law making: Parliament, delegated legislation, interpretation, precedent and reform',
    branch: P2,
    subtopics: [
      {
        code: '3.1', title: 'Parliamentary law making',
        bullets: [
          'Influences on Parliament: political, public opinion, media, pressure groups and lobbyists',
          'Legislative process: Green and White Papers, different types of Bill, legislative stages in the House of Commons and the House of Lords and the role of the Crown',
          'Advantages and disadvantages of influences on law making',
          'Advantages and disadvantages of the legislative process',
        ],
        lessons: [
          'What shapes new laws: politics, public opinion, media and pressure groups',
          'Green and White Papers and the types of Bill',
          'A Bill\'s journey through the Commons, the Lords and Royal Assent',
          'Judging the influences on law making',
          'Judging the legislative process',
        ],
      },
      {
        code: '3.2', title: 'Delegated legislation',
        bullets: [
          'Types of delegated legislation: Orders in Council, Statutory Instruments and By-laws',
          'Controls on delegated legislation by Parliament and the courts, and their effectiveness',
          'Reasons for the use of delegated legislation',
          'Advantages and disadvantages of delegated legislation',
        ],
        lessons: [
          'Orders in Council, statutory instruments and by-laws',
          'Why Parliament delegates its law-making power',
          'Parliamentary and court controls over delegated legislation',
          'Judging delegated legislation',
        ],
      },
      {
        code: '3.3', title: 'Statutory interpretation',
        bullets: [
          'Rules of statutory interpretation: the literal rule, the golden rule and the mischief rule',
          'The purposive approach',
          'Aids to interpretation: rules of language, intrinsic and extrinsic aids',
          'Impact of European Union law and the Human Rights Act 1998 on statutory interpretation',
          'Advantages and disadvantages of the different approaches and aids to statutory interpretation',
        ],
        lessons: [
          'The literal rule',
          'The golden rule',
          'The mischief rule',
          'The purposive approach',
          'Aids to interpretation: language rules, intrinsic and extrinsic aids',
          'How EU law and the Human Rights Act change interpretation',
          'Judging the approaches and aids to interpretation',
        ],
      },
      {
        code: '3.4', title: 'Judicial precedent',
        bullets: [
          'The Doctrine of Precedent including stare decisis, ratio decidendi and obiter dicta',
          'The hierarchy of the courts including the Supreme Court',
          'Binding, persuasive and original precedent; overruling; reversing; distinguishing',
          'Advantages and disadvantages of precedent',
        ],
        lessons: [
          'Stare decisis, ratio decidendi and obiter dicta',
          'The court hierarchy and how each court is bound',
          'Binding, persuasive and original precedent',
          'Overruling, reversing and distinguishing',
          'Judging the doctrine of precedent',
        ],
      },
      {
        code: '3.5', title: 'Law reform',
        bullets: ['Law reform including the Law Commission', 'Advantages and disadvantages of law reform bodies'],
        lessons: [
          'How the law is reformed: the Law Commission and other bodies',
          'Judging law reform bodies',
        ],
      },
      {
        code: '3.6', title: 'European Union law',
        bullets: [
          'Institutions of the European Union',
          'Sources of European Union law',
          'Impact of European Union law on the law of England and Wales',
        ],
        lessons: [
          'The institutions of the European Union',
          'Where EU law comes from',
          'How EU law affected English and Welsh law',
        ],
      },
    ],
  },
  {
    theme: 'Theme 4 - The law of tort: negligence, occupiers, land, vicarious liability, defences and remedies',
    branch: P2,
    subtopics: [
      {
        code: '4.1', title: 'Rules and theory of tort',
        bullets: ['An outline of the rules of the law of tort', 'An overview of the theory of the law of tort'],
        lessons: ['What tort law is and how it compares with crime', 'Why tort exists: compensation, deterrence and fault'],
      },
      {
        code: '4.2', title: 'Liability in negligence',
        bullets: [
          'Liability in negligence for injury to people and damage to property',
          'The duty of care: Donoghue v Stevenson (1932) and the neighbour principle, and the Caparo test',
          'Breach of duty: the objective standard of care and the reasonable man; risk factors',
          'Damage: factual causation and the but for test; legal causation',
        ],
        lessons: [
          'The neighbour principle and the origins of the duty of care',
          'The Caparo three-stage test and how duty has developed',
          'Breach of duty: the reasonable person and the standard of care',
          'Risk factors that raise or lower the standard',
          'Factual causation and the but-for test',
          'Legal causation, remoteness and breaks in the chain',
        ],
      },
      {
        code: '4.3', title: "Occupiers' liability",
        bullets: [
          'Liability in respect of lawful visitors (Occupiers\' Liability Act 1957)',
          'Liability in respect of trespassers (Occupiers\' Liability Act 1984)',
        ],
        lessons: [
          'Lawful visitors and the Occupiers\' Liability Act 1957',
          'Trespassers and the Occupiers\' Liability Act 1984',
        ],
      },
      {
        code: '4.4', title: 'Torts connected to land',
        bullets: ['Public and private nuisance', 'Rylands v Fletcher'],
        lessons: ['Private nuisance', 'Public nuisance', 'The rule in Rylands v Fletcher'],
      },
      {
        code: '4.5', title: 'Vicarious liability',
        bullets: [
          'Nature and purpose of vicarious liability',
          'Liability for employees, including testing employment status and torts in or not in the course of employment',
          'Liability for the crimes of employees and liability for independent contractors',
        ],
        lessons: [
          'What vicarious liability is and why it exists',
          'Is the worker an employee? The employment status tests',
          'Torts in the course of employment and employees\' crimes',
          'Independent contractors',
        ],
      },
      {
        code: '4.6', title: 'Defences in tort',
        bullets: [
          'Contributory negligence',
          'Volenti non fit injuria',
          'Defences specific to claims connected to nuisance and Rylands v Fletcher',
        ],
        lessons: ['Contributory negligence', 'Volenti non fit injuria (consent)', 'Defences to nuisance and Rylands v Fletcher claims'],
      },
      {
        code: '4.7', title: 'Remedies in tort',
        bullets: ['Compensatory damages', 'Mitigation of loss', 'Injunctions'],
        lessons: ['Compensatory damages', 'The duty to mitigate loss', 'Injunctions'],
      },
      {
        code: '4.8', title: 'Evaluation of tort law',
        bullets: ['Critical evaluation of liability in negligence, occupiers\' liability, torts connected to land and vicarious liability, including ideas for reform'],
        lessons: [
          'Judging negligence and occupiers\' liability, and the case for reform',
          'Judging land torts and vicarious liability, and the case for reform',
        ],
      },
    ],
  },
  {
    theme: 'Theme 5 - The nature of law: rules, morality, justice, society and technology',
    branch: P3,
    subtopics: [
      {
        code: '5.1', title: 'Law and rules',
        bullets: [
          'Law and rules: the difference between enforceable legal rules and principles and other rules and norms of behaviour',
          'The connections between law, morality and justice',
          'The differences between civil and criminal law',
          'An overview of the development of English Law: custom, common law, equity, statute law',
          'An overview of common law and civil law legal systems',
          'The rule of law: definition and importance',
        ],
        lessons: [
          'Legal rules versus other rules and norms',
          'Civil and criminal law compared',
          'How English law developed: custom, common law, equity and statute',
          'Common law and civil law systems',
          'The rule of law',
        ],
      },
      {
        code: '5.2', title: 'Law and morality',
        bullets: [
          'The distinction between law and morals',
          'The diversity of moral views in a pluralist society',
          'The relationship between law and morals and its importance',
          'The legal enforcement of moral values',
        ],
        lessons: [
          'Law and morals: how they differ',
          'Moral diversity in a pluralist society',
          'Should the law enforce morality? The key debates',
        ],
      },
      {
        code: '5.3', title: 'Law and justice',
        bullets: ['The meaning of justice', 'Theories of justice', 'The extent to which the law achieves justice'],
        lessons: [
          'What justice means',
          'Theories of justice',
          'How far the law achieves justice',
        ],
      },
      {
        code: '5.4', title: 'Law and society',
        bullets: [
          'The role law plays in society',
          'The law as a social control mechanism',
          'The way in which the law creates and deals with consensus and conflict',
          'The realist approach to law making',
        ],
        lessons: [
          'What law does for society',
          'Law as social control',
          'Consensus, conflict and the law',
          'The realist view of law making',
        ],
      },
      {
        code: '5.5', title: 'Law and technology',
        bullets: [
          'The intersection of law and technology',
          'Key issues, including privacy and data protection and cyber-crime',
          'Cross-border issues and future challenges',
        ],
        lessons: [
          'How technology challenges the law',
          'Privacy, data protection and cyber-crime',
          'Cross-border problems and future challenges',
        ],
      },
    ],
  },
  {
    theme: 'Theme 6 - Human rights law (option): protection, Convention rights and restrictions',
    branch: P3,
    subtopics: [
      {
        code: '6.1', title: 'Rules and theory of human rights law',
        bullets: ['An outline of the rules of human rights law', 'An overview of the theory of human rights law'],
        lessons: ['What human rights are and where they come from', 'Theories of why humans have rights'],
      },
      {
        code: '6.2', title: "Protecting individual rights in the UK",
        bullets: [
          'An overview of the development of human rights in the UK, including Magna Carta 1215 and the Bill of Rights 1688',
          'The history of the European Court of Human Rights',
          'The impact of the Human Rights Act 1998',
          'The entrenched nature of the Human Rights Act 1998 in the devolution settlements of Scotland, Wales and Northern Ireland',
        ],
        lessons: [
          'Human rights before the Convention: Magna Carta and the Bill of Rights',
          'The European Convention and the European Court of Human Rights',
          'The Human Rights Act 1998 and its effect',
          'Human rights and devolution',
        ],
      },
      {
        code: '6.3', title: 'Key provisions of the European Convention on Human Rights',
        bullets: [
          'Article 5: the right to liberty and security',
          'Article 6: the right to a fair trial',
          'Article 8: the right to respect for family and private life',
          'Article 10: the right to freedom of expression',
          'Article 11: freedom of assembly',
          'Restrictions permitted by the European Convention on Human Rights',
        ],
        lessons: [
          'Article 5: liberty and security',
          'Article 6: a fair trial',
          'Article 8: private and family life',
          'Article 10: freedom of expression',
          'Article 11: freedom of assembly',
          'How the Convention allows rights to be restricted',
        ],
      },
      {
        code: '6.4', title: 'Restrictions on human rights in domestic law',
        bullets: [
          'Public order offences', 'Police powers', 'Interception of communications', 'Duty of confidentiality',
          'Obscenity', 'Torts of defamation and trespass', 'Harassment',
        ],
        lessons: [
          'Public order offences',
          'Police powers of stop, search, arrest and detention',
          'Interception of communications and the duty of confidentiality',
          'Obscenity',
          'Defamation and trespass as limits on rights',
          'Harassment',
        ],
      },
      {
        code: '6.5', title: 'Enforcing human rights',
        bullets: ['Role of domestic courts', 'The process of judicial review', 'The role of the European Court of Human Rights'],
        lessons: [
          'How domestic courts protect rights',
          'Judicial review',
          'Taking a case to the European Court of Human Rights',
        ],
      },
      {
        code: '6.6', title: 'Evaluation of human rights law',
        bullets: ['Critical evaluation of human rights protection in the UK, the European Convention on Human Rights and the Human Rights Act 1998, including ideas for reform'],
        lessons: ['Judging human rights protection in the UK and the case for reform'],
      },
    ],
  },
  {
    theme: 'Theme 7 - The law of contract (option): formation, terms, vitiating factors, discharge and remedies',
    branch: P3,
    subtopics: [
      {
        code: '7.1', title: 'Rules and theory of contract law',
        bullets: ['An outline of the rules of the law of contract', 'An overview of the theory of the law of contract'],
        lessons: ['What a contract is and how contract law works', 'Why the law of contract exists'],
      },
      {
        code: '7.2', title: 'Formation of a contract',
        bullets: [
          'Offer and acceptance, including the rules of communication and revocation',
          'Intention to create legal relations: domestic and commercial, presumptions and rebuttals',
          'Consideration: adequacy, sufficiency, past consideration, pre-existing duties',
          'Privity: the rights of third parties under the Contract (Rights of Third Parties) Act 1999 and common law exceptions',
        ],
        lessons: [
          'Offer and invitation to treat',
          'Acceptance, communication and revocation',
          'Intention to create legal relations',
          'Consideration: what counts and what does not',
          'Past consideration and pre-existing duties',
          'Privity of contract and third-party rights',
        ],
      },
      {
        code: '7.3', title: 'Terms of a contract',
        bullets: [
          'Express and implied terms, including the Consumer Rights Act 2015',
          'Types of term: conditions, warranties, innominate terms',
          'Exclusion and limitation clauses, including the Unfair Contract Terms Act 1977 and the Consumer Rights Act 2015',
        ],
        lessons: [
          'Express terms and implied terms',
          'Conditions, warranties and innominate terms',
          'Exclusion and limitation clauses and the statutory controls on them',
        ],
      },
      {
        code: '7.4', title: 'Vitiating factors',
        bullets: ['Misrepresentation, including omission in consumer contexts', 'Economic duress'],
        lessons: ['Misrepresentation', 'Economic duress'],
      },
      {
        code: '7.5', title: 'Discharge of a contract',
        bullets: ['Performance', 'Frustration', 'Breach of contract: actual and anticipatory breach'],
        lessons: ['Discharge by performance', 'Frustration', 'Actual and anticipatory breach'],
      },
      {
        code: '7.6', title: 'Remedies for breach of contract',
        bullets: [
          'Damages: compensatory damages; causation and remoteness of damage; mitigation of loss',
          'Equitable remedies',
          'Consumer remedies under the Consumer Rights Act 2015',
        ],
        lessons: [
          'Compensatory damages, causation and remoteness',
          'Mitigation of loss',
          'Equitable remedies',
          'Consumer remedies under the Consumer Rights Act 2015',
        ],
      },
      {
        code: '7.7', title: 'Evaluation of contract law',
        bullets: ['Critical evaluation of formation and contract terms, including ideas for reform'],
        lessons: ['Judging the rules on formation and terms, and the case for reform'],
      },
    ],
  },
  {
    theme: 'Theme 8 - Legal skills: analysing scenarios, applying authority and building arguments',
    branch: 'All papers',
    subtopics: [
      {
        code: '8.1', title: 'Legal skills and argument',
        bullets: [
          'Analyse a factual scenario by identifying the key facts from which legal issues arise',
          'Analyse legislation by applying the rules and principles of statutory interpretation, and analyse case law by applying the doctrine of precedent',
          'Analyse, apply and evaluate the legal rules and principles of each area of law: break them into constituent parts and apply them to a hypothetical scenario',
          'Construct clear, concise and logical legal arguments substantiated by legal authority, using appropriate legal terminology',
          'Construct a persuasive argument where there are no clear or conflicting precedents',
          'Analyse and critically evaluate legal issues by identifying different perspectives, supporting the strongest viewpoint and countering alternatives',
        ],
        lessons: [
          'Spotting the legal issues in a scenario',
          'Applying a legal rule to the facts step by step',
          'Using cases and statutes as authority',
          'Arguing when precedents conflict or are missing',
          'Weighing perspectives and reaching a supported conclusion',
        ],
      },
    ],
  },
];

module.exports = { THEMES, SUBJECT: 'Law', QUALIFICATION: 'A-Level', EXAM_BOARD: 'OCR', SPEC: 'H415' };
