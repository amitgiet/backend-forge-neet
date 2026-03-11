require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

const newMindmap = {
  "name": "Genetics and Evolution",
  "children": [
    {
      "name": "Evolution and Origin of Life",
      "children": [
        {
          "name": "Universe and Earth",
          "children": [
            { "name": "Big Bang Theory" },
            { "name": "Earth formed 4.5 bya" },
            { "name": "Early atmosphere conditions" },
            { "name": "Life appeared 4 bya" }
          ]
        },
        {
          "name": "Theories of Origin",
          "children": [
            { "name": "Panspermia (Spores)" },
            { "name": "Spontaneous Generation" },
            { "name": "Pasteur's Biogenesis" },
            { "name": "Oparin-Haldane Chemical Evolution" },
            { "name": "Miller-Urey Experiment" }
          ]
        },
        {
          "name": "Evidences for Evolution",
          "children": [
            { "name": "Paleontological (Fossils)" },
            { "name": "Homologous Organs (Divergent)" },
            { "name": "Analogous Organs (Convergent)" },
            { "name": "Embryological (Heckel/von Baer)" },
            { "name": "Anthropogenic Action" }
          ]
        },
        {
          "name": "Evolutionary Mechanisms",
          "children": [
            { "name": "Darwinian Natural Selection" },
            { "name": "Adaptive Radiation (Finches)" },
            { "name": "Lamarckism (Use/Disuse)" },
            { "name": "Mutation Theory (de Vries)" },
            { "name": "Hardy-Weinberg Principle" }
          ]
        },
        {
          "name": "Human Evolution",
          "children": [
            { "name": "Dryopithecus/Ramapithecus" },
            { "name": "Australopithecines" },
            { "name": "Homo habilis" },
            { "name": "Homo erectus" },
            { "name": "Neanderthal" },
            { "name": "Homo sapiens" }
          ]
        }
      ]
    },
    {
      "name": "Molecular Basis of Inheritance",
      "children": [
        {
          "name": "Genetic Material",
          "children": [
            { "name": "DNA Structure (Watson/Crick)" },
            { "name": "Griffith Transformation" },
            { "name": "Hershey-Chase Proof" },
            { "name": "Chargaff's Rules" }
          ]
        },
        {
          "name": "Processes",
          "children": [
            { "name": "Replication (Semi-conservative)" },
            { "name": "Transcription (DNA to RNA)" },
            { "name": "Translation (Protein Synthesis)" },
            { "name": "Splicing (Intron removal)" }
          ]
        },
        {
          "name": "Genetic Code",
          "children": [
            { "name": "Triplet/Codon" },
            { "name": "Universal/Degenerate" },
            { "name": "Start/Stop Codons" }
          ]
        },
        {
          "name": "Regulation",
          "children": [
            { "name": "Lac Operon" },
            { "name": "Inducer/Repressor" }
          ]
        }
      ]
    },
    {
      "name": "Principles of Inheritance",
      "children": [
        {
          "name": "Mendelian Genetics",
          "children": [
            { "name": "Law of Dominance" },
            { "name": "Law of Segregation" },
            { "name": "Law of Independent Assortment" },
            { "name": "Test Cross" }
          ]
        },
        {
          "name": "Non-Mendelian Patterns",
          "children": [
            { "name": "Incomplete Dominance" },
            { "name": "Co-dominance (Blood Groups)" },
            { "name": "Multiple Alleles" },
            { "name": "Polygenic Inheritance" },
            { "name": "Pleiotropy" }
          ]
        },
        {
          "name": "Chromosomal/Genetics Factors",
          "children": [
            { "name": "Linkage and Recombination" },
            { "name": "Sex Determination" },
            { "name": "Pedigree Analysis" },
            { "name": "Mutations (Point/Frame-shift)" }
          ]
        },
        {
          "name": "Genetic Disorders",
          "children": [
            { "name": "Mendelian (Sickle Cell/Hemophilia)" },
            { "name": "Chromosomal (Down/Turner/Klinefelter)" }
          ]
        }
      ]
    },
    {
      "name": "Applied Evolution/Techniques",
      "children": [
        {
          "name": "Genome Editing Systems",
          "children": [
            { "name": "ZFNs and TALEs" },
            { "name": "CRISPR-Cas9" },
            { "name": "Base Editors (CBE/ABE)" }
          ]
        },
        {
          "name": "Directed Evolution",
          "children": [
            { "name": "Antibiotic Selection" },
            { "name": "Phage-assisted continuous evolution (PACE)" },
            { "name": "Protein Engineering" }
          ]
        }
      ]
    }
  ]
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const ImportedCurriculum = require('../src/models/ImportedCurriculum');
        
        const result = await ImportedCurriculum.updateOne(
            { _id: "GENETICS AND EVOLUTION" },
            { $set: { "toppersEssentials.mindmap": newMindmap } }
        );
        
        console.log('Update result:', result);
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
};

run();
