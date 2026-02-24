require('dotenv').config();
require('colors');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');

// Import configurations
const connectDB = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');

// Connect to database
connectDB();

// Initialize app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? process.env.FRONTEND_URL_PROD
            : [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:8080'],
        credentials: true
    }
});

// Initialize Socket Service
const SocketService = require('./src/services/socketService');
const socketService = new SocketService(io);
socketService.initialize();

// Make io available to routes
app.set('io', io);

// ============ MIDDLEWARE ============

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:8080',"https://id-preview--efcfdeae-989c-4e6f-9537-c5377a163c0a.lovable.app", "https://neetforge.vercel.app/"
];

const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Sanitize data (prevent NoSQL injection)
app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased to 1000 for development
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for development
        return process.env.NODE_ENV === 'development';
    }
});
app.use('/api/', limiter);

// Compression
app.use(compression());

// Logging (development)
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ============ ROUTES ============

// API Info
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 NEETForge API is running!',
        version: process.env.API_VERSION || 'v1',
        environment: process.env.NODE_ENV,
        documentation: '/api/v1/docs',
        endpoints: {
            auth: '/api/v1/auth',
            analyze: '/api/v1/analyze',
            mockTests: '/api/v1/mocks',
            questions: '/api/v1/questions',
            studyPlan: '/api/v1/study-plan',
            chapters: '/api/v1/chapters',
            subscription: '/api/v1/subscription'
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Mount routers
const API_VERSION = process.env.API_VERSION || 'v1';

app.use(`/api/${API_VERSION}/auth`, require('./src/routes/authRoutes'));
app.use(`/api/${API_VERSION}/analyze`, require('./src/routes/analyzeRoutes'));
app.use(`/api/${API_VERSION}/mocks`, require('./src/routes/mockRoutes'));
app.use(`/api/${API_VERSION}/study-plan`, require('./src/routes/planRoutes'));
app.use(`/api/${API_VERSION}/chapters`, require('./src/routes/chapterRoutes'));
app.use(`/api/${API_VERSION}/sessions`, require('./src/routes/sessionRoutes'));
app.use(`/api/${API_VERSION}/questions`, require('./src/routes/questionRoutes'));
app.use(`/api/${API_VERSION}/neuronz`, require('./src/routes/neuronzRoutes'));
app.use(`/api/${API_VERSION}/learning-paths`, require('./src/routes/learningPathRoutes'));
app.use(`/api/${API_VERSION}/challenges`, require('./src/routes/challengeRoutes'));
app.use(`/api/${API_VERSION}/social`, require('./src/routes/socialRoutes'));
app.use(`/api/${API_VERSION}/admin`, require('./src/routes/adminRoutes'));
app.use(`/api/${API_VERSION}/revisions`, require('./src/routes/revisionRoutes'));
app.use(`/api/${API_VERSION}/tests`, require('./src/routes/testRoutes'));
app.use(`/api/${API_VERSION}/quiz-generator`, require('./src/routes/quizGeneratorRoutes'));
app.use(`/api/${API_VERSION}/daily-challenge`, require('./src/routes/dailyChallengeRoutes'));

// More routes will be added here
// app.use(`/api/${API_VERSION}/questions`, require('./src/routes/questionRoutes'));
// app.use(`/api/${API_VERSION}/subscription`, require('./src/routes/subscriptionRoutes'));

// ============ ERROR HANDLING ============

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Global error handler
app.use(errorHandler);

// ============ SERVER ============

const PORT = process.env.PORT || 5002;

server.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(50).cyan);
    console.log(`🚀 NEETForge Backend Server`.green.bold);
    console.log('='.repeat(50).cyan);
    console.log(`📡 Running on port: ${PORT}`.yellow);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`.yellow);
    console.log(`🔗 API URL: http://localhost:${PORT}/api/${API_VERSION}`.yellow);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`.yellow);
    console.log('='.repeat(50).cyan);
    console.log('');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.error(`❌ Error: ${err.message}`.red.bold);
    // Close server & exit process
    server.close(() => process.exit(1));
});

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Process terminated');
    });
});

module.exports = app;
