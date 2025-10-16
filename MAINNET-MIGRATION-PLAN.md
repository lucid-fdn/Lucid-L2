# 🚀 Lucid L2™ - Plan de Migration Mainnet

**Objectif:** Déployer le MVP complet sur Solana mainnet en 2-3 semaines  
**Date de début:** 15 octobre 2025  
**Date cible:** 5 novembre 2025 (3 semaines)  
**Budget:** ~$150-200/mois infra + Eden AI pay-per-use  

---

## 📋 Vue d'Ensemble

### État Actuel (Branche Master)
- ✅ Extension browser complète (Privy auth, rewards, anti-cheat)
- ✅ API backend production-ready avec llm-proxy intégration
- ✅ Déployé et testé sur devnet
- ✅ 95% du code prêt pour mainnet

### Ce Qui Reste
- [ ] Déploiement mainnet blockchain
- [ ] Configuration environnements production
- [ ] Tests finaux et optimisations
- [ ] Publication Chrome Web Store
- [ ] Documentation et lancement

---

## 📅 Semaine 1: Déploiement Mainnet (15-21 Oct)

### Jour 1 (15 Oct): Préparation Mainnet

#### Matin: Configuration Solana Mainnet
```bash
# 1. Configurer wallet mainnet
solana config set --url mainnet-beta
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json

# 2. Fund wallet (besoin ~5-10 SOL pour déploiements)
# Transférer depuis exchange (Binance, Coinbase, etc.)

# 3. Vérifier balance
solana balance
```

#### Après-midi: Déploiement Programme
```bash
cd Lucid-L2/programs/thought-epoch

# 1. Build programme
anchor build

# 2. Deploy sur mainnet
anchor deploy --provider.cluster mainnet-beta --provider.wallet ~/.config/solana/mainnet-wallet.json

# 3. Noter le Program ID
# Exemple: XyZ...abc (sera différent de devnet)

# 4. Update Program ID dans Anchor.toml
# [programs.mainnet]
# thought_epoch = "NOUVEAU_PROGRAM_ID"
```

**Livrables Jour 1:**
- ✅ Wallet mainnet configuré et fundé
- ✅ Programme thought-epoch déployé mainnet
- ✅ Program ID documenté

---

### Jour 2 (16 Oct): Token $LUCID Mainnet

#### Création Token
```bash
cd Lucid-L2/offchain

# 1. Créer mint $LUCID sur mainnet
spl-token create-token --decimals 9

# Noter MINT_ADDRESS (exemple: ABC...xyz)

# 2. Créer token account
spl-token create-account MINT_ADDRESS

# 3. Mint initial supply (1 milliard tokens)
spl-token mint MINT_ADDRESS 1000000000

# 4. Vérifier
spl-token supply MINT_ADDRESS
spl-token balance MINT_ADDRESS
```

#### Update Configuration
```bash
# Modifier offchain/src/utils/config.ts
# Ajouter configuration mainnet:

export const MAINNET_CONFIG = {
  rpcUrl: 'https://api.mainnet-beta.solana.com', // Temporaire
  programId: 'NOUVEAU_PROGRAM_ID',
  lucidMint: 'NOUVEAU_MINT_ADDRESS',
  commitment: 'confirmed' as Commitment,
  environment: 'mainnet-beta'
};

# Utiliser Helius RPC (plus fiable):
# rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY'
```

**Livrables Jour 2:**
- ✅ Token $LUCID créé sur mainnet
- ✅ 1 milliard tokens mintés
- ✅ Configuration mise à jour

---

### Jour 3 (17 Oct): Setup Infrastructure Production

#### 1. VPS Setup (DigitalOcean)
```bash
# Créer droplet Ubuntu 22.04 (2GB RAM, $12/mois)
# IP: 123.456.789.012

# SSH dans le serveur
ssh root@123.456.789.012

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install git
apt-get install git

# Clone repo
git clone https://github.com/votre-repo/Lucid-L2.git
cd Lucid-L2
git checkout master
```

