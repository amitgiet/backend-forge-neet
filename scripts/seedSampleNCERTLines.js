require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const NCERTLine = require('../src/models/NCERTLine');

const sampleLines = [
  // Chemistry - Organic Chemistry
  {
    lineId: 'chem_c12_ch12_org_001',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 3,
    lineNumber: 1,
    ncertText: 'Organic chemistry studies carbon compounds, especially hydrocarbons and their derivatives, with emphasis on structure and reactivity.',
    context: 'Core definition of organic chemistry and scope.',
    conceptTags: ['organic chemistry', 'carbon compounds', 'hydrocarbons']
  },
  {
    lineId: 'chem_c12_ch12_org_002',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 4,
    lineNumber: 2,
    ncertText: 'A covalent bond forms by mutual sharing of electron pairs between atoms to achieve a stable electronic configuration.',
    context: 'Bonding principle used throughout organic molecules.',
    conceptTags: ['organic chemistry', 'covalent bond', 'bonding']
  },
  {
    lineId: 'chem_c12_ch12_org_003',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 5,
    lineNumber: 3,
    ncertText: 'Inductive effect is the permanent displacement of sigma electrons along a carbon chain due to electronegativity differences.',
    context: 'Electronic effect influencing acidity/basicity and stability.',
    conceptTags: ['organic chemistry', 'inductive effect', 'electronic effects']
  },
  {
    lineId: 'chem_c12_ch12_org_004',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 6,
    lineNumber: 4,
    ncertText: 'Resonance describes delocalization of pi electrons where actual structure is a resonance hybrid of canonical forms.',
    context: 'Resonance and stability in aromatic and conjugated systems.',
    conceptTags: ['organic chemistry', 'resonance', 'delocalization']
  },
  {
    lineId: 'chem_c12_ch12_org_005',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 7,
    lineNumber: 5,
    ncertText: 'Electrophiles are electron-deficient species, while nucleophiles are electron-rich species that donate an electron pair.',
    context: 'Reaction mechanism language for substitution and addition.',
    conceptTags: ['organic chemistry', 'electrophile', 'nucleophile']
  },
  {
    lineId: 'chem_c12_ch12_org_006',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 8,
    lineNumber: 6,
    ncertText: 'Homolytic bond fission produces free radicals, whereas heterolytic bond fission produces ions.',
    context: 'Bond cleavage fundamentals in mechanism problems.',
    conceptTags: ['organic chemistry', 'bond fission', 'free radicals']
  },
  {
    lineId: 'chem_c12_ch12_org_007',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 9,
    lineNumber: 7,
    ncertText: 'Carbocation stability generally increases from methyl to tertiary due to hyperconjugation and inductive effects.',
    context: 'Intermediate stability order commonly tested in NEET.',
    conceptTags: ['organic chemistry', 'carbocation', 'stability']
  },
  {
    lineId: 'chem_c12_ch12_org_008',
    subject: 'chemistry',
    class: 12,
    chapter: 12,
    pageNumber: 10,
    lineNumber: 8,
    ncertText: 'IUPAC nomenclature assigns a unique systematic name to an organic compound using parent chain and substituent rules.',
    context: 'Naming conventions and structural interpretation.',
    conceptTags: ['organic chemistry', 'iupac nomenclature', 'naming']
  },

  // Chemistry - Electrochemistry
  {
    lineId: 'chem_c12_ch03_electro_001',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 2,
    lineNumber: 1,
    ncertText: 'Electrochemistry deals with the relationship between electrical energy and chemical reactions.',
    context: 'Chapter opening definition.',
    conceptTags: ['electrochemistry', 'redox', 'electric energy']
  },
  {
    lineId: 'chem_c12_ch03_electro_002',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 3,
    lineNumber: 2,
    ncertText: 'In a galvanic cell, oxidation occurs at the anode and reduction occurs at the cathode.',
    context: 'Anode-cathode basics.',
    conceptTags: ['electrochemistry', 'galvanic cell', 'anode cathode']
  },
  {
    lineId: 'chem_c12_ch03_electro_003',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 4,
    lineNumber: 3,
    ncertText: 'Cell potential is the potential difference between two electrodes and indicates spontaneity of the redox reaction.',
    context: 'Meaning of Ecell and spontaneity.',
    conceptTags: ['electrochemistry', 'cell potential', 'spontaneity']
  },
  {
    lineId: 'chem_c12_ch03_electro_004',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 5,
    lineNumber: 4,
    ncertText: 'Nernst equation relates electrode potential to concentration and temperature for non-standard conditions.',
    context: 'Equation used in numerical problems.',
    conceptTags: ['electrochemistry', 'nernst equation', 'concentration cell']
  },
  {
    lineId: 'chem_c12_ch03_electro_005',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 6,
    lineNumber: 5,
    ncertText: 'Conductivity depends on the number of ions and their mobility in the electrolyte solution.',
    context: 'Conceptual basis for conductance.',
    conceptTags: ['electrochemistry', 'conductivity', 'electrolyte']
  },
  {
    lineId: 'chem_c12_ch03_electro_006',
    subject: 'chemistry',
    class: 12,
    chapter: 3,
    pageNumber: 7,
    lineNumber: 6,
    ncertText: 'Molar conductivity increases on dilution because inter-ionic interactions decrease and ion mobility improves.',
    context: 'Trend explanation for weak/strong electrolytes.',
    conceptTags: ['electrochemistry', 'molar conductivity', 'dilution']
  },

  // Biology - Human Reproduction
  {
    lineId: 'bio_c12_ch02_repro_001',
    subject: 'biology',
    class: 12,
    chapter: 2,
    pageNumber: 3,
    lineNumber: 1,
    ncertText: 'Human reproduction involves formation of gametes, fertilization, embryo development, and birth.',
    context: 'Human reproduction overview.',
    conceptTags: ['human reproduction', 'fertilization', 'embryo']
  },
  {
    lineId: 'bio_c12_ch02_repro_002',
    subject: 'biology',
    class: 12,
    chapter: 2,
    pageNumber: 4,
    lineNumber: 2,
    ncertText: 'Spermatogenesis occurs in seminiferous tubules and is regulated by pituitary and testicular hormones.',
    context: 'Male gametogenesis and endocrine control.',
    conceptTags: ['human reproduction', 'spermatogenesis', 'hormones']
  },
  {
    lineId: 'bio_c12_ch02_repro_003',
    subject: 'biology',
    class: 12,
    chapter: 2,
    pageNumber: 5,
    lineNumber: 3,
    ncertText: 'Oogenesis begins during fetal life and resumes cyclically after puberty until menopause.',
    context: 'Female gametogenesis timeline.',
    conceptTags: ['human reproduction', 'oogenesis', 'menstrual cycle']
  },
  {
    lineId: 'bio_c12_ch02_repro_004',
    subject: 'biology',
    class: 12,
    chapter: 2,
    pageNumber: 6,
    lineNumber: 4,
    ncertText: 'Implantation is the attachment of the blastocyst to the endometrium, initiating pregnancy.',
    context: 'Early pregnancy event and definition.',
    conceptTags: ['human reproduction', 'implantation', 'pregnancy']
  }
];

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is missing in environment');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB'.green);

    const operations = sampleLines.map((line) => ({
      updateOne: {
        filter: { lineId: line.lineId },
        update: {
          $set: {
            subject: line.subject,
            class: line.class,
            chapter: line.chapter,
            pageNumber: line.pageNumber,
            lineNumber: line.lineNumber,
            ncertText: line.ncertText,
            context: line.context,
            conceptTags: line.conceptTags,
            isActive: true
          }
        },
        upsert: true
      }
    }));

    const result = await NCERTLine.bulkWrite(operations, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const modified = result.modifiedCount || 0;

    console.log(`Sample NCERT lines upsert complete. Inserted: ${inserted}, Updated: ${modified}`.cyan);
    console.log(`Total attempted: ${sampleLines.length}`.green);
    process.exit(0);
  } catch (error) {
    console.error(`Seed failed: ${error.message}`.red);
    process.exit(1);
  }
};

run();
