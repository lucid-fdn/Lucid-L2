// test-hf-sync.js - Test HuggingFace Passport Sync
const axios = require('axios');

const API_URL = 'http://localhost:3001/api';
const HF_TOKEN = process.env.HF_TOKEN || '';

async function testSyncSmallBatch() {
    console.log('\n🧪 Test 1: Sync Small Batch (10 models)');
    console.log('==========================================\n');

    try {
        const response = await axios.post(`${API_URL}/passports/sync-all-hf`, {
            types: ['models'],
            batchSize: 10,
            concurrency: 3,
            checkpointInterval: 5,
            hfToken: HF_TOKEN
        });

        console.log('✅ Sync started:', response.data);

        // Wait and check progress
        await new Promise(resolve => setTimeout(resolve, 2000));

        const progress = await axios.get(`${API_URL}/passports/sync-progress`);
        console.log('\n📊 Progress:', progress.data);

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testSyncStatus() {
    console.log('\n🧪 Test 2: Check Sync Status');
    console.log('==============================\n');

    try {
        const response = await axios.get(`${API_URL}/passports/sync-status`);
        console.log('Status:', response.data);
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testSyncProgress() {
    console.log('\n🧪 Test 3: Monitor Progress');
    console.log('============================\n');

    try {
        for (let i = 0; i < 5; i++) {
            const response = await axios.get(`${API_URL}/passports/sync-progress`);
            const progress = response.data.progress;

            console.log(`\n[Update ${i + 1}]`);
            console.log(`Models: ${progress.models.synced}/${progress.models.total} (${progress.models.progress})`);
            console.log(`Throughput: ${progress.throughput} assets/min`);

            if (progress.eta) {
                console.log(`ETA: ${new Date(progress.eta).toLocaleString()}`);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testSyncReport() {
    console.log('\n🧪 Test 4: Generate Report');
    console.log('===========================\n');

    try {
        const response = await axios.get(`${API_URL}/passports/sync-report`);
        console.log('Report:', JSON.stringify(response.data.report, null, 2));
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testSyncStop() {
    console.log('\n🧪 Test 5: Stop Sync');
    console.log('=====================\n');

    try {
        const response = await axios.post(`${API_URL}/passports/sync-stop`);
        console.log('✅ Stop requested:', response.data);
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testSyncResume() {
    console.log('\n🧪 Test 6: Resume Sync');
    console.log('=======================\n');

    try {
        const response = await axios.post(`${API_URL}/passports/sync-resume`, {
            batchSize: 50,
            concurrency: 5
        });
        console.log('✅ Resume requested:', response.data);
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

async function testFullWorkflow() {
    console.log('\n🚀 Running Full Test Workflow');
    console.log('================================\n');

    // Test 1: Start small batch
    await testSyncSmallBatch();

    // Wait for sync to process
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Test 2: Check status
    await testSyncStatus();

    // Test 3: Monitor progress
    await testSyncProgress();

    // Test 4: Generate report
    await testSyncReport();

    console.log('\n✅ All tests completed!');
}

// Parse command line arguments
const args = process.argv.slice(2);
const testName = args[0];

async function main() {
    console.log('🔍 HuggingFace Passport Sync Test Suite');
    console.log('========================================\n');
    console.log(`API URL: ${API_URL}\n`);

    try {
        switch (testName) {
            case 'batch':
                await testSyncSmallBatch();
                break;
            case 'status':
                await testSyncStatus();
                break;
            case 'progress':
                await testSyncProgress();
                break;
            case 'report':
                await testSyncReport();
                break;
            case 'stop':
                await testSyncStop();
                break;
            case 'resume':
                await testSyncResume();
                break;
            case 'full':
            default:
                await testFullWorkflow();
                break;
        }
    } catch (error) {
        console.error('\n❌ Test suite failed:', error);
        process.exit(1);
    }
}

main();