#### 2. Setup API Production
```bash
# Sur le VPS
cd Lucid-L2/offchain

# Install dependencies
npm install

# Copier wallet mainnet
scp ~/.config/solana/mainnet-wallet.json root@123.456.789.012:/root/.config/solana/

# Créer .env (si nécessaire)
cat > .env << EOF
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
PROGRAM_ID=VOTRE_PROGRAM_ID
LUCID_MINT=VOTRE_MINT_ADDRESS
EDEN_API_KEY=VOTRE_EDEN_KEY
HF_API_KEY=VOTRE_HF_KEY (optionnel)
EOF

# Build TypeScript
npm run build

# Start avec PM2
pm2 start dist/index.js --name lucid-api
pm2 save
pm2 startup

# Vérifier
curl http://localhost:3001/health
```

#### 3. Setup Nginx Reverse Proxy
```bash
# Install nginx
apt-get install nginx

# Configuration
cat > /etc/nginx/sites-available/lucid-api << 'EOF'
server {
    listen 80;
    server_name api.lucid-l2.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Activer
ln -s /etc/nginx/sites-available/lucid-api /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 4. Setup SSL (Let's Encrypt)
```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Obtenir certificat SSL (une fois DNS configuré)
certbot --nginx -d api.lucid-l2.com

# Auto-renewal configuré automatiquement
```

**Livrables Jour 3:**
- ✅ VPS configuré
- ✅ API running sur production
- ✅ Nginx + SSL configurés
- ✅ PM2 auto-restart configuré

---

### Jour 4 (18 Oct): Configuration Services Externes

#### 1. Helius RPC Setup
```bash
# 1. Créer compte sur helius.dev
# 2. Créer API key mainnet
# 3. Choisir plan:
#    - Free: 100k req/jour (suffisant pour MVP)
#    - Shared: $50/mois (250k req/jour)

# 4. Update config.ts avec clé Helius
```

#### 2. PostgreSQL Setup (Supabase)
```bash
# 1. Créer projet sur supabase.com
# 2. Créer tables pour indexer:

CREATE TABLE epochs (
  id SERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  signature TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  gas_cost_lucid INTEGER,
  network TEXT DEFAULT 'mainnet'
);

CREATE TABLE user_stats (
  wallet TEXT PRIMARY KEY,
  total_epochs INTEGER DEFAULT 0,
  total_mgas_earned INTEGER DEFAULT 0,
  total_lucid_earned INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_activity TIMESTAMP
);

CREATE INDEX idx_epochs_wallet ON epochs(wallet);
CREATE INDEX idx_epochs_timestamp ON epochs(timestamp DESC);

# 3. Noter connection string
# postgres://[user]:[pass]@[host]/[db]
```

#### 3. Eden AI Setup
```bash
# 1. Créer compte edenai.co
# 2. Ajouter payment method
# 3. Activer providers:
#    - OpenAI (GPT-3.5, GPT-4)
#    - Anthropic (Claude-3-Sonnet, Claude-3-Opus)
#    - Google (Gemini-Pro)
# 4. Noter API key
# 5. Test:

curl -X POST https://api.edenai.run/v2/text/generation \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "providers": "openai",
    "text": "Hello world",
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

**Livrables Jour 4:**
- ✅ Helius RPC configuré
- ✅ PostgreSQL production ready
- ✅ Eden AI actif avec 3-5 modèles
- ✅ Toutes les clés API sécurisées

---

### Jour 5 (19 Oct): Update Extension Mainnet

#### Configuration Extension
```bash
cd Lucid-L2/browser-extension

# 1. Update manifest.json
# Changer permissions pour mainnet:
"host_permissions": [
  "https://api.lucid-l2.com/*",
  "https://api.mainnet-beta.solana.com/*"
]

# 2. Update popup.js
# Ligne ~15-20, remplacer:
const LUCID_MINT = 'NOUVEAU_MINT_ADDRESS_MAINNET';
const API_URL = 'https://api.lucid-l2.com';
const NETWORK = 'mainnet-beta';

# 3. Update privy-api-bridge.js
# Ligne ~10, remplacer:
const SOLANA_NETWORK = 'mainnet-beta';
const PROGRAM_ID = 'NOUVEAU_PROGRAM_ID';

# 4. Update manifest version
"version": "1.0.0" // Prêt pour production
```

