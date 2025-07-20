#!/usr/bin/env node

/**
 * Test script for Lucid L2™ Browser Extension
 * This script tests the extension's API integration
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test configuration
const API_URL = 'http://localhost:3001';
const TEST_TIMEOUT = 10000;

class ExtensionTester {
    constructor() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
    }

    async runTests() {
        console.log('🚀 Testing Lucid L2™ Browser Extension Integration\n');

        // Test API server availability
        await this.testApiServer();
        
        // Test extension files
        await this.testExtensionFiles();
        
        // Test API endpoints
        await this.testApiEndpoints();
        
        // Test extension manifest
        await this.testManifest();
        
        // Print results
        this.printResults();
    }

    async testApiServer() {
        console.log('📡 Testing API Server...');
        
        try {
            const result = await this.makeRequest('/system/status');
            if (result.statusCode === 200) {
                this.pass('API server is running');
            } else {
                this.fail('API server returned status: ' + result.statusCode);
            }
        } catch (error) {
            this.fail('API server not accessible: ' + error.message);
        }
    }

    async testExtensionFiles() {
        console.log('📁 Testing Extension Files...');
        
        const requiredFiles = [
            'browser-extension/manifest.json',
            'browser-extension/popup.html',
            'browser-extension/popup.js',
            'browser-extension/styles.css',
            'browser-extension/background.js',
            'browser-extension/content.js',
            'browser-extension/injected.js'
        ];

        for (const file of requiredFiles) {
            if (fs.existsSync(file)) {
                this.pass(`File exists: ${file}`);
            } else {
                this.fail(`Missing file: ${file}`);
            }
        }

        // Test icons directory
        const iconsDir = 'browser-extension/icons';
        if (fs.existsSync(iconsDir)) {
            const icons = fs.readdirSync(iconsDir);
            const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
            
            for (const icon of requiredIcons) {
                if (icons.includes(icon)) {
                    this.pass(`Icon exists: ${icon}`);
                } else {
                    this.fail(`Missing icon: ${icon}`);
                }
            }
        } else {
            this.fail('Icons directory not found');
        }
    }

    async testApiEndpoints() {
        console.log('🔌 Testing API Endpoints...');
        
        // Test /run endpoint
        try {
            const testData = {
                text: 'Test thought for processing',
                wallet: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa'
            };
            
            const result = await this.makeRequest('/run', 'POST', testData);
            if (result.statusCode === 200) {
                this.pass('API /run endpoint is working');
            } else {
                this.fail('API /run endpoint returned status: ' + result.statusCode);
            }
        } catch (error) {
            this.fail('API /run endpoint error: ' + error.message);
        }

        // Test /batch endpoint
        try {
            const batchData = {
                texts: ['Test thought 1', 'Test thought 2'],
                wallet: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa'
            };
            
            const result = await this.makeRequest('/batch', 'POST', batchData);
            if (result.statusCode === 200) {
                this.pass('API /batch endpoint is working');
            } else {
                this.fail('API /batch endpoint returned status: ' + result.statusCode);
            }
        } catch (error) {
            this.fail('API /batch endpoint error: ' + error.message);
        }
    }

    async testManifest() {
        console.log('📋 Testing Extension Manifest...');
        
        try {
            const manifestPath = 'browser-extension/manifest.json';
            const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            // Check required fields
            const requiredFields = ['manifest_version', 'name', 'version', 'description'];
            for (const field of requiredFields) {
                if (manifestData[field]) {
                    this.pass(`Manifest has ${field}: ${manifestData[field]}`);
                } else {
                    this.fail(`Manifest missing ${field}`);
                }
            }
            
            // Check permissions
            if (manifestData.permissions && manifestData.permissions.length > 0) {
                this.pass('Manifest has permissions defined');
            } else {
                this.fail('Manifest missing permissions');
            }
            
            // Check action
            if (manifestData.action) {
                this.pass('Manifest has action defined');
            } else {
                this.fail('Manifest missing action');
            }
            
        } catch (error) {
            this.fail('Manifest test error: ' + error.message);
        }
    }

    makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(API_URL + path);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Lucid-L2-Extension-Test'
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(TEST_TIMEOUT, () => {
                req.abort();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    pass(message) {
        this.results.push({ status: 'PASS', message });
        this.passed++;
        console.log(`  ✅ ${message}`);
    }

    fail(message) {
        this.results.push({ status: 'FAIL', message });
        this.failed++;
        console.log(`  ❌ ${message}`);
    }

    printResults() {
        console.log('\n' + '='.repeat(50));
        console.log('TEST RESULTS');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.length}`);
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);
        console.log(`Success Rate: ${((this.passed / this.results.length) * 100).toFixed(1)}%`);
        
        if (this.failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.results.filter(r => r.status === 'FAIL').forEach(r => {
                console.log(`  - ${r.message}`);
            });
        }
        
        console.log('\n🎯 EXTENSION SETUP GUIDE:');
        console.log('  1. Open Chrome and go to chrome://extensions/');
        console.log('  2. Enable "Developer mode"');
        console.log('  3. Click "Load unpacked"');
        console.log('  4. Select the browser-extension folder');
        console.log('  5. Start the API server: cd offchain && npm start');
        console.log('  6. Test the extension on any webpage');
        
        process.exit(this.failed > 0 ? 1 : 0);
    }
}

// Run tests
const tester = new ExtensionTester();
tester.runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
