// Real Browser Test for Wallet Connection - Debug Script
// Run this in Chrome DevTools console to test the actual extension behavior

console.log('🧪 Starting real browser wallet connection test...');

// Test 1: Check if content script is loaded
function testContentScriptLoaded() {
    console.log('📋 Test 1: Checking content script...');
    
    if (typeof window.lucidContentScript !== 'undefined') {
        console.log('✅ Content script loaded and accessible');
        return true;
    } else {
        console.log('❌ Content script not loaded or not accessible');
        return false;
    }
}

// Test 2: Check if Phantom is available
function testPhantomAvailable() {
    console.log('📋 Test 2: Checking Phantom wallet...');
    
    if (typeof window.solana !== 'undefined' && window.solana.isPhantom) {
        console.log('✅ Phantom wallet detected');
        console.log('  - isPhantom:', window.solana.isPhantom);
        console.log('  - isConnected:', window.solana.isConnected);
        console.log('  - publicKey:', window.solana.publicKey?.toString() || 'Not connected');
        return true;
    } else {
        console.log('❌ Phantom wallet not detected');
        console.log('  - window.solana exists:', typeof window.solana !== 'undefined');
        if (typeof window.solana !== 'undefined') {
            console.log('  - isPhantom:', window.solana.isPhantom);
        }
        return false;
    }
}

// Test 3: Test wallet bridge functionality
async function testWalletBridge() {
    console.log('📋 Test 3: Testing wallet bridge...');
    
    try {
        if (typeof window.lucidContentScript === 'undefined') {
            console.log('❌ Content script not available');
            return false;
        }
        
        const walletBridge = window.lucidContentScript.walletBridge;
        if (!walletBridge) {
            console.log('❌ Wallet bridge not available');
            return false;
        }
        
        console.log('✅ Wallet bridge accessible');
        console.log('  - isPhantomAvailable:', walletBridge.isPhantomAvailable);
        console.log('  - isConnected:', walletBridge.isConnected);
        console.log('  - wallet:', walletBridge.wallet);
        
        return true;
        
    } catch (error) {
        console.log('❌ Wallet bridge test failed:', error);
        return false;
    }
}

// Test 4: Test direct Phantom connection
async function testDirectPhantomConnection() {
    console.log('📋 Test 4: Testing direct Phantom connection...');
    
    try {
        if (typeof window.solana === 'undefined' || !window.solana.isPhantom) {
            console.log('❌ Phantom not available for direct test');
            return false;
        }
        
        console.log('🔗 Attempting direct Phantom connection...');
        const response = await window.solana.connect();
        console.log('✅ Direct Phantom connection successful');
        console.log('  - publicKey:', response.publicKey.toString());
        
        return response;
        
    } catch (error) {
        console.log('❌ Direct Phantom connection failed:', error.message);
        return false;
    }
}

// Test 5: Test message passing simulation
async function testMessagePassing() {
    console.log('📋 Test 5: Testing message passing simulation...');
    
    try {
        if (typeof window.lucidContentScript === 'undefined') {
            console.log('❌ Content script not available');
            return false;
        }
        
        // Simulate a wallet check message
        const result = await new Promise((resolve) => {
            window.lucidContentScript.handleWalletMessage(
                { action: 'checkWallet' },
                resolve
            );
        });
        
        console.log('✅ Message passing test successful');
        console.log('  - result:', result);
        
        return result;
        
    } catch (error) {
        console.log('❌ Message passing test failed:', error);
        return false;
    }
}

// Test 6: Check extension permissions
function testExtensionPermissions() {
    console.log('📋 Test 6: Checking extension context...');
    
    console.log('  - URL:', window.location.href);
    console.log('  - Protocol:', window.location.protocol);
    console.log('  - Host:', window.location.host);
    
    const invalidPrefixes = [
        'chrome://', 'chrome-extension://', 'moz-extension://',
        'edge://', 'about:', 'file://'
    ];
    
    const isInvalidTab = invalidPrefixes.some(prefix => 
        window.location.href.startsWith(prefix)
    );
    
    if (isInvalidTab) {
        console.log('❌ Current page is not compatible with wallet operations');
        console.log('  - Navigate to a regular website (http/https) to test wallet connection');
        return false;
    } else {
        console.log('✅ Current page is compatible with wallet operations');
        return true;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Running all wallet connection tests...\n');
    
    const results = {
        contentScript: testContentScriptLoaded(),
        phantom: testPhantomAvailable(),
        permissions: testExtensionPermissions()
    };
    
    if (results.contentScript) {
        results.walletBridge = await testWalletBridge();
        results.messagePassing = await testMessagePassing();
    }
    
    if (results.phantom && results.permissions) {
        results.directConnection = await testDirectPhantomConnection();
    }
    
    console.log('\n📊 TEST RESULTS SUMMARY:');
    console.log('='.repeat(50));
    Object.entries(results).forEach(([test, result]) => {
        const status = result ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${test}`);
    });
    console.log('='.repeat(50));
    
    // Provide recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (!results.phantom) {
        console.log('1. Install Phantom wallet extension');
        console.log('2. Create or import a wallet');
        console.log('3. Refresh the page');
    }
    
    if (!results.permissions) {
        console.log('1. Navigate to a regular website (e.g., https://google.com)');
        console.log('2. Avoid chrome://, file://, or extension pages');
    }
    
    if (!results.contentScript) {
        console.log('1. Reload the extension in chrome://extensions/');
        console.log('2. Refresh the current page');
        console.log('3. Check browser console for errors');
    }
    
    if (results.phantom && results.permissions && !results.directConnection) {
        console.log('1. Check if Phantom wallet is unlocked');
        console.log('2. Try approving the connection request');
        console.log('3. Check Phantom extension for errors');
    }
    
    return results;
}

// Auto-run tests after a short delay
setTimeout(() => {
    runAllTests().catch(console.error);
}, 1000);

// Export test functions for manual use
window.walletConnectionTests = {
    runAllTests,
    testContentScriptLoaded,
    testPhantomAvailable,
    testWalletBridge,
    testDirectPhantomConnection,
    testMessagePassing,
    testExtensionPermissions
};

console.log('📝 Test functions available at: window.walletConnectionTests');
console.log('   Example: window.walletConnectionTests.testPhantomAvailable()');
