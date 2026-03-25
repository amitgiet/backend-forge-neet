# SQLite to MongoDB Migration Plan - Comprehensive

## Executive Summary

This plan covers the complete migration of all question data from 7 SQLite databases to MongoDB, treating Hindi questions as **distinct separate questions** (not translations) and handling the fact that question IDs are NOT unique across subjects.

---

## Database Inventory (7 Total)

| # | Database File | Tables (Expected) | Language | Priority |
|---|---------------|-------------------|----------|----------|
| 1 | `biology_questions.db` | `biology`, `biologyHindi` | English + Hindi | P0 |
| 2 | `chemistry_questions.db` | `chemistry`, `chemistryHindi` | English + Hindi | P0 |
| 3 | `npcm_phy_database.db` | `npcmPhy` | English only | P0 |
| 4 | `physics_questions.db` | `physics`, `physicsHindi`? | English + Hindi? | P0 |
| 5 | `npcm_bio_database.db` | `npcmBio`, `npcmBioHindi`? | English + Hindi? | P1 |
| 6 | `npcm_chem_database.db` | `npcmChem`, `npcmChemHindi`? | English + Hindi? | P1 |
| 7 | `subject_cache.db` | `subjects`, `chapters`, `topics`, `subtopics`, `uids` | Metadata | P0 |

**Note:** NPCM likely stands for "Notes, Practice, Custom Material" - supplementary content beyond main questions.

---

## Critical Schema Changes Required

### Current Issue
The [`ImportedQuestion.js`](../src/models/ImportedQuestion.js:9) schema has:
```javascript
questionId: {
    type: String,
    required: true,
    unique: true,  // <-- THIS IS THE PROBLEM
    index: true,
}
```

This causes collisions because:
- Biology ID `31312` = "Sunflower" question
- Physics ID `31312` = "Graph" question

### Required Fix
```javascript
// 1. Remove unique: true from questionId
questionId: {
    type: String,
    required: true,
    index: true,  // Keep index, remove unique
}

// 2. Add compound unique index at the bottom
ImportedQuestionSchema.index({ subject: 1, questionId: 1 }, { unique: true });
```

---

## Data Mapping Strategy

### Field Mapping (SQLite -> MongoDB)

| SQLite Column | MongoDB Field | Notes |
|---------------|---------------|-------|
| `uniqueId` | `questionId` | Store as String |
| `question` | `question` | Primary question text |
| `answer` | `correct_answer` | Plain text answer |
| `optionA` | `options.A` | |
| `optionB` | `options.B` | |
| `optionC` | `options.C` | |
| `optionD` | `options.D` | |
| `explanation` | `explanation` | |
| `topicName` | `source` | Original format: "Chapter >> Topic >> Subtopic" |
| `difficultyLevel` | `difficulty` | Map: 1->easy, 2->medium, 3->hard |
| `quizType` | `type` | mcq, fillup, etc. |
| `syllabusUpdate` | `status` | NEW, DELETED, UPDATED |
| `ncert22Page` | `chapter_start` | If available |
| `ncert23Page` | `chapter_end` | If available |

### Image ID Extraction

For Physics (and others with inline image references):
- Extract `nXXXX` pattern from question text using regex: `/n\d{4}/g`
- Store in `imageId` field
- Clean the `nXXXX` references from the actual question text

---

## Hindi Question Handling

**CRITICAL: Hindi questions are DISTINCT questions, NOT translations.**

Example from data:
- English `biology.uniqueId=3`: "Which one of the statements is not valid for aerosols"
- Hindi `biologyHindi.uniqueId=150101`: "विकास दो प्रक्रियाओं का योग है?"

### Storage Strategy

Hindi questions will be stored as **separate documents** with:
- Their own `uniqueId` from the Hindi table
- Subject mapped appropriately (e.g., `biology` for biologyHindi)
- Language indicator in tags: `["hindi", "biology"]`
- OR a new field `language: "hi"` (recommended)

### Recommended Schema Addition

```javascript
// Add to ImportedQuestionSchema
language: {
    type: String,
    enum: ['en', 'hi'],
    default: 'en',
    index: true,
},
```

Compound index update:
```javascript
// Unique constraint now includes language
ImportedQuestionSchema.index({ subject: 1, questionId: 1, language: 1 }, { unique: true });
```

---

## Subject Determination Logic

| Table Source | Subject Value | Language |
|--------------|---------------|----------|
| `biology` | `biology` | en |
| `biologyHindi` | `biology` | hi |
| `chemistry` | `chemistry` | en |
| `chemistryHindi` | `chemistry` | hi |
| `npcmPhy` | `physics` | en |
| `physics` | `physics` | en |
| `physicsHindi` | `physics` | hi |
| `npcmBio` | `biology` | en |
| `npcmChem` | `chemistry` | en |

---

## Taxonomy Integration (subject_cache.db)

### Tables to Process

1. **`subjects`**: Maps subject_id -> subject name
2. **`chapters`**: Maps chapter_id -> chapter name, subject_id
3. **`topics`**: Maps topic_id -> topic name, chapter_id
4. **`subtopics`**: Maps subtopic_id -> subtopic name, topic_id
5. **`uids`**: Maps uid (questionId) -> subtopic_id

### Backfill Strategy

After importing questions, run a backfill script to:
1. Join `uids` table with `subtopics`, `topics`, `chapters`
2. Populate `chapterId`, `topic`, `subTopic` fields in MongoDB
3. This provides structured taxonomy beyond the string `source` field

---

## Migration Script Architecture

### Script: `scripts/migrateFromSqlite.js`

