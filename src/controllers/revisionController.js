const RevisionSchedule = require('../models/RevisionSchedule');

// Start tracking a new topic (Level 1: Learn)
exports.startRevision = async (req, res) => {
  try {
    const { subject, chapter, topic } = req.body;
    const userId = req.user._id;

    // Check if already exists
    let revision = await RevisionSchedule.findOne({ userId, subject, chapter, topic });
    
    if (revision) {
      return res.status(400).json({ message: 'Topic already being tracked' });
    }

    const now = new Date();
    revision = new RevisionSchedule({
      userId,
      subject,
      chapter,
      topic,
      currentLevel: 1,
      scheduledDates: {
        level1: now,
        level2: now, // Same day
        level3: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day
        level4: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        level5: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
      },
      lastRevisedAt: now,
      nextRevisionDue: now
    });

    await revision.save();
    res.status(201).json({ success: true, data: revision });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Complete a revision level
exports.completeRevision = async (req, res) => {
  try {
    const { revisionId } = req.params;
    const { score, timeSpent, confidence } = req.body;
    
    const revision = await RevisionSchedule.findById(revisionId);
    if (!revision) {
      return res.status(404).json({ message: 'Revision not found' });
    }

    // Add revision record
    revision.revisions.push({
      level: revision.currentLevel,
      completedAt: new Date(),
      score,
      timeSpent,
      confidence
    });

    // Move to next level
    if (revision.currentLevel < 7) {
      revision.currentLevel += 1;
    } else {
      revision.status = 'completed';
    }

    revision.lastRevisedAt = new Date();
    revision.calculateNextRevision();
    revision.calculateRetention();
    revision.updatePriority();

    await revision.save();
    res.json({ success: true, data: revision });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get due revisions for today
exports.getDueRevisions = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const revisions = await RevisionSchedule.find({
      userId,
      status: 'active',
      nextRevisionDue: { $lte: now }
    }).sort({ priority: -1, nextRevisionDue: 1 });

    // Update overdue status
    revisions.forEach(r => r.updatePriority());

    res.json({ success: true, count: revisions.length, data: revisions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all revisions with filters
exports.getRevisions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { subject, level, priority, status } = req.query;

    const filter = { userId };
    if (subject) filter.subject = subject;
    if (level) filter.currentLevel = parseInt(level);
    if (priority) filter.priority = priority;
    if (status) filter.status = status;

    const revisions = await RevisionSchedule.find(filter).sort({ nextRevisionDue: 1 });
    res.json({ success: true, count: revisions.length, data: revisions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get revision analytics
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;

    const revisions = await RevisionSchedule.find({ userId });

    const analytics = {
      totalTopics: revisions.length,
      byLevel: {
        level1: revisions.filter(r => r.currentLevel === 1).length,
        level2: revisions.filter(r => r.currentLevel === 2).length,
        level3: revisions.filter(r => r.currentLevel === 3).length,
        level4: revisions.filter(r => r.currentLevel === 4).length,
        level5: revisions.filter(r => r.currentLevel === 5).length,
        level6: revisions.filter(r => r.currentLevel === 6).length,
        level7: revisions.filter(r => r.currentLevel === 7).length
      },
      byPriority: {
        urgent: revisions.filter(r => r.priority === 'urgent').length,
        high: revisions.filter(r => r.priority === 'high').length,
        medium: revisions.filter(r => r.priority === 'medium').length,
        low: revisions.filter(r => r.priority === 'low').length
      },
      avgRetention: Math.round(revisions.reduce((sum, r) => sum + r.retentionScore, 0) / revisions.length) || 0,
      completed: revisions.filter(r => r.status === 'completed').length,
      overdue: revisions.filter(r => r.isOverdue).length,
      dueToday: revisions.filter(r => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return r.nextRevisionDue >= today && r.nextRevisionDue < tomorrow;
      }).length
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Set pre-exam dates (Level 6 & 7)
exports.setExamDates = async (req, res) => {
  try {
    const userId = req.user._id;
    const { preExamDate, finalBoostDate } = req.body;

    await RevisionSchedule.updateMany(
      { userId, currentLevel: { $gte: 5 } },
      {
        $set: {
          'scheduledDates.level6': new Date(preExamDate),
          'scheduledDates.level7': new Date(finalBoostDate)
        }
      }
    );

    res.json({ success: true, message: 'Exam dates set successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = exports;
