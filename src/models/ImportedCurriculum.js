const mongoose = require('mongoose');

const SubTopicSchema = new mongoose.Schema(
    {
        subTopic: { type: String, required: true },
        uids: { type: [Number], default: [] },
        hidden_uids: { type: [Number], default: [] },
        video: { type: String, default: null },
        notes: { type: String, default: null },
    },
    { _id: false }
);

const TopicSchema = new mongoose.Schema(
    {
        topic: { type: String, required: true },
        sub_topics: { type: [SubTopicSchema], default: [] },
    },
    { _id: false }
);
const ToppersEssentialsSchema = new mongoose.Schema(
    {
        video: {
            title: { type: String, default: null },
            url: { type: String, default: null },
            time: { type: String, default: null }
        },
        mindmap: { type: Object, default: null },
        audio: { type: String, default: null },
        slidesdeck: {
            title: { type: String, default: null },
            url: { type: String, default: null }
        },
        report: { type: String, default: null },
        flashcards: { type: String, default: null },
        infographic: { type: String, default: null }
    },
    { _id: false }
);

const ImportedCurriculumSchema = new mongoose.Schema(
    {
        // chapter name, e.g. "DIVERSITY IN LIVING WORLD"
        _id: { type: String },

        // "biology" | "chemistry" | "physics"
        subject: {
            type: String,
            required: true,
            enum: ['biology', 'chemistry', 'physics'],
            index: true,
        },

        // Original JSON type field (e.g. "Newly-added-syllabus")
        type: { type: String, default: null },

        // Whether this chapter is hidden in the UI
        isHidden: { type: Boolean, default: false },

        // Insertion order for display sorting within a subject
        order: { type: Number, default: 0, index: true },

        topics: { type: [TopicSchema], default: [] },

        toppersEssentials: { type: ToppersEssentialsSchema, default: () => ({}) },
    },
    {
        collection: 'importedcurriculum',
        // _id is a String so we disable the default ObjectId
        versionKey: false,
    }
);

// Compound index: most queries filter by subject then order
ImportedCurriculumSchema.index({ subject: 1, order: 1 });

module.exports = mongoose.model('ImportedCurriculum', ImportedCurriculumSchema);
