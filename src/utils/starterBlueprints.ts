import type {
  AlertnessWindow,
  ClassStatus,
  LearningStylePreset,
  SubjectDifficulty,
  SubjectProfile,
  TopicItem,
  YieldType,
} from '../types.ts';

export interface BlueprintChapterSpec {
  title: string;
  estimatedHours: number;
  yieldType: YieldType;
  pyqWeightPercent: number;
  pyqFrequencyNote: string;
  classStatus: ClassStatus;
  youtubeChannelHint: string;
  keyConcepts: string[];
}

export interface BlueprintSubjectSpec {
  name: string;
  difficulty: SubjectDifficulty;
  previousScoreOutOf100: number;
  chapters: BlueprintChapterSpec[];
}

export interface StarterSyllabusBlueprint {
  id: string;
  shortLabel: string;
  badgeStream: string;
  institutionType: 'school' | 'university';
  boardOrUniversity: string;
  examName: string;
  recommendedDailyHours: number;
  recommendedAlertness: AlertnessWindow;
  recommendedLearningStyle: LearningStylePreset;
  pyqOverview: string;
  advisorGreeting: string;
  subjects: BlueprintSubjectSpec[];
}

export const STARTER_SYLLABUS_BLUEPRINTS: StarterSyllabusBlueprint[] = [
  {
    id: 'blueprint-cbse-12-pcm',
    shortLabel: 'CBSE Class 12 PCM',
    badgeStream: 'Board + Engineering Core',
    institutionType: 'school',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'AISSCE Class 12 PCM Board Finals',
    recommendedDailyHours: 5.0,
    recommendedAlertness: 'early_morning',
    recommendedLearningStyle: 'step_by_step',
    pyqOverview:
      'Pre-tagged from 10-year CBSE Delhi & All-India PYQ sets: Optics, Electrostatics, Definite Integrals, and Carbonyl Chemistry drive ~68% of total board marks.',
    advisorGreeting:
      'Loaded CBSE Class 12 PCM with chapter-level PYQ weightages. Confirm your name, alertness window, and exam date to generate your timetable immediately, or customize past marks in Step 3.',
    subjects: [
      {
        name: 'Physics',
        difficulty: 'hard',
        previousScoreOutOf100: 66,
        chapters: [
          {
            title: 'Electrostatics, Gauss Law & Dielectrics',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · 5-mark derivation in 9/10 CBSE sets',
            classStatus: 'covered',
            youtubeChannelHint: 'NCERT & CBSE Board Physics Lectures',
            keyConcepts: [
              'Gauss theorem spherical & line flux derivations',
              'Parallel-plate capacitor with dielectric slab',
              'Equipotential dipole field numericals',
            ],
          },
          {
            title: 'Current Electricity & Kirchhoff Networks',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 14,
            pyqFrequencyNote: '14% PYQ Weight · Wheatstone & cells numerical in 88% sets',
            classStatus: 'ongoing',
            youtubeChannelHint: 'CBSE Physics Problem Studio',
            keyConcepts: [
              'Drift velocity & temperature resistivity relation',
              'Kirchhoff loop & junction sign conventions',
              'Wheatstone bridge balance conditions',
            ],
          },
          {
            title: 'Electromagnetic Induction & AC Phasors',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 15,
            pyqFrequencyNote: '15% PYQ Weight · Series LCR resonance Q in 85% sets',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Board Exam Derivations Hub',
            keyConcepts: [
              'Faraday-Lenz motional EMF & mutual inductance',
              'Series LCR impedance triangle & power factor',
              'Step-up/step-down transformer losses',
            ],
          },
          {
            title: 'Ray & Wave Optics (Huygens & YDSE)',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Highest-weight CBSE Physics unit',
            classStatus: 'upcoming',
            youtubeChannelHint: 'CBSE Optics Masterclass',
            keyConcepts: [
              'Lens maker formula & compound microscope ray diagram',
              'Huygens wavefront refraction proof',
              'Young double-slit fringe width & diffraction',
            ],
          },
        ],
      },
      {
        name: 'Calculus & Vectors',
        difficulty: 'moderate',
        previousScoreOutOf100: 76,
        chapters: [
          {
            title: 'Continuity, Differentiability & Maxima-Minima',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 17,
            pyqFrequencyNote: '17% PYQ Weight · Compulsory 4-mark optimization case study',
            classStatus: 'covered',
            youtubeChannelHint: 'CBSE Class 12 Mathematics Archive',
            keyConcepts: [
              'Parametric & logarithmic differentiation',
              'Increasing/decreasing intervals',
              'Second-derivative maxima/minima word problems',
            ],
          },
          {
            title: 'Definite Integrals & Differential Equations',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 20,
            pyqFrequencyNote: '20% PYQ Weight · King property & linear ODE integrating factor',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Higher Secondary Calculus Studio',
            keyConcepts: [
              'Partial fractions & integration by parts',
              'Definite integral symmetry properties',
              'First-order linear differential equations dy/dx + Py = Q',
            ],
          },
          {
            title: 'Vectors & 3D Skew-Line Geometry',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 14,
            pyqFrequencyNote: '14% PYQ Weight · Shortest distance between skew lines 5-marker',
            classStatus: 'upcoming',
            youtubeChannelHint: '3D Geometry & Vector Visuals',
            keyConcepts: [
              'Scalar & vector cross product projection',
              'Cartesian & vector equation of a line in space',
              'Shortest distance between skew & parallel lines',
            ],
          },
          {
            title: 'Linear Programming Graphical Optimization',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 6,
            pyqFrequencyNote: '6% PYQ Weight · Direct corner-point 5-mark problem',
            classStatus: 'upcoming',
            youtubeChannelHint: 'CBSE Maths Quick Revision',
            keyConcepts: [
              'Feasible bounded vs unbounded region',
              'Corner-point objective evaluation',
            ],
          },
        ],
      },
      {
        name: 'Physical & Organic Chemistry',
        difficulty: 'moderate',
        previousScoreOutOf100: 72,
        chapters: [
          {
            title: 'Electrochemistry & Nernst Equation',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 14,
            pyqFrequencyNote: '14% PYQ Weight · Nernst EMF & Kohlrausch numericals',
            classStatus: 'covered',
            youtubeChannelHint: 'NCERT Chemistry Conceptuals',
            keyConcepts: [
              'Nernst cell EMF & Gibbs free energy relation',
              'Molar conductivity dilution curves & Kohlrausch law',
              'Faraday laws of electrolysis',
            ],
          },
          {
            title: 'Chemical Kinetics & Integrated Rate Laws',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 12,
            pyqFrequencyNote: '12% PYQ Weight · First-order half-life & Arrhenius log numericals',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Physical Chemistry PYQ Lab',
            keyConcepts: [
              'Order vs molecularity of elementary steps',
              'First-order integrated rate & t_1/2 derivation',
              'Arrhenius activation energy E_a calculation',
            ],
          },
          {
            title: 'Aldehydes, Ketones & Carboxylic Acids',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · Aldol, Cannizzaro & Tollens roadmap Qs',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Organic Mechanisms Classroom',
            keyConcepts: [
              'Nucleophilic addition reactivity order',
              'Aldol condensation vs Cannizzaro disproportionation',
              'Tollens, Fehling & iodoform distinction tests',
            ],
          },
          {
            title: 'Coordination Compounds & Biomolecules',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 8,
            pyqFrequencyNote: '8% PYQ Weight · VBT hybridization & CFT splitting short Qs',
            classStatus: 'upcoming',
            youtubeChannelHint: 'NCERT Line-by-Line Chemistry',
            keyConcepts: [
              'IUPAC nomenclature & geometrical isomerism',
              'Crystal field octahedral/tetrahedral splitting',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blueprint-cbse-12-pcb',
    shortLabel: 'CBSE Class 12 PCB',
    badgeStream: 'Board + Medical Core',
    institutionType: 'school',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'AISSCE Class 12 PCB Board & Medical Finals',
    recommendedDailyHours: 5.0,
    recommendedAlertness: 'early_morning',
    recommendedLearningStyle: 'visual_analogies',
    pyqOverview:
      'Pre-tagged from CBSE Class 12 Biology, Physics & Chemistry PYQs: Molecular Inheritance, Biotechnology, Optics, and Carbonyl Chemistry anchor ~70% of marks.',
    advisorGreeting:
      'Loaded CBSE Class 12 PCB with NCERT & past-board PYQ weightages. Enter your name and alertness slot to build your timetable right away.',
    subjects: [
      {
        name: 'Biology',
        difficulty: 'moderate',
        previousScoreOutOf100: 81,
        chapters: [
          {
            title: 'Molecular Basis of Inheritance (DNA & Lac Operon)',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Compulsory 5-mark replication/operon Q',
            classStatus: 'ongoing',
            youtubeChannelHint: 'NCERT Biology Diagrams & Genetics',
            keyConcepts: [
              'Meselson-Stahl semi-conservative replication fork',
              'Transcription unit, splicing & genetic code',
              'Lac operon inducible regulation & Human Genome Project',
            ],
          },
          {
            title: 'Principles of Inheritance & Mendelian Pedigrees',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 15,
            pyqFrequencyNote: '15% PYQ Weight · Pedigree chart & chromosomal disorders',
            classStatus: 'covered',
            youtubeChannelHint: 'Genetics & Evolution Classroom',
            keyConcepts: [
              'Incomplete dominance, co-dominance & ABO alleles',
              'Sex-linked haemophilia & colour-blindness pedigrees',
              'Sickle-cell anaemia vs thalassemia',
            ],
          },
          {
            title: 'Biotechnology: Principles, PCR & rDNA Applications',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · pBR322 vector, PCR & Bt-cotton case Qs',
            classStatus: 'ongoing',
            youtubeChannelHint: 'NCERT Biotech Masterclass',
            keyConcepts: [
              'Restriction endonucleases & gel electrophoresis',
              'pBR322 selectable markers & PCR amplification',
              'Genetically engineered insulin & RNA interference',
            ],
          },
          {
            title: 'Organisms, Ecosystem Energy & Biodiversity',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 8,
            pyqFrequencyNote: '8% PYQ Weight · Ecological pyramids & species-area curve',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Ecology & NCERT Summary',
            keyConcepts: [
              'Logistic Verhulst-Pearl population growth',
              '10% energy flow law & in-situ conservation',
            ],
          },
        ],
      },
      {
        name: 'Physics',
        difficulty: 'hard',
        previousScoreOutOf100: 64,
        chapters: [
          {
            title: 'Electrostatics & Capacitance Dielectrics',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · Gauss law & capacitor network numericals',
            classStatus: 'covered',
            youtubeChannelHint: 'Physics for PCB Scholars',
            keyConcepts: [
              'Electric dipole axial/equatorial field',
              'Energy stored in series/parallel capacitors',
            ],
          },
          {
            title: 'Ray Optics, Lenses & Optical Instruments',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Prism minimum deviation & telescope rays',
            classStatus: 'ongoing',
            youtubeChannelHint: 'CBSE Optics Visuals',
            keyConcepts: [
              'Total internal reflection & optical fibres',
              'Refraction at spherical surfaces & lens combinations',
            ],
          },
          {
            title: 'Dual Nature, Atoms & Semiconductor Diodes',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 14,
            pyqFrequencyNote: '14% PYQ Weight · Einstein photoelectric & p-n rectifier',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Modern Physics Board Prep',
            keyConcepts: [
              'Stopping potential vs frequency graphs',
              'Bohr hydrogen spectral series & full-wave rectifier',
            ],
          },
        ],
      },
      {
        name: 'Chemistry',
        difficulty: 'moderate',
        previousScoreOutOf100: 74,
        chapters: [
          {
            title: 'Solutions & Van’t Hoff Colligative Properties',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 13,
            pyqFrequencyNote: '13% PYQ Weight · Osmotic pressure & freezing depression',
            classStatus: 'covered',
            youtubeChannelHint: 'NCERT Physical Chemistry',
            keyConcepts: [
              'Raoult law positive/negative azeotropes',
              'Abnormal molar mass & Van’t Hoff factor i',
            ],
          },
          {
            title: 'Haloalkanes, Alcohols & Carbonyl Mechanisms',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · SN1/SN2, Reimer-Tiemann & Aldol',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Organic Chemistry Conversions',
            keyConcepts: [
              'SN1 vs SN2 stereochemical inversion/racemization',
              'Lucas, Victor Meyer & iodoform chemical tests',
            ],
          },
          {
            title: 'd- & f-Block Elements & Coordination Chemistry',
            estimatedHours: 2.0,
            yieldType: 'low',
            pyqWeightPercent: 9,
            pyqFrequencyNote: '9% PYQ Weight · KMnO4/K2Cr2O7 & lanthanoid contraction',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Inorganic Chemistry NCERT',
            keyConcepts: [
              'Variable oxidation states & magnetic moment calculation',
              'Chelate effect & isomerism in complexes',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blueprint-icse-10',
    shortLabel: 'ICSE Class 10',
    badgeStream: 'CISCE Board',
    institutionType: 'school',
    boardOrUniversity: 'CISCE (ICSE Class 10)',
    examName: 'ICSE Class 10 Board Examinations',
    recommendedDailyHours: 4.0,
    recommendedAlertness: 'late_morning',
    recommendedLearningStyle: 'step_by_step',
    pyqOverview:
      'Calibrated to CISCE 10-year Section-A compulsory & Section-B choice papers across Mathematics, Physics, Chemistry, and Biology.',
    advisorGreeting:
      'Loaded ICSE Class 10 with CISCE chapter-level PYQ weightages. Confirm your name, alertness slot, and exam date to build your schedule.',
    subjects: [
      {
        name: 'Mathematics',
        difficulty: 'moderate',
        previousScoreOutOf100: 75,
        chapters: [
          {
            title: 'Quadratic Equations, Matrices & AP/GP',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 20,
            pyqFrequencyNote: '20% PYQ Weight · Guaranteed in compulsory Section A',
            classStatus: 'covered',
            youtubeChannelHint: 'ICSE Class 10 Maths Studio',
            keyConcepts: [
              'Discriminant nature of roots & 2x2 matrix multiplication',
              'nth term and sum formulas for AP & GP',
            ],
          },
          {
            title: 'Trigonometric Identities, Heights & Distances',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · 4-mark angle of elevation problem every year',
            classStatus: 'ongoing',
            youtubeChannelHint: 'CISCE Geometry & Trig Hub',
            keyConcepts: [
              'Pythagorean trigonometric identity proofs',
              'Two-point angle of elevation/depression tables',
            ],
          },
          {
            title: 'Circles, Tangents & Solid Mensuration',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Alternate segment & cone-sphere conversion',
            classStatus: 'upcoming',
            youtubeChannelHint: 'ICSE Board Maths Prep',
            keyConcepts: [
              'Cyclic quadrilaterals & alternate segment theorem',
              'Recasting cones, cylinders, and hemispherical shells',
            ],
          },
        ],
      },
      {
        name: 'Physics',
        difficulty: 'hard',
        previousScoreOutOf100: 68,
        chapters: [
          {
            title: 'Force, Work, Power & Block-Tackle Pulleys',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 17,
            pyqFrequencyNote: '17% PYQ Weight · Principle of moments & pulley MA/VR',
            classStatus: 'covered',
            youtubeChannelHint: 'ICSE Physics Concepts',
            keyConcepts: [
              'Couple, centre of gravity & conservation of mechanical energy',
              'Velocity ratio and efficiency of block & tackle systems',
            ],
          },
          {
            title: 'Refraction Through Lenses & Critical Angle Prisms',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · 45-90-45 total internal reflection ray diagram',
            classStatus: 'ongoing',
            youtubeChannelHint: 'ICSE Light & Optics Lab',
            keyConcepts: [
              'Lateral displacement & total internal reflection prisms',
              'Sign convention lens magnification numericals',
            ],
          },
          {
            title: 'Current Electricity & Specific Heat Calorimetry',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 19,
            pyqFrequencyNote: '19% PYQ Weight · Ice-water mixture calorimetry numerical',
            classStatus: 'upcoming',
            youtubeChannelHint: 'ICSE Physics Numericals',
            keyConcepts: [
              'Internal resistance of cells & electrical power kWh billing',
              'Method of mixtures & specific latent heat of fusion',
            ],
          },
        ],
      },
      {
        name: 'Chemistry & Biology',
        difficulty: 'moderate',
        previousScoreOutOf100: 80,
        chapters: [
          {
            title: 'Mole Concept, Electrolysis & Study of Compounds (HCl, NH3)',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 20,
            pyqFrequencyNote: '20% PYQ Weight · Haber, Ostwald & Gay-Lussac stoichiometry',
            classStatus: 'ongoing',
            youtubeChannelHint: 'ICSE Chemistry Masterclass',
            keyConcepts: [
              'Selective discharge of ions during electrolysis',
              'Fountain experiment, Haber process & catalytic oxidation',
            ],
          },
          {
            title: 'Human Circulatory, Excretory & Nervous Systems',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Labeled nephron, heart & reflex arc Qs',
            classStatus: 'upcoming',
            youtubeChannelHint: 'ICSE Biology Diagrams',
            keyConcepts: [
              'Systole/diastole hepatic portal circulation',
              'Ultrafiltration in Bowman capsule & synapse transmission',
            ],
          },
          {
            title: 'Organic IUPAC Nomenclature & Plant Transpiration',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 9,
            pyqFrequencyNote: '9% PYQ Weight · Structural isomers & Ganong potometer',
            classStatus: 'upcoming',
            youtubeChannelHint: 'CISCE Science Quick Review',
            keyConcepts: [
              'Alkane, alkene, alkyne lab preparation equations',
              'Stomatal regulation & photophosphorylation',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blueprint-gate-cs',
    shortLabel: 'GATE CS',
    badgeStream: 'PSU & M.Tech Rank',
    institutionType: 'university',
    boardOrUniversity: 'IISc / IIT GATE Board',
    examName: 'GATE Computer Science & Information Technology',
    recommendedDailyHours: 5.5,
    recommendedAlertness: 'early_morning',
    recommendedLearningStyle: 'first_principles',
    pyqOverview:
      'Weighted across 15 years of GATE CS 1-mark & 2-mark NAT/MSQ papers: Engineering Math, Algorithms, OS, DBMS, and TCP/TOC carry ~76% of the 100-mark paper.',
    advisorGreeting:
      'Loaded GATE CS with 15-year IIT/IISc PYQ mark weightages. Enter your name, alertness window, and target exam date to generate your GATE schedule.',
    subjects: [
      {
        name: 'Algorithms & Data Structures',
        difficulty: 'hard',
        previousScoreOutOf100: 65,
        chapters: [
          {
            title: 'Asymptotic Recurrences, Heaps & AVL/Trees',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · 2–3 guaranteed 2-mark GATE questions',
            classStatus: 'covered',
            youtubeChannelHint: 'NPTEL & IIT GATE Algorithms',
            keyConcepts: [
              'Master theorem & recursion-tree tight bounds',
              'Binary heap build O(n) & AVL rotation height invariants',
            ],
          },
          {
            title: 'Dynamic Programming, Shortest Paths & MST',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Dijkstra, Bellman-Ford & LCS/Knapsack MSQs',
            classStatus: 'ongoing',
            youtubeChannelHint: 'GATE CS Algorithm Design',
            keyConcepts: [
              'Optimal substructure & overlapping subproblem tables',
              'Kruskal/Prim cut property & negative-edge shortest paths',
            ],
          },
        ],
      },
      {
        name: 'Operating Systems',
        difficulty: 'moderate',
        previousScoreOutOf100: 74,
        chapters: [
          {
            title: 'CPU Scheduling, Semaphores & Concurrency Traces',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 15,
            pyqFrequencyNote: '15% PYQ Weight · Peterson/semaphore mutual exclusion NAT',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Systems & GATE OS Lectures',
            keyConcepts: [
              'SRTF turnaround time & semaphore P/V state space',
              'Deadlock Banker safety sequence & resource graphs',
            ],
          },
          {
            title: 'Virtual Memory, Multi-Level Paging & TLB EAT',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 17,
            pyqFrequencyNote: '17% PYQ Weight · Page-table bit split & EAT numericals',
            classStatus: 'upcoming',
            youtubeChannelHint: 'OS Memory Architecture Hub',
            keyConcepts: [
              'Hierarchical page table sizing & inverted page tables',
              'LRU stack replacement vs Thrashing working-set model',
            ],
          },
        ],
      },
      {
        name: 'DBMS & Engineering Mathematics',
        difficulty: 'moderate',
        previousScoreOutOf100: 77,
        chapters: [
          {
            title: 'Linear Algebra Eigenvalues & Discrete Graph Logic',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 19,
            pyqFrequencyNote: '19% PYQ Weight · ~13 marks compulsory GATE CS Math core',
            classStatus: 'covered',
            youtubeChannelHint: 'GATE Engineering Maths Archive',
            keyConcepts: [
              'Rank-nullity, Cayley-Hamilton & eigenvalue trace/det',
              'First-order predicate logic, posets/lattices & planar graphs',
            ],
          },
          {
            title: 'B+ Trees, Normal Forms (BCNF/3NF) & Conflict Serializability',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 15,
            pyqFrequencyNote: '15% PYQ Weight · Internal/leaf order-p NAT & precedence graph',
            classStatus: 'ongoing',
            youtubeChannelHint: 'IIT DBMS & Transactions',
            keyConcepts: [
              'Attribute closure candidate keys & lossless decomposition',
              'B+ tree node split order & 2PL view/conflict serializability',
            ],
          },
        ],
      },
      {
        name: 'Computer Networks & Theory of Computation',
        difficulty: 'hard',
        previousScoreOutOf100: 62,
        chapters: [
          {
            title: 'TCP Congestion, Sliding Window & CIDR Supernetting',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · Slow-start cwnd & Stop-and-Wait/GBN efficiency',
            classStatus: 'ongoing',
            youtubeChannelHint: 'GATE Networks Protocol Lab',
            keyConcepts: [
              'Bandwidth-delay product link utilization & sequence wraparound',
              'IPv4 fragmentation offsets & longest-prefix CIDR masks',
            ],
          },
          {
            title: 'Regular/CFL Pumping Lemma, PDA & Turing Decidability',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 14,
            pyqFrequencyNote: '14% PYQ Weight · Closure table & Rice theorem MSQs',
            classStatus: 'upcoming',
            youtubeChannelHint: 'TOC & Automata First Principles',
            keyConcepts: [
              'Myhill-Nerode minimal DFA state count',
              'Recursive vs recursively enumerable closure properties',
            ],
          },
          {
            title: 'Compiler LL(1)/LR Parsing & L-Attributed SDT',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 7,
            pyqFrequencyNote: '7% PYQ Weight · FIRST/FOLLOW & SLR(1) shift-reduce conflicts',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Compiler Design Concise',
            keyConcepts: [
              'FIRST/FOLLOW table construction',
              'LR(0), SLR(1), LALR(1), CLR(1) expressive hierarchy',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blueprint-btech-sem-core',
    shortLabel: 'B.Tech Semester Core',
    badgeStream: 'University Honours',
    institutionType: 'university',
    boardOrUniversity: 'University B.Tech Engineering',
    examName: 'B.Tech Semester Core End-Term Finals',
    recommendedDailyHours: 4.5,
    recommendedAlertness: 'night_owl',
    recommendedLearningStyle: 'step_by_step',
    pyqOverview:
      'Tagged with university end-semester compulsory 10/15-mark derivation & numerical frequencies across Engineering Calculus, EMFT, and OS/Architecture.',
    advisorGreeting:
      'Loaded B.Tech Semester Core with university end-sem PYQ weightages. Enter your name, alertness slot, and exam date to build your timetable.',
    subjects: [
      {
        name: 'Applied Engineering Calculus',
        difficulty: 'moderate',
        previousScoreOutOf100: 75,
        chapters: [
          {
            title: 'Laplace Transforms & Unit Impulse Systems',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 20,
            pyqFrequencyNote: '20% PYQ Weight · Compulsory Section-A 10-mark IVP problem',
            classStatus: 'covered',
            youtubeChannelHint: 'Engineering Mathematics Academy',
            keyConcepts: [
              'First & second shifting theorems',
              'Convolution integral & Dirac delta ODE solutions',
            ],
          },
          {
            title: 'Fourier Series & Parseval Identity',
            estimatedHours: 2.0,
            yieldType: 'high',
            pyqWeightPercent: 16,
            pyqFrequencyNote: '16% PYQ Weight · Half-range expansion in 76% papers',
            classStatus: 'ongoing',
            youtubeChannelHint: 'Higher Engineering Math',
            keyConcepts: [
              'Even/odd symmetry Fourier coefficients',
              'Parseval root-mean-square series summation',
            ],
          },
          {
            title: 'Cauchy Residue Theorem & Contour Integrals',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · High-scoring 12-mark contour integral',
            classStatus: 'upcoming',
            youtubeChannelHint: 'University Calculus Archive',
            keyConcepts: [
              'Laurent series isolated poles & residue formula',
              'Real trigonometric & improper integral evaluation',
            ],
          },
        ],
      },
      {
        name: 'Electromagnetic Field Theory',
        difficulty: 'hard',
        previousScoreOutOf100: 62,
        chapters: [
          {
            title: 'Gauss Law, Divergence & Boundary Conditions',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 19,
            pyqFrequencyNote: '19% PYQ Weight · Appears in 85% university end-sem papers',
            classStatus: 'covered',
            youtubeChannelHint: 'NPTEL Electrical Engineering',
            keyConcepts: [
              'Differential/integral Gauss law & divergence theorem',
              'Tangential E and normal D dielectric interface rules',
            ],
          },
          {
            title: 'Maxwell Equations & Poynting Power Theorem',
            estimatedHours: 3.0,
            yieldType: 'high',
            pyqWeightPercent: 22,
            pyqFrequencyNote: '22% PYQ Weight · Compulsory derivation in 90% papers',
            classStatus: 'ongoing',
            youtubeChannelHint: 'MIT OpenCourseWare / NPTEL',
            keyConcepts: [
              'Ampere-Maxwell displacement current density',
              'Complex Poynting vector electromagnetic energy flux',
            ],
          },
          {
            title: 'Uniform Plane Wave Propagation & Skin Depth',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 15,
            pyqFrequencyNote: '15% PYQ Weight · Lossy media attenuation & skin depth numerical',
            classStatus: 'upcoming',
            youtubeChannelHint: 'University EMFT Studio',
            keyConcepts: [
              'Propagation constant in lossy dielectrics vs good conductors',
              'Intrinsic wave impedance & polarization',
            ],
          },
          {
            title: 'Transmission Line Impedance & VSWR',
            estimatedHours: 1.5,
            yieldType: 'low',
            pyqWeightPercent: 8,
            pyqFrequencyNote: '8% PYQ Weight · Quarter-wave transformer short numerical',
            classStatus: 'upcoming',
            youtubeChannelHint: 'RF & Transmission Lines',
            keyConcepts: [
              'Reflection coefficient & standing wave ratio',
              'Quarter-wave impedance matching',
            ],
          },
        ],
      },
      {
        name: 'Operating Systems & Architecture',
        difficulty: 'moderate',
        previousScoreOutOf100: 78,
        chapters: [
          {
            title: 'Preemptive CPU Scheduling & Deadlock Banker Matrix',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 18,
            pyqFrequencyNote: '18% PYQ Weight · Gantt chart + Safe-sequence problem',
            classStatus: 'ongoing',
            youtubeChannelHint: 'CS Core Systems',
            keyConcepts: [
              'SRTF & Round Robin context-switch overhead',
              'Banker Need = Max - Allocation safety algorithm',
            ],
          },
          {
            title: 'Cache Mapping, 5-Stage Pipelining & Virtual Memory',
            estimatedHours: 2.5,
            yieldType: 'high',
            pyqWeightPercent: 17,
            pyqFrequencyNote: '17% PYQ Weight · CPI hazard stall & TLB EAT numericals',
            classStatus: 'upcoming',
            youtubeChannelHint: 'Computer Architecture Lectures',
            keyConcepts: [
              'Direct vs set-associative tag/index/offset fields',
              'RAW data forwarding & TLB effective access time',
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Materializes a StarterSyllabusBlueprint into ready-to-schedule SubjectProfile[], TopicItem[],
 * and a formatted rawText representation without requiring any external PDF or AI network call.
 */
export function materializeStarterBlueprint(
  blueprintId: string,
  referenceDateISO?: string
): {
  blueprint: StarterSyllabusBlueprint;
  subjects: SubjectProfile[];
  topics: TopicItem[];
  rawText: string;
} | null {
  const blueprint = STARTER_SYLLABUS_BLUEPRINTS.find((b) => b.id === blueprintId);
  if (!blueprint) return null;

  const todayISO = (referenceDateISO || new Date().toISOString()).slice(0, 10);

  const subjects: SubjectProfile[] = [];
  const topics: TopicItem[] = [];
  const rawLines: string[] = [];

  blueprint.subjects.forEach((subjSpec, sIdx) => {
    const subjectId = `bp-subj-${sIdx + 1}`;
    subjects.push({
      id: subjectId,
      name: subjSpec.name,
      difficulty: subjSpec.difficulty,
      previousScoreOutOf100: subjSpec.previousScoreOutOf100,
      currentRatingOutOf10: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
      lastPracticedDateISO: todayISO,
    });

    rawLines.push(
      `${subjSpec.name}: ${subjSpec.chapters.map((c) => c.title).join(', ')}`
    );

    subjSpec.chapters.forEach((ch, cIdx) => {
      topics.push({
        id: `bp-topic-${sIdx + 1}-${cIdx + 1}`,
        subjectId,
        subjectName: subjSpec.name,
        title: ch.title,
        estimatedHours: ch.estimatedHours,
        yieldType: ch.yieldType,
        pyqFrequencyNote: ch.pyqFrequencyNote,
        classStatus: ch.classStatus,
        completed: false,
        masteryPercent: ch.classStatus === 'covered' ? 55 : ch.classStatus === 'ongoing' ? 35 : 20,
        youtubeQuery: `${ch.title} ${subjSpec.name} ${blueprint.boardOrUniversity} PYQ lecture`,
        youtubeTitle: `${ch.title} — ${blueprint.shortLabel} PYQ Lecture`,
        youtubeChannelHint: ch.youtubeChannelHint,
        keyConcepts: [...ch.keyConcepts],
      });
    });
  });

  return {
    blueprint,
    subjects,
    topics,
    rawText: rawLines.join('\n'),
  };
}