#### Rebuild Extension (si TypeScript)
```bash
# Si vous utilisez Vite/TypeScript
npm install
npm run build

# Vérifier dist/ contient les fichiers à jour
```

**Livrables Jour 5:**
- ✅ Extension configurée mainnet
- ✅ Toutes les URLs pointent production
- ✅ Version 1.0.0 prête

---

### Jour 6-7 (20-21 Oct): Tests End-to-End Mainnet

#### Tests Critiques
```bash
# 1. Test API Health
curl https://api.lucid-l2.com/health

# 2. Test Transaction Simple
curl -X POST https://api.lucid-l2.com/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Premier test mainnet!"}'

# Vérifier:
# - Transaction confirmée
# - Gas brûlé correctement
# - Epoch stocké on-chain

# 3. Test Extension
# Charger extension dans Chrome
# Connecter Phantom wallet (mainnet)
# Envoyer un message test
# Vérifier transaction sur Solana Explorer mainnet
```

#### Checklist Tests
- [ ] API répond sur https://api.lucid-l2.com
- [ ] SSL fonctionne correctement
- [ ] Transaction mainnet confirmée
- [ ] Gas burning $LUCID fonctionne
- [ ] Extension communique avec API
- [ ] Wallet connection Phantom OK
- [ ] Balance mGas s'update correctement
- [ ] Explorer link fonctionne
- [ ] Erreurs gérées gracieusement

**Livrables Weekend:**
- ✅ Tests end-to-end passés
- ✅ Issues critiques résolues
- ✅ Prêt pour optimisations

---

## 📅 Semaine 2: Optimisation & Publication (22-28 Oct)

### Jour 8 (22 Oct): Performance Optimization

#### API Optimizations
```typescript
// 1. Add response caching
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 });

// 2. Rate limiting
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20 // 20 requests per minute
});
app.use('/run', limiter);

// 3. Compression
import compression from 'compression';
app.use(compression());

// 4. Database connection pooling
// Configure dans Supabase settings
```

#### Extension Optimizations
```javascript
// 1. Reduce bundle size
// Dans popup.js, lazy load modules
const loadAI = async () => {
  const { processThought } = await import('./ai-processor.js');
  return processThought;
};

// 2. Cache wallet connection
chrome.storage.local.set({ walletConnected: true });

// 3. Debounce text processing
let timeout;
const debouncedProcess = (text) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => processText(text), 500);
};
```

**Livrables Jour 8:**
- ✅ API ~30% plus rapide
- ✅ Extension ~20% plus légère
- ✅ Rate limiting actif

---

### Jour 9 (23 Oct): Security Hardening

#### API Security
```bash
# 1. Install helmet
npm install helmet
# Ajouter dans index.ts: app.use(helmet());

# 2. Environment variables sécurisées
# Utiliser dotenv + vault pour secrets

# 3. Input validation
npm install joi
# Valider tous les inputs utilisateur

# 4. CORS restrictif
app.use(cors({
  origin: ['https://api.lucid-l2.com', 'chrome-extension://*'],
  credentials: true
}));
```

#### Extension Security
```javascript
// 1. Content Security Policy dans manifest.json (déjà fait)
// 2. Sanitize user inputs
const sanitize = (text) => {
  return text.replace(/<script>/gi, '').slice(0, 5000);
};

// 3. Validate API responses
if (!response.success || !response.txSignature) {
  throw new Error('Invalid API response');
}
```

**Livrables Jour 9:**
- ✅ Security audit basique complété
- ✅ Input validation partout
- ✅ Secrets sécurisés

---

### Jour 10 (24 Oct): Load Testing

#### Setup Load Tests
```bash
# Install k6
brew install k6  # ou apt-get install k6

# Créer test script
cat > load-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp up to 20 users
    { duration: '3m', target: 20 },  // Stay at 20 users
    { duration: '1m', target: 50 },  // Ramp up to 50 users
    { duration: '3m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
};

export default function () {
  const payload = JSON.stringify({
    text: 'Load test message ' + Math.random()
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post('https://api.lucid-l2.com/run', payload, params);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
EOF

# Run test
k6 run load-test.js
```

