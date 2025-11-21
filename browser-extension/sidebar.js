// Lucid L2™ Sidebar - Persistent Extension UI
(() => {
    // Check if sidebar already exists
    if (document.getElementById('lucid-sidebar')) {
        return;
    }

    // Create sidebar container
    const sidebar = document.createElement('div');
    sidebar.id = 'lucid-sidebar';
    sidebar.className = 'lucid-sidebar';
    
    // Create sidebar content (same as popup.html but adapted for sidebar)
    sidebar.innerHTML = `
        <div class="lucid-sidebar-container">
            <!-- Header -->
            <div class="lucid-sidebar-header">
                <div class="lucid-sidebar-logo">
                    <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Lucid L2™" class="lucid-sidebar-logo-icon">
                    <h1>Lucid L2™</h1>
                </div>
                <div class="lucid-sidebar-controls">
                    <button class="lucid-sidebar-unpin" id="lucidSidebarUnpin" title="Unpin sidebar">📌</button>
                    <button class="lucid-sidebar-close" id="lucidSidebarClose" title="Close">×</button>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="lucid-sidebar-stats">
                <div class="lucid-stat-card">
                    <div class="lucid-stat-icon">⚡</div>
                    <div class="lucid-stat-content">
                        <div class="lucid-stat-label">mGas</div>
                        <div class="lucid-stat-value" id="lucidStatMGas">0</div>
                    </div>
                </div>
                <div class="lucid-stat-card">
                    <div class="lucid-stat-icon">💎</div>
                    <div class="lucid-stat-content">
                        <div class="lucid-stat-label">LUCID</div>
                        <div class="lucid-stat-value" id="lucidStatLUCID">0</div>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div class="lucid-sidebar-content" id="lucidSidebarContent">
                <div class="lucid-sidebar-section">
                    <h3>🤖 ChatGPT Session</h3>
                    <div id="lucidChatGPTStats" class="lucid-chatgpt-stats">
                        <div class="lucid-stat-row">
                            <span>Messages:</span>
                            <span id="lucidChatMessages">0</span>
                        </div>
                        <div class="lucid-stat-row">
                            <span>Points:</span>
                            <span id="lucidChatPoints">0</span>
                        </div>
                        <div class="lucid-stat-row highlight">
                            <span>mGas:</span>
                            <span id="lucidChatMGas">0</span>
                        </div>
                    </div>
                </div>

                <div class="lucid-sidebar-section">
                    <h3>💬 Recent Captures</h3>
                    <div id="lucidRecentCaptures" class="lucid-recent-captures">
                        <div class="lucid-no-data">No captures yet</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append to body
    document.body.appendChild(sidebar);

    // Load data and update UI
    updateSidebarData();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.chatgpt_session_stats || changes.conversationHistory || changes.balance) {
                console.log('🔄 Sidebar: Storage changed, updating data...');
                updateSidebarData();
            }
        }
    });
    
    // Listen for rewards updates from background script (same as popup)
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg?.type === 'rewards_updated') {
            console.log('🎉 Sidebar: Rewards updated from backend:', msg.data);
            // Trigger immediate refresh from backend
            updateSidebarData();
        }
    });

    // Setup event listeners
    document.getElementById('lucidSidebarClose').addEventListener('click', () => {
        closeSidebar();
    });

    document.getElementById('lucidSidebarUnpin').addEventListener('click', () => {
        closeSidebar();
        chrome.storage.local.set({ sidebarPinned: false });
    });

    // Listen for close message from popup
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'closeSidebar') {
            closeSidebar();
        }
    });

    async function updateSidebarData() {
        try {
            console.log('🔄 Sidebar: Starting data update...');
            
            // Promisify chrome.storage.local.get
            const storageData = await new Promise((resolve) => {
                chrome.storage.local.get([
                    'privy_session',
                    'chatgpt_session_stats',
                    'conversationHistory',
                    'balance'
                ], resolve);
            });
            
            console.log('📦 Sidebar: Storage data loaded:', {
                hasSession: !!storageData.privy_session,
                localBalance: storageData.balance
            });
            
            // IMPORTANT: Sidebar cannot fetch from HTTP backend due to Mixed Content Policy
            // when running on HTTPS pages like ChatGPT. It must read from storage only.
            // The popup updates storage with backend data, so sidebar reads that.
            
            const stats = storageData.chatgpt_session_stats || {
                totalMessages: 0,
                pointsEarned: 0,
                mGasEarned: 0,
                lucidTokensEarned: 0
            };
            
            // Read balance from storage (popup keeps this updated from backend)
            const balance = storageData.balance || { mGas: 0, lucid: 0 };
            const history = storageData.conversationHistory || [];

            console.log('📊 Sidebar: Balance from storage:', balance);
            console.log('📊 Sidebar: Session stats:', stats);

            // Display the balance (already includes all earnings from backend)
            const totalMGas = balance.mGas || 0;
            const totalLUCID = balance.lucid || 0;

            const mGasElement = document.getElementById('lucidStatMGas');
            const lucidElement = document.getElementById('lucidStatLUCID');
            
            if (mGasElement) {
                mGasElement.textContent = totalMGas.toLocaleString();
                console.log('✅ Sidebar: Updated mGas display to:', totalMGas);
            }
            if (lucidElement) {
                lucidElement.textContent = totalLUCID.toLocaleString();
                console.log('✅ Sidebar: Updated LUCID display to:', totalLUCID);
            }

            // Session stats are just for display in this session
            const messagesElement = document.getElementById('lucidChatMessages');
            const pointsElement = document.getElementById('lucidChatPoints');
            const chatMGasElement = document.getElementById('lucidChatMGas');
            
            if (messagesElement) messagesElement.textContent = stats.totalMessages || 0;
            if (pointsElement) pointsElement.textContent = (stats.pointsEarned || 0).toFixed(1);
            if (chatMGasElement) chatMGasElement.textContent = stats.mGasEarned || 0;

            // Update recent captures
            const capturesContainer = document.getElementById('lucidRecentCaptures');
            if (capturesContainer) {
                if (history.length === 0) {
                    capturesContainer.innerHTML = '<div class="lucid-no-data">No captures yet</div>';
                } else {
                    const recentCaptures = history.slice(-5).reverse();
                    capturesContainer.innerHTML = recentCaptures.map(capture => `
                        <div class="lucid-capture-item">
                            <div class="lucid-capture-type ${capture.type}">
                                ${capture.type === 'user' ? '👤' : '🤖'}
                            </div>
                            <div class="lucid-capture-text">${truncateText(capture.content, 60)}</div>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('❌ Sidebar: Error updating data:', error);
        }
    }

    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function closeSidebar() {
        const sidebarElement = document.getElementById('lucid-sidebar');
        if (sidebarElement) {
            sidebarElement.classList.add('lucid-sidebar-closing');
            setTimeout(() => {
                sidebarElement.remove();
            }, 300);
        }
    }

    console.log('✅ Lucid L2™ sidebar loaded');
})();
