require('./lib/networkGuard');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const os = require('os');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

dotenv.config();

const { resolveModels } = require('./lib/geminiConfig');
const Scheme = require('./models/Scheme');

const app = express();
const port = process.env.PORT || 3000;
const host = '0.0.0.0';

let dbMode = 'disconnected';

async function seedLocalIfEmpty() {
  try {
    const count = await Scheme.countDocuments();
    if (count === 0) {
      console.log('Local database is empty. Seeding starter schemes...');
      const p1 = path.join(__dirname, 'data', 'starter-schemes.json');
      const p2 = path.join(__dirname, 'data', 'starter-schemes-additions.json');
      let data = [];
      if (fs.existsSync(p1)) {
        data = [...data, ...JSON.parse(fs.readFileSync(p1, 'utf8'))];
      }
      if (fs.existsSync(p2)) {
        data = [...data, ...JSON.parse(fs.readFileSync(p2, 'utf8'))];
      }
      if (data.length > 0) {
        await Scheme.insertMany(data);
        console.log(`Seeded ${data.length} starter schemes into local database.`);
      }
    }
  } catch (err) {
    console.error('Failed to seed local database:', err.message);
  }
}

const chalk = require('chalk');
const { initMongoConnection, getDbStatus } = require('./lib/mongo');

// Connect to MongoDB with retries and fallback
initMongoConnection({
  uri: process.env.MONGODB_URI,
  fallbackUri: 'mongodb://127.0.0.1:27017/tn_schemes',
  fallbackEnabled: process.env.MONGODB_FALLBACK !== 'false',
  seedLocalIfEmpty
});

// Trigger startup Gemini model resolution if explicitly enabled
if (process.env.RUN_JOBS_ON_START === 'true') {
  resolveModels().catch(err => {
    console.warn('[Server] Gemini model check warning at startup:', err.message);
  });
}

