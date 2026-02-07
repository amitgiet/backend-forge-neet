const mongoose = require('mongoose');

const FriendSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    friendId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    status: {
        type: String,
        enum: ['pending', 'accepted', 'blocked'],
        default: 'pending'
    },
    
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    acceptedAt: Date,
    blockedAt: Date
    
}, {
    timestamps: true
});

FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });
FriendSchema.index({ status: 1 });

module.exports = mongoose.model('Friend', FriendSchema);