#### Analyze Results
- Target: 95% requests < 2s response time
- Target: 0% errors under 50 concurrent users
- Si échec: scale VPS ou optimize code

**Livrables Jour 10:**
- ✅ Load test results documentés
- ✅ Performance acceptable (50+ users)
- ✅ Scalability path identifié

---

### Jour 11 (25 Oct): Chrome Web Store Preparation

#### Assets Création
```bash
# 1. Screenshots (1280x800 ou 640x400)
# Prendre 3-5 screenshots de l'extension en action:
# - Screenshot 1: Popup principal avec wallet connecté
# - Screenshot 2: Processing d'un message
# - Screenshot 3: Rewards et achievements
# - Screenshot 4: History des transactions
# - Screenshot 5: Settings et modèles IA

# 2. Promo images (440x280)
# Créer image promotionnelle avec:
# - Logo Lucid AI
# - Tagline: "Chat with AI, Earn Crypto"
# - Key features en bullet points

# 3. Icon haute résolution (128x128 minimum, 1024x1024 idéal)
# S'assurer que icon128.png est sharp et professionnel
```

#### Store Listing Content
```markdown
# Titre (45 caractères max)
Lucid AI - Earn Crypto Chatting with AI

# Description courte (132 caractères max)
Chat with 100+ AI models and earn $LUCID tokens. Own your data on Solana blockchain. Web3 powered.

# Description longue (16,000 caractères max)
## Transform Your AI Conversations into Crypto Assets

Lucid AI is the first browser extension that lets you earn cryptocurrency while chatting with advanced AI models. Every conversation you have is stored securely on the Solana blockchain, and you earn $LUCID tokens as rewards.

### 🚀 Key Features

**Multiple AI Models**
- Access GPT-4, Claude, Gemini, and more
- Choose the best model for each task
- Seamless switching between providers

**Earn While You Chat**
- Earn 5-10 $LUCID per message
- Daily challenges and achievements
- Streak bonuses for consistent use
- Convert mGas points to $LUCID tokens

**True Data Ownership**
- Your conversations stored on Solana blockchain
- Cryptographically verified with Merkle proofs
- You control access to your data
- Export your data anytime

**Professional Wallet Integration**
- Support for Phantom, Solflare, MetaMask
- Powered by Privy authentication
- Secure transaction signing
- Real-time balance updates

**Privacy & Security**
- End-to-end encrypted conversations
- No data sold to third parties
- Open-source verification
- Anti-spam protection

### 🎯 How It Works

1. **Install** the extension and connect your wallet
2. **Chat** with AI using the popup interface
3. **Earn** $LUCID tokens automatically
4. **Track** your progress with daily goals
5. **Claim** your rewards weekly

### 💡 Perfect For

- AI enthusiasts exploring different models
- Crypto users looking for passive income
- Privacy-conscious users wanting data ownership
- Researchers needing verifiable AI interactions
- Developers building on Web3

### 🔒 Security & Trust

- Smart contracts audited
- Open-source codebase
- Built on Solana (fastest blockchain)
- Professional authentication via Privy
- Regular security updates

### 📊 Transparent Economics

- Clear gas costs displayed
- No hidden fees
- Fair reward distribution
- Real-time blockchain verification

### 🌐 Community & Support

- Active Discord community
- Regular feature updates
- Responsive support team
- Developer documentation

Start earning crypto while chatting with AI today!

### Requirements
- Solana-compatible wallet (Phantom, Solflare, or MetaMask)
- Chrome browser version 90+
- Internet connection

**Privacy Policy:** https://lucid-l2.com/privacy
**Terms of Service:** https://lucid-l2.com/terms
**Support:** support@lucid-l2.com
```

#### Privacy Policy & Terms
```markdown
# Créer pages sur lucid-l2.com:
# - /privacy
# - /terms
# - /support

# Utiliser templates:
# - Termly.io (générateur gratuit)
# - ou adapter template standard GDPR-compliant
```

**Livrables Jour 11:**
- ✅ 5 screenshots professionnels
- ✅ Promo image créée
- ✅ Store listing texte rédigé
- ✅ Privacy policy & terms publiés

---

### Jour 12 (26 Oct): Chrome Web Store Submission