```javascript
// Pseudocode structure

const dbConfigs = [
  { file: 'biology_questions.db', table: 'biology', subject: 'biology', lang: 'en' },
  { file: 'biology_questions.db', table: 'biologyHindi', subject: 'biology', lang: 'hi' },
  { file: 'chemistry_questions.db', table: 'chemistry', subject: 'chemistry', lang: 'en' },
  { file: 'chemistry_questions.db', table: 'chemistryHindi', subject: 'chemistry', lang: 'hi' },
  { file: 'npcm_phy_database.db', table: 'npcmPhy', subject: 'physics', lang: 'en' },
  { file: 'physics_questions.db', table: 'physics', subject: 'physics', lang: 'en' },
  // ... more to be discovered
];

async function migrate() {
  // 1. Connect to MongoDB
  // 2. Clear or backup existing ImportedQuestion collection
  // 3. For each dbConfig:
  //    a. Connect to SQLite
  //    b. Stream/process rows in batches
  //    c. Transform each row to MongoDB document
  //    d. Bulk insert to MongoDB
  // 4. Run taxonomy backfill from subject_cache.db
  // 5. Generate migration report
}
```

### Transformation Logic

```javascript
function transformRow(row, config) {
  const doc = {
    questionId: String(row.uniqueId),
    subject: config.subject,
    language: config.lang,
    question: extractAndCleanImages(row.question),
    options: {
      A: row.optionA,
      B: row.optionB,
      C: row.optionC,
      D: row.optionD,
    },
    correct_answer: row.answer,
    correct_option: extractOptionLetter(row.answer, row),
    explanation: extractAndCleanImages(row.explanation),
    source: row.topicName,
    type: mapQuizType(row.quizType),
    status: mapStatus(row.syllabusUpdate),
    difficulty: mapDifficulty(row.difficultyLevel),
    imageId: extractImageId(row.question, row.explanation),
    tags: [config.lang === 'hi' ? 'hindi' : 'english'],
  };
  return doc;
}
```

---

## Data Verification Checklist

### Pre-Migration
- [ ] Backup existing MongoDB `importedquestions` collection
- [ ] Record counts from each SQLite table
- [ ] Verify schema changes are applied

### Post-Migration
- [ ] Count documents in MongoDB matches sum of all SQLite rows
- [ ] Sample questions from each subject/language verified
- [ ] Image IDs extracted correctly
- [ ] Taxonomy backfill completed
- [ ] Compound index working (no duplicate subject+questionId+language)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss | Full MongoDB backup before migration |
| ID collisions | Compound unique index on subject+questionId+language |
| Corrupt image refs | Regex validation + manual sampling |
| Missing Hindi data | Separate processing pipeline for all Hindi tables |
| Partial migration | Idempotent upserts with transaction logging |

---

## Execution Steps

### Phase 1: Schema Update (Architect/Code Mode)
1. Update `ImportedQuestion.js` schema
2. Remove `unique: true` from `questionId`
3. Add `language` field
4. Add compound index

### Phase 2: Exploration (Code Mode)
1. Run exploration script on all 7 databases
2. Document exact table structures
3. Identify any unexpected columns

### Phase 3: Migration Script (Code Mode)
1. Create `scripts/migrateFromSqlite.js`
2. Implement batch processing
3. Add progress logging

### Phase 4: Taxonomy Backfill (Code Mode)
1. Create `scripts/backfillTaxonomyFromCache.js`
2. Join uids -> subtopics -> topics -> chapters

### Phase 5: Verification (Code Mode)
1. Run count validations
2. Sample data verification
3. Performance testing on indexes

---

## Pre-Migration Backup (Hindi Preservation)

Before wiping the database, we will create a backup of all MongoDB questions that have manual Hindi translations (`questionHi`, `explanationHi`, etc.).

Crucially, this backup will map the translations using **BOTH `questionId` and `subject`**.
Since `questionId` is not unique across subjects, using `subject` alongside it ensures we map the old translations back to exactly the right newly-imported English variant.

---

## Open Questions to Resolve

1. **Data Overwrite Policy**: Should we wipe the existing `importedquestions` collection or upsert?
   - **Recommendation**: Clean wipe + full re-import for data integrity

2. **NPCM Content**: What is the `quizType='notes'` content in npcmPhy? Should these be imported as questions?
   - **Observation**: These appear to be image-only notes with no question text

3. **Additional Physics**: Does `physics_questions.db` exist and have different structure than `npcm_phy_database.db`?

4. **Difficulty Mapping**: Confirm mapping:
   - `difficultyLevel=1` -> `easy`
   - `difficultyLevel=2` -> `medium`
   - `difficultyLevel=3` -> `hard`

---

## Appendices

### Appendix A: Sample Data Analysis

#### biology table (English)
```
uniqueId: 3
topicName: Ecology >> Environmental Issues >> Previous Year Questions 1
quizType: mcq
difficultyLevel: 3
```

#### biologyHindi table (Hindi)
```
uniqueId: 150101
topicName: पादपकार्यिकी >> पादप वृद्धि  एंव  परिवर्धन  >> परिचय
quizType: mcq
difficultyLevel: 2
```

#### npcmPhy table (Physics Notes)
```
uniqueId: 1000030101
question: n0301, n0302, n0303, ... (image references only)
quizType: notes
difficultyLevel: 101
```

### Appendix B: ID Range Analysis

Based on sample data:
- Biology English: Low IDs (e.g., 3, 4, 5...)
- Biology Hindi: High IDs (e.g., 150101...)
- Chemistry English: Low IDs (e.g., 1, 2, 3...)
- Chemistry Hindi: High IDs (e.g., 10120101...)
- Physics NPCM: Very high IDs (e.g., 1000030101...)

This confirms IDs are NOT unique across subjects and MUST be combined with subject+language for uniqueness.

---

*Plan Version: 1.0*
*Last Updated: 2026-03-25*
