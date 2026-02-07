# ⚡ NEETForge Backend - Production-Ready API

> AI-Powered NEET 2027 Preparation Platform - Scalable Backend Architecture

[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0%2B-green)](https://www.mongodb.com)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## 🎯 Overview

NEETForge Backend is a production-grade REST API built with the MERN stack, designed specifically for Indian medical entrance exam preparation. Features include:

- ✅ **AI Weakness Analysis** - Upload mock test PDFs, get instant weakness detection
- ✅ **Exam-Agnostic Architecture** - Easy expansion to JEE, BITSAT, AIIMS
- ✅ **97 NCERT Chapters Mapped** - Complete Biology, Physics, Chemistry coverage
- ✅ **Adaptive Study Plans** - Energy-based scheduling with spaced repetition
- ✅ **Gamification** - Coins, badges, streaks, and XP system
- ✅ **Multi-tier Subscriptions** - Free, Pro (₹149/mo), Ultimate (₹299/mo)

## 📁 Project Structure

```
backend/
├── src/
│   ├── models/              # Mongoose schemas
│   │   ├── User.js           # User with multi-exam support
│   │   ├── Chapter.js        # Exam-agnostic chapter model
│   │   ├── Question.js       # MCQ with PYQ tracking
│   │   ├── MockTest.js       # Full-length tests
│   │   ├── TestAttempt.js    # Submission & analysis
│   │   └── StudyPlan.js      # AI-generated plans
│   │
│   ├── controllers/         # Request handlers
│   │   ├── authController.js
│   │   └── weaknessController.js
│   │
│   ├── routes/              # API endpoints
│   │   ├── authRoutes.js
│   │   └── analyzeRoutes.js
│   │
│   ├── services/            # Business logic
│   │   └── aiAnalysisService.js  # OpenAI GPT-4 integration
│   │
│   ├── middleware/          # Express middleware
│   │   ├── auth.js           # JWT verification
│   │   ├── errorHandler.js
│   │   └── upload.js         # Multer file handling
│   │
│   ├── utils/               # Helper functions
│   │   ├── pdfParser.js      # Allen/Aakash scorecard parser
│   │   └── errorResponse.js
│   │
│   ├── config/              # Configuration
│   │   ├── database.js
│   │   └── examConfig.js     # NEET/JEE/BITSAT configs
│   │
│   └── seeders/             # Database seeding
│       ├── seedAll.js
│       └── data/
│           ├── biologyChapters.js
│           └── physicsChapters.js
│
├── uploads/                 # PDF uploads
├── server.js                # Express server
├── package.json
└── .env.example             # Environment template
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+)
- MongoDB (v6.0+)
- OpenAI API Key (optional, for AI features)

### Installation

```bash
# 1. Clone repository
cd backend

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, etc.

# 4. Seed database with NCERT chapters
npm run seed

# 5. Start development server
npm run dev
```

Server will run on `http://localhost:5000`

## 🔧 Environment Variables

Create a `.env` file with:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/neetforge

# JWT
JWT_SECRET=your_secret_key_min_32_characters_long
JWT_EXPIRE=7d
JWT_COOKIE_EXPIRE=7

# OpenAI (optional)
OPENAI_API_KEY=sk-your-key
ENABLE_AI_ANALYSIS=true

# Frontend
FRONTEND_URL=http://localhost:3000

# Stripe (for subscriptions)
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PRO_PRICE_ID=price_your_id
```

## 📡 API Endpoints

### Authentication

```
POST   /api/v1/auth/register     - Register new user
POST   /api/v1/auth/login        - Login
GET    /api/v1/auth/me           - Get current user
GET    /api/v1/auth/dashboard    - Dashboard stats
PUT    /api/v1/auth/profile      - Update profile
POST   /api/v1/auth/exams        - Add exam to profile
```

### Weakness Analysis

```
POST   /api/v1/analyze/upload          - Upload & analyze PDF scorecard
GET    /api/v1/analyze/weaknesses      - Get user weaknesses
GET    /api/v1/analyze/fix/:chapterId  - Get targeted questions
GET    /api/v1/analyze/test/:attemptId - Detailed test analysis
GET    /api/v1/analyze/trends          - Weakness trends (PRO)
```

### Example Request

```bash
# Register User
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Amit Kumar",
    "email": "amit@example.com",
    "password": "neet2027",
    "primaryExam": "NEET_UG",
    "targetYear": 2027,
    "class": 12
  }'

