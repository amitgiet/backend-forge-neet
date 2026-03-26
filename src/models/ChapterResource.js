const mongoose = require('mongoose');

// ── Page file (used for image_pages mode notes) ──────────────────────────────
const PageFileSchema = new mongoose.Schema(
    {
        pageId:    { type: String, required: true },
        driveLink: { type: String, default: null },
        driveId:   { type: String, default: null },
    },
    { _id: false }
);

// ── Notes section ─────────────────────────────────────────────────────────────
const NotesSchema = new mongoose.Schema(
    {
        // "pdf" → single Drive file | "image_pages" → array of per-page files
        mode:      { type: String, enum: ['pdf', 'image_pages'], default: null },
        driveLink: { type: String, default: null },   // PDF mode only
        driveId:   { type: String, default: null },   // PDF mode only
        pageFiles: { type: [PageFileSchema], default: [] }, // image_pages mode
        pageCount: { type: Number, default: 0 },
        migratedAt: { type: Date, default: null },
    },
    { _id: false }
);

// ── Generic content item (podcast / crossword / meme / gridlock) ──────────────
const ContentItemSchema = new mongoose.Schema(
    {
        uniqueId: { type: String, required: true },
        // topicName part after the 2nd ">>" e.g. "Intorduction to Digestion and Absorption"
        title:    { type: String, default: null },
        question: { type: String, default: null }, // raw content / ID from DB
        answer:   { type: String, default: null },
        driveLink: { type: String, default: null },
        driveId:   { type: String, default: null },
        // For items with multiple files (like memes)
        files:     { type: [PageFileSchema], default: [] },
    },
    { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const ChapterResourceSchema = new mongoose.Schema(
    {
        // Composite string _id → "{subject}::{chapterName}"
        // e.g. "biology::Digestion and Absorption"
        _id: { type: String },

        subject: {
            type: String,
            required: true,
            enum: ['biology', 'chemistry', 'physics'],
            index: true,
        },

        // Display name extracted from topicName (before first ">>")
        chapterName: { type: String, required: true },

        // Lowercase, underscore slug  e.g. "digestion_and_absorption"
        slug: { type: String, default: null },

        // Drive-migrated notes (PDF or per-page images)
        notes: { type: NotesSchema, default: () => ({}) },

        // Audio episodes – one entry per podcast row in the DB
        podcasts: { type: [ContentItemSchema], default: [] },

        // Crossword puzzles
        crosswords: { type: [ContentItemSchema], default: [] },

        // Meme images
        memes: { type: [ContentItemSchema], default: [] },

        // Chemistry-only gridlock puzzles
        gridlocks: {
            type: [{
                uniqueId: { type: String, required: true },
                title:    { type: String, default: null },
                // Structured grid data:
                columns: [{
                    header: { type: String, default: null },
                    cells: [{
                        value:     { type: String, default: null }, // raw text or imageId
                        isImage:   { type: Boolean, default: false },
                        driveLink: { type: String, default: null },
                        driveId:   { type: String, default: null },
                    }]
                }]
            }],
            default: []
        },
    },
    {
        collection: 'chapterresources',
        versionKey: false,
        // _id is a String, disable default ObjectId behavior
    }
);

ChapterResourceSchema.index({ subject: 1 });
ChapterResourceSchema.index({ subject: 1, slug: 1 });

module.exports = mongoose.model('ChapterResource', ChapterResourceSchema);
