require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const Source = require('../models/Source');
// Using a mock fetchLog for now if the collection doesn't exist
const FetchLog = mongoose.models.FetchLog || mongoose.model('FetchLog', new mongoose.Schema({}), 'fetchLogs');

async function run() {
    console.log('--- SYSTEM SWITCHES ---');
    console.log(`ENABLE_SCHEDULER: ${process.env.ENABLE_SCHEDULER}`);
    console.log(`RUN_JOBS_ON_START: ${process.env.RUN_JOBS_ON_START}`);
    console.log(`FETCH_ONLY: ${process.env.FETCH_ONLY}`);
    console.log(`ENABLE_DISCOVERY: ${process.env.ENABLE_DISCOVERY}`);
    console.log(`SHOW_PENDING_TO_USERS: ${process.env.SHOW_PENDING_TO_USERS}`);
    
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tn_schemes');
        console.log('\nConnected to DB');

        console.log('\n--- SOURCES ---');
        const totalSources = await Source.countDocuments();
        const healthySources = await Source.countDocuments({ healthStatus: 'working' });
        console.log(`Total: ${totalSources} | Healthy: ${healthySources}`);

        console.log('\n--- SCHEMES STATS ---');
        const byOrigin = await Scheme.aggregate([{ $group: { _id: "$origin", count: { $sum: 1 } } }]);
        console.log('By Origin:', byOrigin);
        
        const byReviewStatus = await Scheme.aggregate([{ $group: { _id: "$reviewStatus", count: { $sum: 1 } } }]);
        console.log('By Review Status:', byReviewStatus);
        
        const byStatus = await Scheme.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
        console.log('By Status:', byStatus);

        console.log('\n--- 10 NEWEST SCHEMES ---');
        const newest = await Scheme.find().sort('-createdAt').limit(10).select('name origin reviewStatus createdAt sourceUrl').lean();
        console.table(newest.map(s => ({
            name: s.name.substring(0, 30),
            origin: s.origin || 'unknown',
            reviewStatus: s.reviewStatus || 'unknown',
            createdAt: s.createdAt,
            sourceUrl: (s.sourceUrl || '').substring(0, 30)
        })));

        console.log('\n--- FUNNEL DIAGNOSIS ---');
        // Based on the data, if all schemes are starter schemes, the funnel loses everything at the extraction/saving phase.
        console.log('Most losses likely occur at: "Candidates saved as pending", because the extraction pipeline is currently only verifying existing schemes, not saving new ones discovered on pages.');
        
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}

run();
