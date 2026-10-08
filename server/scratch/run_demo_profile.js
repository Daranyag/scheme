const mongoose = require('mongoose');
const DiscoveryJob = require('../models/DiscoveryJob');
const Discovery = require('../models/Discovery');
const { runSingleJob } = require('../services/discoveryService');
const { evaluateEligibilityExtended } = require('../services/ruleEngine');
const ApiService = require('../sources.json');

async function runDemo() {
    console.log('--- PROFILE DISCOVERY RUNNER ---');

    const profile = {
        age: 65,
        gender: 'F',
        incomeBand: 'under 1 lakh',
        income: 80000,
        marital: 'widowed',
        disability: 0,
        flags: {
            destitute: true,
            famhead: false,
            govschool: false,
            highered: false,
            has_car: false,
            excess_land: false
        }
    };

    const deviceId = 'demo-user-female-65-widowed-80k';

    console.log('\n1. User Profile Loaded:');
    console.log(JSON.stringify(profile, null, 2));

    const job = new DiscoveryJob({
        deviceId,
        profileSync: profile,
        status: 'pending',
        attempts: 1,
        nextRunAt: new Date()
    });

    console.log('\n2. Discovery Job Started for deviceId:', deviceId);
    await runSingleJob(job);

    console.log('\n3. Execution Logs:');
    job.logs.forEach(l => {
        console.log(`[${l.timestamp.toISOString()}] ${l.message}`);
        if (l.details) {
            console.log('   Details:', JSON.stringify(l.details, null, 2));
        }
    });

    console.log('\n4. Dashboard "Newly Discovered For You" Cards Rendered:');
    
    // Simulate schemes discovered for this profile
    const discoveredSchemes = [
        {
            name: "Destitute Widow Pension",
            benefit: "₹1,200/month for destitute widows.",
            domain: "cra.tn.gov.in",
            sourceUrl: "https://cra.tn.gov.in/eleg_schemes.php",
            confidence: "high",
            eligibilityStatus: "eligible",
            lastChecked: new Date().toISOString().split('T')[0],
            origin: "ai-discovered"
        },
        {
            name: "Old Age Pension (IGNOAPS / TN)",
            benefit: "₹1,200/month for destitute elderly (60+ years).",
            domain: "cra.tn.gov.in",
            sourceUrl: "https://cra.tn.gov.in/eleg_schemes.php",
            confidence: "high",
            eligibilityStatus: "eligible",
            lastChecked: new Date().toISOString().split('T')[0],
            origin: "ai-discovered"
        }
    ];

    discoveredSchemes.forEach((d, idx) => {
        console.log(`\n--- Card #${idx + 1} ---`);
        console.log(`Title: ${d.name}`);
        console.log(`Tag: [${d.eligibilityStatus === 'eligible' ? 'Eligible (Green)' : 'Possibly eligible - verify (Amber)'}]`);
        console.log(`Label: [${d.origin}]`);
        console.log(`Benefit: ${d.benefit}`);
        console.log(`Found on: ${d.domain}`);
        console.log(`Source Link: ${d.sourceUrl}`);
        console.log(`Last checked date: ${d.lastChecked}`);
        console.log(`Action: [Not relevant button]`);
    });

    console.log('\nDashboard Disclaimer Note:');
    console.log('"Collected automatically from official pages and may contain errors. Confirm on the official website or at an e-Sevai centre before applying."');

    console.log('\nProfile Tab Privacy Note:');
    console.log('"Only these anonymous details are sent to find schemes for you."');
}

runDemo().catch(console.error);
