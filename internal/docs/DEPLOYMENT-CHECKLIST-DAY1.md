# ⚠️ CHECKLIST AVANT DÉPLOIEMENT MAINNET - JOUR 1

## 🚨 Points Critiques à Vérifier

Avant de continuer, assurez-vous d'avoir:

### 1. Budget SOL (CRITIQUE)
- [ ] **5-10 SOL disponibles** (~$750-1500 USD selon prix actuel)
- [ ] SOL achetés sur exchange (Binance, Coinbase, Kraken, etc.)
- [ ] Prêt à transférer vers nouveau wallet mainnet

**⚠️ ATTENTION:** Le déploiement mainnet consomme des SOL réels et irréversibles!

### 2. Comptes Services (Optionnel pour Jour 1)
- [ ] Compte Helius (gratuit: https://helius.dev)
- [ ] Compte Eden AI (gratuit puis pay-per-use: https://edenai.co)
- [ ] VPS prêt (DigitalOcean, AWS, etc.) - Peut attendre Jour 3

### 3. Environnement Développement
- [ ] Solana CLI (on va installer)
- [ ] Anchor CLI (on va installer)
- [ ] Rust toolchain (vérifier si installé)

### 4. Accès Sécurisé
- [ ] Backup du wallet devnet existant
- [ ] Prêt à créer nouveau wallet mainnet sécurisé
- [ ] Lieu sûr pour stocker seed phrase (papier, coffre, etc.)

---

## 📋 Ce Que Nous Allons Faire Maintenant

### Étape 1: Installation Outils (30 min)
```bash
# Installer Solana CLI v1.18.18
# Installer Anchor CLI
# Vérifier Rust
```

### Étape 2: Configuration Mainnet (15 min)
```bash
# Créer nouveau wallet mainnet
# Configurer connexion mainnet-beta
# VOUS DEVREZ: Transférer 5-10 SOL depuis exchange
```

### Étape 3: Build Programme (10 min)
```bash
cd programs/thought-epoch
anchor build
```

### Étape 4: Déploiement Mainnet (15 min)
```bash
# ⚠️ COÛTE ~2-3 SOL
anchor deploy --provider.cluster mainnet-beta
# Génère nouveau Program ID mainnet
```

### Étape 5: Création Token $LUCID (10 min)
```bash
# ⚠️ COÛTE ~0.5 SOL
spl-token create-token --decimals 9
spl-token create-account MINT_ADDRESS
spl-token mint MINT_ADDRESS 1000000000
```

### Étape 6: Update Configuration (10 min)
```bash
# Update tous les fichiers config avec nouveaux IDs mainnet
# Extension, API, frontend
```

---

## 💰 Coûts Jour 1

| Action | Coût SOL | Coût USD (@ $150/SOL) |
|--------|----------|---------------------|
| Programme deploy | ~2-3 SOL | ~$300-450 |
| Token create | ~0.01 SOL | ~$1.5 |
| Token account | ~0.002 SOL | ~$0.3 |
| Mint tokens | ~0.001 SOL | ~$0.15 |
| Rent + fees | ~0.5 SOL | ~$75 |
| **TOTAL** | ~3-4 SOL | ~$450-600 |
| **Recommandé avoir** | 5-10 SOL | $750-1500 |

---

## ⚠️ WARNINGS

### 🔴 Mainnet = Production Réel
- Les transactions sont **IRRÉVERSIBLES**
- Les SOL dépensés sont **RÉELS**
- Les erreurs peuvent **COÛTER CHER**
- Pas de "undo" ou "rollback"

### 🟡 Alternative: Continuer sur Devnet
Si vous préférez:
- Tester plus longuement sur devnet
- Inviter beta testers sur devnet
- Économiser les coûts mainnet
- **On peut rester sur devnet encore 1-2 semaines**

---

## ✅ Confirmation Requise

**Avant de continuer, confirmez que:**

1. ✅ Vous avez 5-10 SOL disponibles OU prêt à acheter maintenant
2. ✅ Vous comprenez que c'est du vrai argent sur mainnet
3. ✅ Vous êtes OK avec les coûts ~$450-600 pour Jour 1
4. ✅ Vous avez ~2 heures disponibles pour compléter Jour 1

**Répondez:**
- **"confirmed"** = On continue avec mainnet
- **"devnet first"** = On reste sur devnet pour plus de tests
- **"pause"** = On attend que vous ayez les SOL

---

## 📝 Notes Importantes

### Si Vous Choisissez "Confirmed"
Je vais:
1. Installer Solana CLI et Anchor CLI
2. Créer wallet mainnet sécurisé
3. **ATTENDRE** que vous transferiez les SOL
4. Puis déployer programme et créer token

### Si Vous Choisissez "Devnet First"
On peut:
1. Perfectionner l'extension sur devnet
2. Inviter 10-20 beta testers devnet
3. Collecter feedback
4. Puis migration mainnet dans 1-2 semaines

### Si Vous Choisissez "Pause"
Pas de problème! On peut:
1. Vous donner instructions pour acheter SOL
2. Attendre que vous ayez les fonds
3. Reprendre quand prêt

---

**Quelle est votre décision? (confirmed / devnet first / pause)**
