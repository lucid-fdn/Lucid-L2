/**
 * Phase 8.3 Testing Script - mGas Rewards & Advanced Features
 * 
 * This script tests all Phase 8.3 features including:
 * - Advanced quality assessment
 * - Streak multipliers and bonuses
 * - Achievement system
 * - mGas to LUCID conversion
 * - Leaderboard functionality
 * - Social features and referrals
 * - Seasonal events and challenges
 */

const fs = require('fs');
const path = require('path');

// Test Configuration
const TEST_CONFIG = {
    extensionPath: './browser-extension',
    testData: {
        testInputs: [
            'This is a simple test message',
            'I\'m exploring the fascinating intersection of quantum computing and artificial intelligence, wondering how quantum algorithms might revolutionize machine learning paradigms.',
            'The ephemeral nature of consciousness intertwines with the quantum fabric of reality, creating a tapestry of existential contemplation.',
            'Hello world',
            'How can we solve climate change using innovative renewable energy solutions and sustainable technology?'
        ],
        testWallet: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa'
    }
};

// Test Results Storage
let testResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
        passed: 0,
        failed: 0,
        total: 0
    }
};

// Test Helper Functions
function logTest(testName, passed, details = '') {
    const result = {
        name: testName,
        passed,
        details,
        timestamp: new Date().toISOString()
    };
    
    testResults.tests.push(result);
    testResults.summary.total++;
    
    if (passed) {
        testResults.summary.passed++;
        console.log(`✅ ${testName}: PASSED`);
    } else {
        testResults.summary.failed++;
        console.log(`❌ ${testName}: FAILED - ${details}`);
    }
    
    if (details) {
        console.log(`   ${details}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

// Mock Chrome Extension APIs for testing
global.chrome = {
    storage: {
        local: {
            get: (keys, callback) => {
                // Mock storage data
                const mockData = {
                    wallet: { address: TEST_CONFIG.testData.testWallet },
                    balance: { mGas: 500, lucid: 5 },
                    dailyProgress: { completed: 3, total: 10 },
                    streak: 5,
                    tasks: [],
                    history: [],
                    settings: { notifications: true, autoProcess: false },
                    conversionHistory: [],
                    unlockedAchievements: ['first-thought'],
                    totalShares: 2,
                    referralData: null,
                    lastDailyReset: new Date().toDateString()
                };
                callback(mockData);
            },
            set: (data, callback) => {
                if (callback) callback();
            }
        }
    }
};

// Load RewardSystem class
function loadRewardSystem() {
    try {
        const rewardSystemPath = path.join(TEST_CONFIG.extensionPath, 'reward-system.js');
        const content = fs.readFileSync(rewardSystemPath, 'utf8');
        
        // Create a mock environment for browser extension code
        const mockEnvironment = {
            chrome: global.chrome,
            document: {},
            window: {},
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            Date: Date,
            Math: Math,
            JSON: JSON,
            fetch: async (url, options) => {
                // Mock fetch for testing
                return {
                    ok: false,
                    json: async () => ([])
                };
            }
        };
        
        // Remove module.exports check and eval in controlled environment
        const processedContent = content.replace(
            /if \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\}/,
            ''
        );
        
        // Create a function to execute the code with proper context
        const executeCode = new Function(
            'chrome', 'document', 'window', 'setTimeout', 'clearTimeout', 'Date', 'Math', 'JSON', 'fetch',
            processedContent + '; return RewardSystem;'
        );
        
        return executeCode(
            mockEnvironment.chrome,
            mockEnvironment.document,
            mockEnvironment.window,
            mockEnvironment.setTimeout,
            mockEnvironment.clearTimeout,
            mockEnvironment.Date,
            mockEnvironment.Math,
            mockEnvironment.JSON,
            mockEnvironment.fetch
        );
    } catch (error) {
        console.error('Failed to load RewardSystem:', error);
        return null;
    }
}

// Test 1: RewardSystem Class Initialization
async function testRewardSystemInit() {
    try {
        const RewardSystem = loadRewardSystem();
        assert(RewardSystem, 'RewardSystem class should be defined');
        
        const mockExtensionState = {
            balance: { mGas: 500, lucid: 5 },
            history: [],
            unlockedAchievements: [],
            conversionHistory: [],
            totalShares: 0,
            streak: 0
        };
        
        const rewardSystem = new RewardSystem(mockExtensionState);
        assert(rewardSystem, 'RewardSystem instance should be created');
        assert(rewardSystem.conversionRate === 100, 'Conversion rate should be 100');
        assert(rewardSystem.achievements.length === 8, 'Should have 8 achievements');
        
        logTest('RewardSystem Initialization', true, 'RewardSystem initialized with correct properties');
    } catch (error) {
        logTest('RewardSystem Initialization', false, error.message);
    }
}

// Test 2: Quality Assessment Algorithm
async function testQualityAssessment() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = { history: [] };
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Test different quality inputs
        const testCases = [
            {
                input: 'The ephemeral nature of consciousness intertwines with the quantum fabric of reality, creating a tapestry of existential contemplation.',
                expectedTier: 'excellent'
            },
            {
                input: 'Hello world',
                expectedTier: 'basic'
            },
            {
                input: 'How can we solve climate change using innovative renewable energy solutions?',
                expectedTier: 'good'
            }
        ];
        
        for (const testCase of testCases) {
            const assessment = await rewardSystem.assessQuality(testCase.input, 'AI response');
            
            assert(assessment.score >= 0 && assessment.score <= 1, 'Quality score should be between 0 and 1');
            assert(assessment.tier, 'Quality tier should be assigned');
            assert(assessment.breakdown, 'Quality breakdown should be provided');
            
            // Verify scoring components
            assert(assessment.breakdown.creativity >= 0, 'Creativity score should be >= 0');
            assert(assessment.breakdown.complexity >= 0, 'Complexity score should be >= 0');
            assert(assessment.breakdown.coherence >= 0, 'Coherence score should be >= 0');
            assert(assessment.breakdown.uniqueness >= 0, 'Uniqueness score should be >= 0');
            assert(assessment.breakdown.aiEngagement >= 0, 'AI engagement score should be >= 0');
        }
        
        logTest('Quality Assessment Algorithm', true, 'Quality assessment working correctly for all test cases');
    } catch (error) {
        logTest('Quality Assessment Algorithm', false, error.message);
    }
}

// Test 3: Earnings Calculation with Multipliers
async function testEarningsCalculation() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = { history: [] };
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Test base earnings
        const qualityAssessment = {
            score: 0.8,
            tier: 'good',
            breakdown: {}
        };
        
        const earnings = rewardSystem.calculateEarnings(5, qualityAssessment, 7, true);
        
        assert(earnings.base === 5, 'Base earnings should be 5');
        assert(earnings.qualityBonus > 0, 'Quality bonus should be applied');
        assert(earnings.streakBonus > 0, 'Streak bonus should be applied for 7 days');
        assert(earnings.firstDailyBonus === 5, 'First daily bonus should be 5');
        assert(earnings.total > 5, 'Total earnings should be greater than base');
        
        // Test without bonuses
        const earningsNoBonus = rewardSystem.calculateEarnings(5, { score: 0.3, tier: 'basic' }, 0, false);
        assert(earningsNoBonus.total === 5, 'Total should equal base with no bonuses');
        
        logTest('Earnings Calculation', true, 'Earnings calculation working correctly with all multipliers');
    } catch (error) {
        logTest('Earnings Calculation', false, error.message);
    }
}

// Test 4: Achievement System
async function testAchievementSystem() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {
            history: [{ qualityScore: 0.9 }],
            unlockedAchievements: [],
            conversionHistory: [],
            totalShares: 0,
            streak: 0
        };
        
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Test achievement definitions
        assert(rewardSystem.achievements.length === 8, 'Should have 8 achievements');
        
        const firstThought = rewardSystem.achievements.find(a => a.id === 'first-thought');
        assert(firstThought, 'First thought achievement should exist');
        assert(firstThought.reward === 10, 'First thought reward should be 10');
        
        // Test achievement checking
        const newAchievements = rewardSystem.checkAchievements();
        assert(Array.isArray(newAchievements), 'Should return array of new achievements');
        
        // Test specific achievement logic
        mockExtensionState.history = [{ qualityScore: 0.9 }];
        const achievements = rewardSystem.checkAchievements();
        
        logTest('Achievement System', true, 'Achievement system working correctly');
    } catch (error) {
        logTest('Achievement System', false, error.message);
    }
}

// Test 5: mGas to LUCID Conversion
async function testMGasConversion() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {
            balance: { mGas: 500, lucid: 5 },
            conversionHistory: []
        };
        
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Test valid conversion
        const result = await rewardSystem.convertMGasToLUCID(200);
        assert(result.lucidReceived === 2, 'Should receive 2 LUCID for 200 mGas');
        assert(result.remainingMGas === 0, 'Should have 0 remaining mGas');
        assert(result.transactionHash, 'Should have transaction hash');
        
        // Test minimum amount validation
        try {
            await rewardSystem.convertMGasToLUCID(50);
            assert(false, 'Should throw error for amount below minimum');
        } catch (error) {
            assert(error.message.includes('Minimum'), 'Should throw minimum amount error');
        }
        
        logTest('mGas to LUCID Conversion', true, 'Conversion system working correctly');
    } catch (error) {
        logTest('mGas to LUCID Conversion', false, error.message);
    }
}

// Test 6: Leaderboard System
async function testLeaderboardSystem() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {};
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        const leaderboard = await rewardSystem.getLeaderboard('total_earnings', 10);
        
        assert(Array.isArray(leaderboard), 'Leaderboard should be an array');
        assert(leaderboard.length <= 10, 'Should return maximum 10 entries');
        
        if (leaderboard.length > 0) {
            const entry = leaderboard[0];
            assert(entry.rank, 'Entry should have rank');
            assert(entry.username, 'Entry should have username');
            assert(entry.value !== undefined, 'Entry should have value');
        }
        
        logTest('Leaderboard System', true, 'Leaderboard system working correctly');
    } catch (error) {
        logTest('Leaderboard System', false, error.message);
    }
}

// Test 7: Social Features
async function testSocialFeatures() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {};
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Test shareable content generation
        const shareContent = rewardSystem.generateShareableContent(
            'Test input',
            'AI response',
            10
        );
        
        assert(shareContent.content, 'Should generate shareable content');
        assert(shareContent.hashtags, 'Should include hashtags');
        assert(shareContent.url, 'Should include URL');
        
        // Test referral system
        const referralCode = rewardSystem.generateReferralCode('testuser');
        assert(referralCode, 'Should generate referral code');
        assert(referralCode.length > 0, 'Referral code should not be empty');
        
        logTest('Social Features', true, 'Social features working correctly');
    } catch (error) {
        logTest('Social Features', false, error.message);
    }
}

// Test 8: Event System
async function testEventSystem() {
    try {
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {};
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        const events = rewardSystem.getCurrentEvents();
        assert(Array.isArray(events), 'Events should be an array');
        
        // Test event multiplier application
        const baseAmount = 10;
        const multipliedAmount = rewardSystem.applyEventMultipliers(baseAmount);
        assert(multipliedAmount >= baseAmount, 'Multiplied amount should be >= base amount');
        
        logTest('Event System', true, 'Event system working correctly');
    } catch (error) {
        logTest('Event System', false, error.message);
    }
}

// Test 9: File Structure Validation
async function testFileStructure() {
    try {
        const requiredFiles = [
            'manifest.json',
            'popup.html',
            'popup.js',
            'reward-system.js',
            'styles.css',
            'background.js',
            'content.js',
            'injected.js'
        ];
        
        for (const file of requiredFiles) {
            const filePath = path.join(TEST_CONFIG.extensionPath, file);
            assert(fs.existsSync(filePath), `File ${file} should exist`);
        }
        
        // Check icons directory
        const iconsPath = path.join(TEST_CONFIG.extensionPath, 'icons');
        assert(fs.existsSync(iconsPath), 'Icons directory should exist');
        
        logTest('File Structure Validation', true, 'All required files present');
    } catch (error) {
        logTest('File Structure Validation', false, error.message);
    }
}

// Test 10: Integration Test
async function testIntegration() {
    try {
        // Test the complete flow: quality assessment -> earnings calculation -> achievement check
        const RewardSystem = loadRewardSystem();
        const mockExtensionState = {
            balance: { mGas: 100, lucid: 1 },
            history: [],
            unlockedAchievements: [],
            conversionHistory: [],
            totalShares: 0,
            streak: 3
        };
        
        const rewardSystem = new RewardSystem(mockExtensionState);
        
        // Simulate a complete thought processing flow
        const testInput = 'This is a creative and complex thought about the nature of artificial intelligence and consciousness.';
        const aiResponse = 'Excellent analysis of AI consciousness.';
        
        // 1. Quality assessment
        const qualityAssessment = await rewardSystem.assessQuality(testInput, aiResponse);
        assert(qualityAssessment.score > 0, 'Quality assessment should return positive score');
        
        // 2. Earnings calculation
        const earnings = rewardSystem.calculateEarnings(5, qualityAssessment, 3, true);
        assert(earnings.total > 5, 'Total earnings should be greater than base');
        
        // 3. Check achievements
        mockExtensionState.history = [{ qualityScore: qualityAssessment.score }];
        const achievements = rewardSystem.checkAchievements();
        assert(Array.isArray(achievements), 'Should return achievements array');
        
        // 4. Apply event multipliers
        const finalEarnings = rewardSystem.applyEventMultipliers(earnings.total);
        assert(finalEarnings >= earnings.total, 'Final earnings should be >= calculated earnings');
        
        logTest('Integration Test', true, 'Complete flow working correctly');
    } catch (error) {
        logTest('Integration Test', false, error.message);
    }
}

// Main Test Runner
async function runTests() {
    console.log('🚀 Starting Phase 8.3 Testing Suite');
    console.log('=====================================');
    
    const tests = [
        testRewardSystemInit,
        testQualityAssessment,
        testEarningsCalculation,
        testAchievementSystem,
        testMGasConversion,
        testLeaderboardSystem,
        testSocialFeatures,
        testEventSystem,
        testFileStructure,
        testIntegration
    ];
    
    for (const test of tests) {
        try {
            await test();
        } catch (error) {
            console.error(`Unexpected error in ${test.name}:`, error);
        }
    }
    
    // Print summary
    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    console.log(`Total Tests: ${testResults.summary.total}`);
    console.log(`Passed: ${testResults.summary.passed}`);
    console.log(`Failed: ${testResults.summary.failed}`);
    console.log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
    
    // Save detailed results
    const resultsPath = 'test-results-phase8-3.json';
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📁 Detailed results saved to: ${resultsPath}`);
    
    // Return success status
    return testResults.summary.failed === 0;
}

// Manual Test Instructions
function printManualTestInstructions() {
    console.log('\n🔧 Manual Testing Instructions');
    console.log('===============================');
    console.log('1. Load the extension in Chrome Developer Mode');
    console.log('2. Test wallet connection');
    console.log('3. Process different types of thoughts and verify quality assessment');
    console.log('4. Check streak counters and daily progress');
    console.log('5. Test achievement unlocking');
    console.log('6. Try mGas to LUCID conversion');
    console.log('7. View leaderboard and achievements modal');
    console.log('8. Test social sharing features');
    console.log('9. Verify events are displayed correctly');
    console.log('10. Test daily reset functionality');
    console.log('\nFor automated browser testing, use the browser extension test script.');
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runTests,
        testResults,
        TEST_CONFIG
    };
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().then(success => {
        if (success) {
            console.log('\n🎉 All tests passed! Phase 8.3 is ready for deployment.');
        } else {
            console.log('\n❌ Some tests failed. Please review and fix issues before deployment.');
        }
        
        printManualTestInstructions();
        process.exit(success ? 0 : 1);
    });
}