# Upload Scorecard
curl -X POST http://localhost:5000/api/v1/analyze/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "scorecard=@allen_mock_test.pdf"
```

## 🧪 Database Seeding

Populate database with NCERT chapters:

```bash
# Seed all data
npm run seed

# Seed only chapters
npm run seed:chapters
```

**Seeded Data:**
- 15+ Biology chapters (Photosynthesis, Genetics, Human Reproduction)
- 15+ Physics chapters (Optics, Thermodynamics, Electrostatics)
- NEET weightage percentages
- Difficulty distribution
- NCERT page references

## 🏗️ Architecture Highlights

### 1. **Exam-Agnostic Design**

```javascript
// Easy to add JEE support
examWeights: {
  NEET_UG: { percentage: 3.5, questionsCount: 6 },
  JEE_MAIN: { percentage: 2.0, questionsCount: 3 },
  JEE_ADVANCED: { percentage: 1.5, questionsCount: 2 }
}
```

### 2. **Scalable User Progress**

```javascript
progress: [{
  chapterId: 'biology_genetics',
  mastery: 75,          // 0-100
  weaknessScore: 25,    // 0-100
  accuracy: 80,
  nextRevisionAt: Date,
  spacedRepetitionInterval: 7  // days
}]
```

### 3. **AI-Powered Analysis**

```javascript
// Uses OpenAI GPT-4 for weakness detection
const analysis = await aiAnalysisService.analyzeTestPerformance(attempt, user);
// Returns: topWeaknesses, recommendations, studyStrategy
```

### 4. **Multi-Language Support**

```javascript
name: {
  en: 'Photosynthesis',
  hi: 'प्रकाश संश्लेषण'
}
```

## 🔐 Security Features

- Helmet.js for HTTP headers
- Express Rate Limiting (100 req/15min)
- MongoDB Sanitization (NoSQL injection prevention)
- JWT with HTTP-only cookies
- Bcrypt password hashing
- CORS configuration

## 📊 Data Models

### User Model
- Multi-exam support (NEET/JEE/BITSAT)
- Chapter-wise progress tracking
- Gamification (coins, XP, badges, streaks)
- Subscription management (Free/Pro/Ultimate)

### Chapter Model
- Exam-specific weightages
- NCERT mapping (class, chapter, pages)
- Difficulty distribution
- PYQ frequency

### TestAttempt Model
- Comprehensive scoring
- Chapter-wise analysis
- Difficulty breakdown
- AI-generated insights

## 🚀 Deployment

### Render.com (Recommended)

```bash
# 1. Create new Web Service on Render
# 2. Connect GitHub repo
# 3. Set environment variables
# 4. Deploy!

Build Command: npm install
Start Command: npm start
```

### MongoDB Atlas

```bash
# 1. Create cluster on MongoDB Atlas
# 2. Whitelist Render IP addresses
# 3. Update MONGODB_URI in Render env vars
```

## 📈 Roadmap

- [ ] Mock Test Controller & Routes
- [ ] Study Plan Generator API
- [ ] Question Bank Management
- [ ] Subscription/Payment Integration (Stripe)
- [ ] Admin Dashboard APIs
- [ ] Real-time Notifications (Socket.io)
- [ ] Redis Caching Layer
- [ ] Elasticsearch for NCERT Search

## 🧪 Testing

```bash
# Run tests (coming soon)
npm test
```

## 📝 Scripts

```json
{
  "start": "node server.js",
  "dev": "nodemon server.js",
  "seed": "node src/seeders/seedAll.js",
  "test": "jest --watchAll"
}
```

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file

## 🙏 Credits

- **NCERT** - Chapter content and structure
- **OpenAI** - GPT-4 for AI analysis
- **Allen/Aakash** - Test pattern reference

## 📞 Support

- Email: support@neetforge.com
- Discord: [Join Community](#)
- Docs: [API Documentation](#)

---

Built with ❤️ for NEET 2027 aspirants | **Target: 10K users Month 1**
