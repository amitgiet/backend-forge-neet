const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            // Mongoose 6+ no longer needs these options
            // useNewUrlParser and useUnifiedTopology are defaults
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`.cyan.bold);

        // Connection event listeners
        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err}`.red);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected'.yellow);
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('\n📴 MongoDB connection closed due to app termination');
            process.exit(0);
        });

    } catch (error) {
        console.error(`❌ Error connecting to MongoDB: ${error.message}`.red.bold);
        process.exit(1);
    }
};

module.exports = connectDB;
