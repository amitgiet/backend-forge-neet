require('dotenv').config();
require('colors');
const mongoose = require('mongoose');
const PYQMarkedNCERT = require('../src/models/PYQMarkedNCERT');

const pyqData = {
  botany: {
    "The Living World": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Living%20world%20.docx/CopyofLivingworld.docx.html",
    "Biological Classification": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Biological%20Classification/BiologicalClassification.html",
    "Plant Kingdom": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20plant%20kingdom/Copyofplantkingdom.html",
    "Morphology Of Flowering Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Morphology%20of%20flowering%20plants/CopyofMorphologyoffloweringplants.html",
    "Anatomy of Flowering Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Anatomy%20of%20flowering%20plants/Anatomyoffloweringplants.html",
    "Cell: The Unit Of Life": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Cell-%20The%20unit%20of%20life.docx/CopyofCellTheunitoflife.docx.html",
    "Cell Cycle and Cell Division": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Cell%20cyle%20and%20cell%20divison.docx/CopyofCellcyleandcelldivison.docx.html",
    "Photosynthesis in Higher Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Photosynthesis%20in%20Higher%20Plants.docx/CopyofPhotosynthesisinHigherPlants.docx.html",
    "Respiration in Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Respiration%20in%20Plants_.docx/CopyofRespirationinPlants_.docx.html",
    "Transport in Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Transport%20in%20plants/CopyofTransportinplants.html",
    "Plant Growth and Development": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Plant%20Growth%20and%20Development.docx/CopyofPlantGrowthandDevelopment.docx.html",
    "Sexual Reproduction in Flowering Plants": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20sexual%20reproduction%20in%20flowering%20plants/Copyofsexualreproductioninfloweringplants.html",
    "Principles Of Inheritance And Variation": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Principles%20of%20Inheritance.docx/CopyofPrinciplesofInheritance.docx.html",
    "Molecular Basis of Inheritance": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Molecular%20basis%20of%20inheritance%20.docx/CopyofMolecularbasisofinheritance.docx.html",
    "Microbes in Human Welfare": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Microbes%20in%20human%20welfare.docx/CopyofMicrobesinhumanwelfare.docx.html",
    "Ecosystem": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Ecosystem.docx/CopyofEcosystem.docx.html",
    "Biodiversity": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20Of%20Biodiversity/CopyofBiodiversity.docx.html",
    "Organisms and Population": "http://216.48.182.197/pyq_marked_ncert/Biology/Botany/Copy%20of%20Organisms%20and%20population.docx/CopyofOrganismsandpopulation.docx.html"
  },
  zoology: {
    "Animal Kingdom": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Animal%20kingdom%20final%20-%20marked%20.docx/CopyofAnimalkingdomfinalmarked.docx.html",
    "Structural Organisation in Animals": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Structural%20Organisation%20in%20Animals-highlighted.docx/CopyofStructuralOrganisationinAnimalshighligh.html",
    "Biomolecules": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Biomolecules.docx/CopyofBiomolecules.docx.html",
    "Breathing and Exchange of Gases": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20breathing%20and%20exchange%20of%20gases/Copyofbreathingandexchangeofgases.html",
    "Body Fluids and Circulation": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/_body%20fluids%20and%20circulation/bodyfluidsandcirculation.html",
    "Excretory Products and Its Elimination": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20excretory%20products%20and%20its%20elimination/Copyofexcretoryproductsanditselimination.html",
    "Locomotion and Movement": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20locomotion%20and%20movement/Copyoflocomotionandmovement.html",
    "Neural Control and Coordination": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20neural%20control%20and%20coordination/Copyofneuralcontrolandcoordination.html",
    "Chemical Coordination and Integration": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20chemical%20coordination%20and%20integration/Copyofchemicalcoordinationandintegration.html",
    "Human Reproduction": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Human%20Reproduction/CopyofHumanReproduction.html",
    "Reproductive Health": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Reproductive%20Health.docx/CopyofReproductiveHealth.docx.html",
    "Evolution": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Evolution.docx/CopyofEvolution.docx.html",
    "Human Health And Disease": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Human%20health%20and%20disease/CopyofHumanhealthanddisease.html",
    "Biotechnology Principles and Processes": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Copy%20of%20Biotechnology%20_%20Principles%20and%20Processes.docx/CopyofBiotechnology_PrinciplesandProcesses.do.html",
    "Biotechnology Applications": "http://216.48.182.197/pyq_marked_ncert/Biology/Zoology/Biotechnology%20applications/Biotechnologyapplications.html"
  },
  chemistry: {
    "Some Basic Concept of Chemistry": "http://216.48.182.197/pyq_marked_ncert/Chemistry/SOME%20BASIC%20CONCEPTS%20OF%20CHEMISTRY%20(PYQ%20MARKED%20NCERT)/SOMEBASICCONCEPTSOFCHEMISTRY_PYQMARKEDNCERT_.html",
    "Structure of Atom": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20structure%20of%20atom/Copyofstructureofatom.html",
    "Classification of Elements and Periodicity in Properties": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Classification%20of%20elements%20and%20periodicity%20in%20properties/Classificationofelementsandperiodicityinprope.html",
    "Chemical bonding": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Chemical%20bonding/CopyofChemicalbonding.html",
    "Thermodynamics": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20%20Thermodynamics%20(%20PYQ%20Marked%20NCERT)/CopyofThermodynamics_PYQMarkedNCERT_.html",
    "Equilibrium": "http://216.48.182.197/pyq_marked_ncert/Chemistry/EQUILLIRIUM%20PYQ%20MARKED%20NCERT/EQUILLIRIUMPYQMARKEDNCERT.html",
    "Redox Reaction": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20REDOX%20REACTIONS%20(PYQ MARKED NCERT)/CopyofREDOXREACTIONS_PYQMARKEDNCERT_.html",
    "P-Block Elements (Group-13 & 14)": "http://216.48.182.197/pyq_marked_ncert/Chemistry/The%20pBlock%20Elements%20group1314/PBLOCKUNIT11new.html",
    "Organic Chemistry - Some Basic Principles and Techniques": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Organic%20Chemistry-%20Some%20Basic%20Principles%20and%20Techniques/Untitleddocument.html",
    "Hydrocarbons": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Hydrocarbons%20unmarked-%2013/CopyofHydrocarbonsunmarked13.html",
    "Solutions": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Solutions/Untitleddocument.html",
    "Electrochemistry": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Electrochemistry/Untitleddocument.html",
    "Chemical Kinetics": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Chemical%20Kinetics/ChemicalKinetics.html",
    "P-Block Elements (Group-15 to 18)": "http://216.48.182.197/pyq_marked_ncert/Chemistry/The%20pBlock%20Elements%20group1518/PBlockClass12.html",
    "D and F Block Elements": "http://216.48.182.197/pyq_marked_ncert/Chemistry/d-%20and%20f-%20Block%20Elements%20UNMARKED-22/dandfBlockElementsUNMARKED22.html",
    "Coordination Compounds": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Coordination%20Compounds%20UNMARKED-23/CopyofCoordinationCompoundsUNMARKED23.html",
    "Haloalkanes and Haloarenes": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Haloalkanes%20and%20Haloarenes/Untitleddocument.html",
    "Alcohols, Phenols and Ethers": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Alcohols,%20Phenols%20and%20Ethers%20unmarked%20-%2025/CopyofAlcoholsPhenolsandEthersunmarked25.html",
    "Aldehydes, Ketones and Carboxylic Acids": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Aldehydes,%20Ketones%20and%20Carboxylic%20Acids%20UNMARKED%20-%2026/CopyofAldehydesKetonesandCarboxylicAcidsUNMAR.html",
    "Organic Compounds Containing Nitrogen": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Organic%20Compounds%20Containing%20Nitrogen/organicCompoundsContainingNitrogen.html",
    "Biomolecules Chemistry": "http://216.48.182.197/pyq_marked_ncert/Chemistry/Copy%20of%20Biomolecules%20chemistry,%20unmarked-28/CopyofBiomoleculeschemistryunmarked28.html"
  },
  physics: {
    "Units And Measurements": "http://216.48.182.197/pyq_marked_ncert/Physics/Units%20and%20Measurements/UnitsandMeasurements.html",
    "Motion in a Plane": "http://216.48.182.197/pyq_marked_ncert/Physics/Motion%20in%20a%20Plane/MotioninaPlane.html",
    "Motion in a Straight line": "http://216.48.182.197/pyq_marked_ncert/Physics/Motion%20in%20a%20Straight%20line/MotioninaStraightline.html",
    "Laws of Motion": "http://216.48.182.197/pyq_marked_ncert/Physics/Laws%20of%20%20Motion/LawsofMotion.html",
    "Work, Energy and Power": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Work%2C%20Energy%20and%20Power%20.docx/CopyofWorkEnergyandPower.docx.html",
    "Systems Of Particles": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20SYSTEMS%20OF%20PARTICLES%20-7/CopyofSYSTEMSOFPARTICLES7.html",
    "Gravitation": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Gravitation%20.docx/CopyofGravitation.docx.html",
    "Mechanical Properties of Solids": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Mechanical%20Properties%20of%20Solids/CopyofMechanicalPropertiesofSolids.html",
    "Mechanical Properties of Fluids": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Mechanical%20Properties%20of%20Fluids%20-8%20.docx/CopyofMechanicalPropertiesofFluids8.docx.html",
    "Thermal Properties Of Matter": "http://216.48.182.197/pyq_marked_ncert/Physics/Thermal%20Properties%20of%20Matter%20-%209.docx/ThermalPropertiesofMatter9.docx.html",
    "Thermodynamics": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Thermodynamics-10%20unmarked/CopyofThermodynamics10unmarked.html",
    "Kinetic Theory": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Kinetic%20Theory-10%20unmarked.docx/CopyofKineticTheory10unmarked.docx.html",
    "Oscillations": "http://216.48.182.197/pyq_marked_ncert/Physics/Oscillations/Oscillations.html",
    "Waves": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Waves%20(unmarked)-%2013/CopyofWaves_unmarked_13.html",
    "Electrostatic Potential and Capacitance": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Electrostatic%20Potential%20and%20Capacitance-14/CopyofElectrostaticPotentialandCapacitance14.html",
    "Current Electricity": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Current%20Electricity/CopyofCurrentElectricity.html",
    "Moving Charges and Magnetism": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Moving%20Charges%20and%20Magnetism%20unmarked%20-%2016/CopyofMovingChargesandMagnetismunmarked16.html",
    "Magnetism and Matter": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Magnetism%20and%20Matter%20unmarked%20-%2017/CopyofMagnetismandMatterunmarked17.html",
    "Electromagnetic Induction": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Electromagnetic%20Induction%20unmarked%20-%2018/CopyofElectromagneticInductionunmarked18.html",
    "Alternating Current": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Alternating%20Current%20unmarked-19/CopyofAlternatingCurrentunmarked19.html",
    "Electromagnetic Waves": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Electromagnetic%20Waves%20unmarked-20/CopyofElectromagneticWavesunmarked20.html",
    "Ray Optics and Optical Instruments": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Ray%20Optics%20and%20Optical%20Instruments%20unmarked%20-%2021.docx/CopyofRayOpticsandOpticalInstrumentsunmarked2.html",
    "Wave Optics": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Wave%20Optics%20unmarked-.docx/CopyofWaveOpticsunmarked.docx.html",
    "Dual Nature of Matter and Radiation": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Dual%20Nature%20of%20Matter%20and%20Radiation%20UNMARKED%20-%2023/CopyofDualNatureofMatterandRadiationUNMARKED2.html",
    "Atoms": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Atoms%20unmarked-24/CopyofAtomsunmarked24.html",
    "Nuclei": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Nuclei%20unmarked-25/CopyofNucleiunmarked25.html",
    "Semiconductor Electronics": "http://216.48.182.197/pyq_marked_ncert/Physics/Copy%20of%20Semiconductor%20Electronics%20unmarked-26/CopyofSemiconductorElectronicsunmarked26.html"
  }
};

