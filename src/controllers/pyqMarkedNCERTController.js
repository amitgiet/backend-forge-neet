const PYQMarkedNCERT = require('../models/PYQMarkedNCERT');

// Get all PYQ topics for a subject (with optional stream filter for biology)
exports.getTopicsBySubject = async (req, res) => {
  try {
    const { subject, stream } = req.query;

    if (!subject) {
      return res.status(400).json({
        success: false,
        message: 'Subject parameter is required'
      });
    }

    const query = { subject: subject.toLowerCase() };

    // For biology, optionally filter by stream
    if (subject.toLowerCase() === 'biology' && stream) {
      query.stream = stream.toLowerCase();
    }

    const topics = await PYQMarkedNCERT.find(query)
      .sort({ order: 1 })
      .select('_id topicName url stream isAvailable order');

    res.status(200).json({
      success: true,
      data: {
        subject,
        stream: stream || null,
        topics,
        totalTopics: topics.length
      }
    });
  } catch (error) {
    console.error('Error fetching PYQ topics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching PYQ topics',
      error: error.message
    });
  }
};

// Get all subjects with their topics organized
exports.getAllPYQData = async (req, res) => {
  try {
    const pythonData = await PYQMarkedNCERT.find().sort({ subject: 1, stream: 1, order: 1 });

    const organized = {
      physics: [],
      chemistry: [],
      biology: {
        botany: [],
        zoology: []
      }
    };

    pythonData.forEach(item => {
      if (item.subject === 'physics') {
        organized.physics.push({
          _id: item._id,
          topicName: item.topicName,
          url: item.url,
          isAvailable: item.isAvailable
        });
      } else if (item.subject === 'chemistry') {
        organized.chemistry.push({
          _id: item._id,
          topicName: item.topicName,
          url: item.url,
          isAvailable: item.isAvailable
        });
      } else if (item.subject === 'biology') {
        if (item.stream === 'botany') {
          organized.biology.botany.push({
            _id: item._id,
            topicName: item.topicName,
            url: item.url,
            isAvailable: item.isAvailable
          });
        } else if (item.stream === 'zoology') {
          organized.biology.zoology.push({
            _id: item._id,
            topicName: item.topicName,
            url: item.url,
            isAvailable: item.isAvailable
          });
        }
      }
    });

    res.status(200).json({
      success: true,
      data: organized
    });
  } catch (error) {
    console.error('Error fetching all PYQ data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching PYQ data',
      error: error.message
    });
  }
};

// Get a specific topic by ID
exports.getTopicById = async (req, res) => {
  try {
    const { topicId } = req.params;

    const topic = await PYQMarkedNCERT.findById(topicId);

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      data: topic
    });
  } catch (error) {
    console.error('Error fetching topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching topic',
      error: error.message
    });
  }
};

// Admin: Add new PYQ topic
exports.addTopic = async (req, res) => {
  try {
    const { subject, stream, topicName, url } = req.body;

    if (!subject || !topicName || !url) {
      return res.status(400).json({
        success: false,
        message: 'Subject, topic name, and URL are required'
      });
    }

    const topic = await PYQMarkedNCERT.create({
      subject: subject.toLowerCase(),
      stream: stream ? stream.toLowerCase() : null,
      topicName,
      url
    });

    res.status(201).json({
      success: true,
      message: 'Topic added successfully',
      data: topic
    });
  } catch (error) {
    console.error('Error adding topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding topic',
      error: error.message
    });
  }
};

// Admin: Update topic
exports.updateTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const updates = req.body;

    const topic = await PYQMarkedNCERT.findByIdAndUpdate(topicId, updates, {
      new: true,
      runValidators: true
    });

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Topic updated successfully',
      data: topic
    });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating topic',
      error: error.message
    });
  }
};

// Admin: Delete topic
exports.deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    const topic = await PYQMarkedNCERT.findByIdAndDelete(topicId);

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Topic deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting topic',
      error: error.message
    });
  }
};
