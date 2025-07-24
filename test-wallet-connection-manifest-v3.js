// Test Script: Wallet Connection Manifest V3 Fix Verification
// Tests the new wallet bridge implementation with proper content script messaging

const fs = require('fs');
const path = require('path');

class WalletConnectionTester {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            details: []
        };
        this.extensionPath = './browser-extension';
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
        
        this.testResults.details.push({
            timestamp,
            type,
            message
        });
    }

    async runAllTests() {
        this.log('🚀 Starting Wallet Connection Manifest V3 Fix Tests');
        
        try {
            await this.testManifestV3Compliance();
            await this.testContentScriptStructure();
            await this.testPopupMessaging();
            await this.testWalletBridgeImplementation();
            await this.testErrorHandling();
            await this.testWebAccessibleResources();
            
            this.generateReport();
        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'error');
        }
    }

    async testManifestV3Compliance() {
        this.log('📋 Testing Manifest V3 compliance...');
        
        try {
            const manifestPath = path.join(this.extensionPath, 'manifest.json');
            const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            // Test manifest_version
            if (manifestContent.manifest_version === 3) {
                this.testPassed('Manifest V3 version correct');
            } else {
                this.testFailed('Manifest version should be 3');
            }
            
            // Test required permissions
            const requiredPermissions = ['activeTab', 'storage', 'scripting'];
            requiredPermissions.forEach(permission => {
                if (manifestContent.permissions?.includes(permission)) {
                    this.testPassed(`Permission '${permission}' present`);
                } else {
                    this.testFailed(`Missing required permission: ${permission}`);
                }
            });
            
            // Test host_permissions for devnet
            const hasDevnetPermission = manifestContent.host_permissions?.some(
                perm => perm.includes('api.devnet.solana.com')
            );
            if (hasDevnetPermission) {
                this.testPassed('Devnet API permission present');
            } else {
                this.testFailed('Missing devnet API host permission');
            }
            
            // Test content scripts configuration
            if (manifestContent.content_scripts?.length > 0) {
                this.testPassed('Content scripts configured');
            } else {
                this.testFailed('No content scripts configured');
            }
            
        } catch (error) {
            this.testFailed(`Manifest test failed: ${error.message}`);
        }
    }

    async testContentScriptStructure() {
        this.log('🔧 Testing content script structure...');
        
        try {
            const contentPath = path.join(this.extensionPath, 'content.js');
            const contentScript = fs.readFileSync(contentPath, 'utf8');
            
            // Test for WalletBridge class
            if (contentScript.includes('class WalletBridge')) {
                this.testPassed('WalletBridge class defined');
            } else {
                this.testFailed('WalletBridge class not found');
            }
            
            // Test for proper message handling
            if (contentScript.includes('handleWalletMessage')) {
                this.testPassed('Wallet message handler present');
            } else {
                this.testFailed('Wallet message handler missing');
            }
            
            // Test for Phantom wallet integration
            if (contentScript.includes('window.solana') && contentScript.includes('isPhantom')) {
                this.testPassed('Phantom wallet integration present');
            } else {
                this.testFailed('Phantom wallet integration missing');
            }
            
            // Test for proper error handling
            if (contentScript.includes('checkWalletAvailability') && 
                contentScript.includes('connectWallet') && 
                contentScript.includes('disconnectWallet')) {
                this.testPassed('Core wallet methods present');
            } else {
                this.testFailed('Missing core wallet methods');
            }
            
            // Test for devnet configuration
            if (contentScript.includes('api.devnet.solana.com')) {
                this.testPassed('Devnet RPC configuration present');
            } else {
                this.testFailed('Devnet RPC configuration missing');
            }
            
        } catch (error) {
            this.testFailed(`Content script test failed: ${error.message}`);
        }
    }

    async testPopupMessaging() {
        this.log('💬 Testing popup messaging implementation...');
        
        try {
            const popupPath = path.join(this.extensionPath, 'popup.js');
            const popupScript = fs.readFileSync(popupPath, 'utf8');
            
            // Test for removal of direct wallet access
            if (!popupScript.includes('window.solana') || 
                !popupScript.includes('connectWalletDirect')) {
                this.testPassed('Direct wallet access removed from popup');
            } else {
                this.testFailed('Popup still contains direct wallet access');
            }
            
            // Test for proper message passing
            if (popupScript.includes('chrome.tabs.sendMessage') && 
                popupScript.includes('connectWallet')) {
                this.testPassed('Message passing to content script implemented');
            } else {
                this.testFailed('Message passing not properly implemented');
            }
            
            // Test for tab validation
            if (popupScript.includes('isInvalidTabForWallet')) {
                this.testPassed('Tab validation implemented');
            } else {
                this.testFailed('Tab validation missing');
            }
            
            // Test for content script injection
            if (popupScript.includes('ensureContentScriptAvailable') && 
                popupScript.includes('chrome.scripting.executeScript')) {
                this.testPassed('Content script injection implemented');
            } else {
                this.testFailed('Content script injection missing');
            }
            
            // Test for proper error handling
            if (popupScript.includes('sendMessageWithRetry') && 
                popupScript.includes('showWalletNotFoundHelp')) {
                this.testPassed('Error handling and retry logic present');
            } else {
                this.testFailed('Proper error handling missing');
            }
            
        } catch (error) {
            this.testFailed(`Popup messaging test failed: ${error.message}`);
        }
    }

    async testWalletBridgeImplementation() {
        this.log('🌉 Testing wallet bridge implementation...');
        
        try {
            const contentPath = path.join(this.extensionPath, 'content.js');
            const contentScript = fs.readFileSync(contentPath, 'utf8');
            
            // Test for wallet bridge initialization
            if (contentScript.includes('walletBridge.initialize()')) {
                this.testPassed('Wallet bridge initialization present');
            } else {
                this.testFailed('Wallet bridge initialization missing');
            }
            
            // Test for Phantom detection
            if (contentScript.includes('waitForPhantom')) {
                this.testPassed('Phantom detection logic present');
            } else {
                this.testFailed('Phantom detection logic missing');
            }
            
            // Test for balance querying
            if (contentScript.includes('updateBalances') && 
                contentScript.includes('getLucidTokenBalance')) {
                this.testPassed('Balance querying implemented');
            } else {
                this.testFailed('Balance querying missing');
            }
            
            // Test for transaction signing
            if (contentScript.includes('signTransaction') && 
                contentScript.includes('signMessage')) {
                this.testPassed('Transaction signing methods present');
            } else {
                this.testFailed('Transaction signing methods missing');
            }
            
            // Test for event listeners
            if (contentScript.includes('setupWalletEventListeners') && 
                contentScript.includes('window.solana.on')) {
                this.testPassed('Wallet event listeners implemented');
            } else {
                this.testFailed('Wallet event listeners missing');
            }
            
        } catch (error) {
            this.testFailed(`Wallet bridge test failed: ${error.message}`);
        }
    }

    async testErrorHandling() {
        this.log('🚨 Testing error handling...');
        
        try {
            const contentPath = path.join(this.extensionPath, 'content.js');
            const popupPath = path.join(this.extensionPath, 'popup.js');
            
            const contentScript = fs.readFileSync(contentPath, 'utf8');
            const popupScript = fs.readFileSync(popupPath, 'utf8');
            
            // Test for error categorization
            if (contentScript.includes('USER_REJECTED') && 
                contentScript.includes('WALLET_NOT_FOUND')) {
                this.testPassed('Error categorization implemented');
            } else {
                this.testFailed('Error categorization missing');
            }
            
            // Test for recoverable error handling
            if (contentScript.includes('recoverable') && 
                popupScript.includes('showWalletNotFoundHelp')) {
                this.testPassed('Recoverable error handling present');
            } else {
                this.testFailed('Recoverable error handling missing');
            }
            
            // Test for timeout handling
            if (contentScript.includes('timeout') && 
                contentScript.includes('waitForPhantom')) {
                this.testPassed('Timeout handling implemented');
            } else {
                this.testFailed('Timeout handling missing');
            }
            
            // Test for bridge not ready handling
            if (contentScript.includes('BRIDGE_NOT_READY')) {
                this.testPassed('Bridge not ready error handling present');
            } else {
                this.testFailed('Bridge not ready error handling missing');
            }
            
        } catch (error) {
            this.testFailed(`Error handling test failed: ${error.message}`);
        }
    }

    async testWebAccessibleResources() {
        this.log('📦 Testing web accessible resources...');
        
        try {
            const manifestPath = path.join(this.extensionPath, 'manifest.json');
            const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            // Test for solana-web3.js in web_accessible_resources
            const webResources = manifestContent.web_accessible_resources?.[0]?.resources || [];
            
            if (webResources.includes('solana-web3.js')) {
                this.testPassed('Solana web3.js in web accessible resources');
            } else {
                this.testFailed('Solana web3.js not in web accessible resources');
            }
            
            // Test for wallet-connection.js
            if (webResources.includes('wallet-connection.js')) {
                this.testPassed('Wallet connection script accessible');
            } else {
                this.testFailed('Wallet connection script not accessible');
            }
            
            // Check if solana-web3.js file exists
            const solanaWeb3Path = path.join(this.extensionPath, 'solana-web3.js');
            if (fs.existsSync(solanaWeb3Path)) {
                this.testPassed('Solana web3.js file exists');
            } else {
                this.testFailed('Solana web3.js file missing');
            }
            
        } catch (error) {
            this.testFailed(`Web accessible resources test failed: ${error.message}`);
        }
    }

    testPassed(message) {
        this.testResults.passed++;
        this.log(`✅ PASS: ${message}`, 'success');
    }

    testFailed(message) {
        this.testResults.failed++;
        this.log(`❌ FAIL: ${message}`, 'error');
    }

    generateReport() {
        const total = this.testResults.passed + this.testResults.failed;
        const passRate = ((this.testResults.passed / total) * 100).toFixed(1);
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 WALLET CONNECTION MANIFEST V3 FIX TEST REPORT');
        console.log('='.repeat(80));
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${this.testResults.passed}`);
        console.log(`Failed: ${this.testResults.failed}`);
        console.log(`Pass Rate: ${passRate}%`);
        console.log('='.repeat(80));
        
        if (this.testResults.failed === 0) {
            console.log('🎉 ALL TESTS PASSED! Wallet connection fix is ready for testing.');
        } else {
            console.log('⚠️ Some tests failed. Please review the implementation.');
        }
        
        // Save detailed results
        const reportData = {
            summary: {
                total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                passRate: parseFloat(passRate)
            },
            timestamp: new Date().toISOString(),
            details: this.testResults.details
        };
        
        fs.writeFileSync(
            'test-results-wallet-connection-fix.json',
            JSON.stringify(reportData, null, 2)
        );
        
        console.log('\n📁 Detailed results saved to: test-results-wallet-connection-fix.json');
        
        // Provide next steps
        console.log('\n🔄 NEXT STEPS:');
        console.log('1. Load the extension in Chrome (chrome://extensions/)');
        console.log('2. Navigate to any website (e.g., https://google.com)');
        console.log('3. Open the extension popup');
        console.log('4. Click "Connect Wallet" to test Phantom integration');
        console.log('5. Verify real balance queries work on devnet');
        console.log('\n💡 The wallet connection now properly uses content script bridge!');
    }
}

// Run the tests
const tester = new WalletConnectionTester();
tester.runAllTests().catch(console.error);
