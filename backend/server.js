require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');

const schemeRoutes = require('./src/routes/schemeRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const eligibilityRoutes = require('./src/routes/eligibilityRoutes');
const schemeService = require('./src/services/schemeService');

const app = express();

// Connect to database
connectDB().then(() => {
  // Automatically fetch scheme data from government portals on server start
  console.log('Initiating automatic background fetch of schemes...');
  schemeService.fetchAllSources()
    .then(result => console.log(`Automatic fetch complete: ${result.totalSaved} schemes saved/updated.`))
    .catch(err => console.error('Automatic fetch failed:', err.message));
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/eligibility', eligibilityRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
