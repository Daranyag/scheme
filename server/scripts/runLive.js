require('dotenv').config();
const mongoose = require('mongoose');
const { runLiveCrawler } = require('../services/crawlerService');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tn_schemes');
        console.log('Connected to DB');
        await runLiveCrawler();
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}
run();