async function seedPYQMarkedNCERT() {
  try {
    // Clear existing data
    await PYQMarkedNCERT.deleteMany({});
    console.log('✓ Cleared existing PYQ Marked NCERT data');

    let order = 0;
    const documents = [];

    // Biology - Botany
    Object.entries(pyqData.botany).forEach(([topicName, url]) => {
      documents.push({
        subject: 'biology',
        stream: 'botany',
        topicName,
        url,
        order: order++,
        isAvailable: true
      });
    });

    // Biology - Zoology
    Object.entries(pyqData.zoology).forEach(([topicName, url]) => {
      documents.push({
        subject: 'biology',
        stream: 'zoology',
        topicName,
        url,
        order: order++,
        isAvailable: true
      });
    });

    order = 0;
    // Chemistry
    Object.entries(pyqData.chemistry).forEach(([topicName, url]) => {
      documents.push({
        subject: 'chemistry',
        stream: null,
        topicName,
        url,
        order: order++,
        isAvailable: true
      });
    });

    order = 0;
    // Physics
    Object.entries(pyqData.physics).forEach(([topicName, url]) => {
      documents.push({
        subject: 'physics',
        stream: null,
        topicName,
        url,
        order: order++,
        isAvailable: true
      });
    });

    await PYQMarkedNCERT.insertMany(documents);
    console.log(`✓ Successfully seeded ${documents.length} PYQ Marked NCERT topics`);

  } catch (error) {
    console.error('Error seeding PYQ Marked NCERT data:', error);
    throw error;
  }
}

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is missing in environment');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB'.green);

    await seedPYQMarkedNCERT();
    console.log('✅ PYQ Marked NCERT seeding completed successfully'.green.bold);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Seed failed: ${error.message}`.red.bold);
    process.exit(1);
  }
};

run();
