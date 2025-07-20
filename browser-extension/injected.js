// Injected Script for Lucid L2™ Extension
// This script runs in the page context and can interact with the webpage's JavaScript

(function() {
    'use strict';

    // Create namespace for Lucid L2™ extension
    window.LucidL2 = window.LucidL2 || {};

    // Extension API for webpage integration
    window.LucidL2.Extension = {
        version: '1.0.0',
        
        // Process text with Lucid L2™ API
        processText: async function(text) {
            return new Promise((resolve, reject) => {
                window.postMessage({
                    type: 'LUCID_L2_PROCESS_TEXT',
                    text: text,
                    timestamp: Date.now()
                }, '*');
                
                const handleResponse = (event) => {
                    if (event.data.type === 'LUCID_L2_PROCESS_RESPONSE') {
                        window.removeEventListener('message', handleResponse);
                        if (event.data.success) {
                            resolve(event.data.result);
                        } else {
                            reject(new Error(event.data.error));
                        }
                    }
                };
                
                window.addEventListener('message', handleResponse);
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    window.removeEventListener('message', handleResponse);
                    reject(new Error('Request timeout'));
                }, 30000);
            });
        },
        
        // Get extension status
        getStatus: function() {
            return new Promise((resolve) => {
                window.postMessage({
                    type: 'LUCID_L2_GET_STATUS',
                    timestamp: Date.now()
                }, '*');
                
                const handleResponse = (event) => {
                    if (event.data.type === 'LUCID_L2_STATUS_RESPONSE') {
                        window.removeEventListener('message', handleResponse);
                        resolve(event.data.status);
                    }
                };
                
                window.addEventListener('message', handleResponse);
            });
        },
        
        // Register for events
        addEventListener: function(eventType, callback) {
            const handler = (event) => {
                if (event.data.type === `LUCID_L2_${eventType.toUpperCase()}`) {
                    callback(event.data);
                }
            };
            
            window.addEventListener('message', handler);
            
            // Return unsubscribe function
            return () => {
                window.removeEventListener('message', handler);
            };
        },
        
        // Utility functions
        utils: {
            // Highlight text on page
            highlightText: function(text, className = 'lucid-highlighted') {
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                const highlightedNodes = [];
                
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(text)) {
                        const parent = node.parentNode;
                        const regex = new RegExp(`(${text})`, 'gi');
                        const highlightedHTML = node.textContent.replace(
                            regex,
                            `<span class="${className}">$1</span>`
                        );
                        parent.innerHTML = parent.innerHTML.replace(
                            node.textContent,
                            highlightedHTML
                        );
                        highlightedNodes.push(parent);
                    }
                }
                
                return highlightedNodes;
            },
            
            // Extract text from page
            extractText: function(selector) {
                const elements = selector ? document.querySelectorAll(selector) : [document.body];
                return Array.from(elements).map(el => el.textContent.trim()).join(' ');
            },
            
            // Get selected text
            getSelectedText: function() {
                const selection = window.getSelection();
                return selection.toString().trim();
            },
            
            // Scroll to element
            scrollToText: function(text) {
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(text)) {
                        node.parentElement.scrollIntoView({ behavior: 'smooth' });
                        return true;
                    }
                }
                return false;
            }
        }
    };

    // Handle messages from content script
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        
        switch (event.data.type) {
            case 'LUCID_L2_PROCESS_TEXT':
                try {
                    // This would typically communicate with the content script
                    // For now, we'll simulate a successful response
                    const result = {
                        success: true,
                        hash: 'simulated-hash-' + Date.now(),
                        response: 'Text processed successfully',
                        earned: 5 + Math.floor(Math.random() * 10)
                    };
                    
                    window.postMessage({
                        type: 'LUCID_L2_PROCESS_RESPONSE',
                        success: true,
                        result: result
                    }, '*');
                } catch (error) {
                    window.postMessage({
                        type: 'LUCID_L2_PROCESS_RESPONSE',
                        success: false,
                        error: error.message
                    }, '*');
                }
                break;
                
            case 'LUCID_L2_GET_STATUS':
                window.postMessage({
                    type: 'LUCID_L2_STATUS_RESPONSE',
                    status: {
                        version: '1.0.0',
                        connected: true,
                        apiUrl: 'http://localhost:3001',
                        features: ['text-processing', 'auto-highlight', 'notifications']
                    }
                }, '*');
                break;
        }
    });

    // Auto-detect and highlight specific patterns
    const autoDetectPatterns = [
        {
            name: 'questions',
            pattern: /\b(what|how|why|when|where|who)\b.*\?/gi,
            className: 'lucid-question-highlight'
        },
        {
            name: 'problems',
            pattern: /\b(problem|issue|challenge|difficulty|trouble)\b/gi,
            className: 'lucid-problem-highlight'
        },
        {
            name: 'ideas',
            pattern: /\b(idea|concept|thought|solution|approach)\b/gi,
            className: 'lucid-idea-highlight'
        }
    ];

    // Initialize auto-detection
    function initializeAutoDetection() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check for new text content
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
                            detectPatterns(node);
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial detection
        detectPatterns(document.body);
    }

    function detectPatterns(node) {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (!element) return;

        const text = element.textContent;
        if (!text) return;

        autoDetectPatterns.forEach(pattern => {
            if (pattern.pattern.test(text)) {
                element.classList.add(pattern.className);
                
                // Emit event for detected pattern
                window.postMessage({
                    type: 'LUCID_L2_PATTERN_DETECTED',
                    pattern: pattern.name,
                    text: text,
                    element: element
                }, '*');
            }
        });
    }

    // Add default styles for auto-detection
    function addDefaultStyles() {
        const styles = `
            .lucid-question-highlight {
                background: rgba(59, 130, 246, 0.1);
                border-left: 3px solid #3b82f6;
                padding-left: 8px;
                margin: 4px 0;
            }
            
            .lucid-problem-highlight {
                background: rgba(239, 68, 68, 0.1);
                border-left: 3px solid #ef4444;
                padding-left: 8px;
                margin: 4px 0;
            }
            
            .lucid-idea-highlight {
                background: rgba(16, 185, 129, 0.1);
                border-left: 3px solid #10b981;
                padding-left: 8px;
                margin: 4px 0;
            }
            
            .lucid-highlighted {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: white;
                padding: 2px 4px;
                border-radius: 3px;
                font-weight: 500;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.id = 'lucid-l2-injected-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addDefaultStyles();
            initializeAutoDetection();
        });
    } else {
        addDefaultStyles();
        initializeAutoDetection();
    }

    // Notify that the extension is ready
    window.postMessage({
        type: 'LUCID_L2_READY',
        version: '1.0.0',
        timestamp: Date.now()
    }, '*');

    // Debug logging
    console.log('Lucid L2™ Extension injected and ready');

    // Example usage for developers
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(`
🚀 Lucid L2™ Extension API Available:

// Process text
await LucidL2.Extension.processText('Your text here');

// Get status
const status = await LucidL2.Extension.getStatus();

// Listen for events
const unsubscribe = LucidL2.Extension.addEventListener('pattern_detected', (data) => {
    console.log('Pattern detected:', data);
});

// Utility functions
LucidL2.Extension.utils.highlightText('search term');
const selectedText = LucidL2.Extension.utils.getSelectedText();
LucidL2.Extension.utils.scrollToText('find this text');
        `);
    }

})();