#### Account Setup
```bash
# 1. Créer Chrome Web Store Developer Account
# https://chrome.google.com/webstore/devconsole/
# Coût: $5 one-time fee

# 2. Préparer extension pour publication
cd Lucid-L2/browser-extension

# Créer .zip excluant fichiers dev
zip -r lucid-ai-extension.zip . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.md" \
  -x "*test*" \
  -x "*.DS_Store"

# 3. Vérifier taille < 2GB (devrait être ~5-10MB)
ls -lh lucid-ai-extension.zip
```

#### Submission Process
```markdown
1. **Upload Package**
   - Upload lucid-ai-extension.zip
   - System will validate manifest.json

2. **Store Listing**
   - Product name: Lucid AI
   - Summary: (copier description courte)
   - Description: (copier description longue)
   - Category: Productivity
   - Language: English (primary), French (secondary)

3. **Graphics**
   - Icon: icon128.png
   - Screenshots: Upload les 5 screenshots
   - Promo tile: Upload promo image 440x280

4. **Privacy Practices**
   - Single purpose: "AI chat with blockchain rewards"
   - Justification for permissions:
     * storage: Save user preferences
     * notifications: Reward notifications
     * activeTab: Process selected text
   - Data usage: Minimal, stored on blockchain
   - Privacy policy URL: https://lucid-l2.com/privacy

5. **Distribution**
   - Visibility: Public
   - Regions: All countries
   - Pricing: Free

6. **Submit for Review**
   - Takes 1-3 days typically
   - Sometimes up to 1 week
```

**Livrables Jour 12:**
- ✅ Chrome Web Store account créé
- ✅ Extension soumise pour review
- ✅ En attente validation (~2-3 jours)

---

### Jour 13-14 (27-28 Oct): Documentation & Landing Page

#### User Documentation
```markdown
# Créer dans Lucid-L2/docs/:

## USER_GUIDE.md
- Installation instructions
- Wallet setup guide
- First message walkthrough
- Earning rewards explanation
- FAQ
- Troubleshooting

## DEVELOPER_GUIDE.md
- API documentation
- Integration examples
- Smart contract interaction
- Extension development guide
```

#### Landing Page (lucid-l2.com)
```bash
# Setup Next.js landing page
npx create-next-app@latest landing
cd landing

# Pages nécessaires:
# - / (homepage)
# - /privacy
# - /terms
# - /docs
# - /support

# Deploy sur Vercel (gratuit)
vercel deploy --prod
```

#### Homepage Content
```markdown
# Hero Section
**Earn Crypto While Chatting with AI**
Transform every conversation into blockchain-verified assets.
[Install Extension] [Learn More]

# Features Section
✨ 100+ AI Models | 💰 Earn $LUCID | 🔐 Own Your Data | ⚡ Built on Solana

# How It Works
1. Install Extension → 2. Connect Wallet → 3. Chat with AI → 4. Earn Rewards

# Stats (if available)
X users | Y conversations | Z $LUCID distributed

# Social Proof
Testimonials (future) | Press mentions (future)

# CTA
[Install on Chrome] [Join Discord] [Read Docs]
```

**Livrables Weekend 2:**
- ✅ Documentation complète
- ✅ Landing page live
- ✅ Support email configuré
- ✅ En attente Chrome review

---

## 📅 Semaine 3: Launch & Marketing (29 Oct - 5 Nov)

### Jour 15 (29 Oct): Soft Launch Preparation

#### Beta Testers Recruitment
```markdown
# 1. Créer Google Form pour beta signup
# - Name
# - Email
# - Wallet address (Solana)
# - Why interested?
# - Experience with crypto (1-5)

# 2. Invitations channels:
# - Twitter/X post
# - Solana Discord communities
# - Reddit r/solana, r/cryptocurrency
# - Product Hunt "upcoming" page

# Target: 50 beta testers

# 3. Setup Discord server
# Channels:
# - #announcements
# - #general
# - #support
# - #bug-reports
# - #feature-requests
```

#### Monitoring Setup
```bash
# 1. Grafana Dashboard
# Metrics à tracker:
# - API requests/min
# - Average response time
# - Error rate
# - Active users
# - Transactions/