// Request ID & Detailed Logging Middleware
let reqCounter = 0;
app.use((req, res, next) => {
  req.id = `req-${Date.now()}-${++reqCounter}`;
  const start = Date.now();
  
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n======================================================`);
    console.log(`[${req.id}] 🚀 NEW REQUEST: ${req.method} ${req.url}`);
    if (Object.keys(req.query).length) console.log(`[${req.id}] 🔍 Query Params:`, req.query);
  }

  // To log body, we must wait for body-parser to parse it. We can do it by intercepting or just logging after next, 
  // but since express.json() is applied *after* this middleware in the original code, `req.body` will be undefined here.
  // Wait, in server.js, express.json() is used on line 99, while this logger is on line 70.
  // Actually, I can just log response on finish, and log method/url at start.
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
       console.log(`[${req.id}] ✅ RESPONSE STATUS: ${res.statusCode} (Took ${duration}ms)`);
       console.log(`======================================================\n`);
    }
  });

  next();
});

// Security & Parsing Middleware
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Mobile apps don't send origin
    
    // In development or if explicitly allowed, accept localhost/127.0.0.1 on any port
    if (process.env.NODE_ENV !== 'production') {
       if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
           return callback(null, true);
       }
    } else {
       // Even in prod, if localhost is needed, check explicitly
       if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
           return callback(null, true);
       }
    }
    
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'X-Accel-Buffering'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate Limiter for Auth Endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per 15 minutes for auth endpoints
  message: { error: 'Too many authentication attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
const authRouter = require('./routes/auth');
const schemesRouter = require('./routes/schemes');
const finderRouter = require('./routes/finder');
const chatRouter = require('./routes/chat');
const adminRouter = require('./routes/admin');
const profileRouter = require('./routes/profile');
const discoveriesRouter = require('./routes/discoveries');
const trackerRouter = require('./routes/tracker');
const helpCentersRouter = require('./routes/helpCenters');

const { initScheduler } = require('./services/scheduler');
const { getQuotaAndBudgetStatus } = require('./lib/gemini');
const logger = require('./lib/logger');
const readline = require('readline');

// Health Check
app.get('/api/health', async (req, res) => {
    const aiUsage = await getQuotaAndBudgetStatus();
    const dbStatus = getDbStatus();
    res.json({
      status: 'ok',
      timestamp: new Date(),
      database: dbStatus.database,
      dbReason: dbStatus.dbReason,
      aiUsage
    });
});

// Apply rate limiter to auth endpoints
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Mount API routers
app.use('/api/auth', authRouter);
app.use('/api/schemes', schemesRouter);
app.use('/api/finder', finderRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/profile', profileRouter);
app.use('/api/discoveries', discoveriesRouter);
app.use('/api/tracker', trackerRouter);
app.use('/api/help-centers', helpCentersRouter);
app.use('/api/search', require('./routes/search'));
app.use('/api/data', require('./routes/data'));
app.use('/api/admin/data', require('./routes/adminData'));

// Global Error Handler - Suppress Stack Traces
app.use((err, req, res, next) => {
    console.error('[ServerError]', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

const server = app.listen(port, host, async () => {
    console.log(`Server running on port ${port}`);
    console.log(`Chat API reachable at http://127.0.0.1:${port}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`Chat API reachable at http://${net.address}:${port}`);
        }
      }
    }
    
    // Print Banner
    try {
      const ai = await getQuotaAndBudgetStatus();
      const dbStatus = getDbStatus();
      const schedOn = process.env.ENABLE_SCHEDULER === 'true';
      const rjobOn = process.env.RUN_JOBS_ON_START === 'true';
      const discOn = process.env.ENABLE_DISCOVERY === 'true';
      const aiMode = process.env.FETCH_ONLY === 'true' ? 'fetch-only' : (process.env.AI_MODE || 'auto');

      const isAiOff = (process.env.AI_MODE || '').toLowerCase() === 'off' || (process.env.FETCH_ONLY || '').toLowerCase() === 'true';

      const sched = schedOn ? 'ON' : 'OFF (set ENABLE_SCHEDULER=true to turn on)';
      const rjob = rjobOn ? 'ON' : 'OFF';
      const disc = discOn ? 'ON' : 'OFF';
      const mods = isAiOff ? 'None (AI OFF)' : `${ai.models.mainModel}, ${ai.models.backgroundModel}`;
      
      console.log(`\n======================================================`);
      if (isAiOff) {
        console.log(`Scheduler: ${sched} | Run jobs on start: ${rjob} | Discovery: ${disc} | AI mode: ${aiMode} | Database: ${dbStatus.database} | AI: OFF, 0 Gemini calls will be made | Expected Gemini calls: 0`);
      } else {
        console.log(`Scheduler: ${sched} | Run jobs on start: ${rjob} | Discovery: ${disc} | AI mode: ${aiMode} | Database: ${dbStatus.database} | Models: ${mods} | Gemini calls today: ${ai.callsUsedToday} of ${ai.dailyCap}`);
      }
      console.log(`======================================================\n`);

      const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
      if (!isAiOff && hasGeminiKey && (schedOn || rjobOn || discOn)) {
        let estimatedCalls = 35;
        try {
          const schemeCount = await Scheme.countDocuments();
          if (schemeCount > 0) estimatedCalls = schemeCount;
        } catch (e) {}
        console.log(chalk.red(`[WARNING] Automated jobs are active with Gemini key configured. Switches: Scheduler=${schedOn ? 'ON' : 'OFF'}, Run on start=${rjobOn ? 'ON' : 'OFF'}, Discovery=${discOn ? 'ON' : 'OFF'}. Estimated Gemini calls: up to ${estimatedCalls} call(s).`));
      } else if (isAiOff) {
        console.log(chalk.green(`[AI Config] AI: OFF, 0 Gemini calls will be made. Expected Gemini calls: 0. Scraper engine active.`));
      }
      
      const isLiveAi = process.env.npm_lifecycle_event === 'live:ai';
      const skipConfirm = process.argv.includes('--yes');
      
      if (isLiveAi && !skipConfirm) {
        const SchemeModel = require('./models/Scheme');
        let count = 35;
        try {
          count = await SchemeModel.countDocuments();
        } catch (e) {}
        console.log(`Expected number of Gemini calls for verification: up to ${count} call(s).`);
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Do you want to proceed with AI calls? (y/N) ', (answer) => {
          rl.close();
          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
             console.log('Aborting AI extraction as per user input.');
             process.exit(0);
          }
          if (process.env.NODE_ENV !== 'test') {
            initScheduler();
          }
        });
      } else {
        if (process.env.NODE_ENV !== 'test') {
          initScheduler();
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        initScheduler();
      }
    }
});

module.exports = app;
