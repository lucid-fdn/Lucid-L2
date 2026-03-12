# 🎯 Quick Start - Migration Mainnet

**Durée:** 2-3 semaines  
**Budget:** $150-200/mois  
**Objectif:** MVP Lucid AI live sur Solana mainnet + Chrome Web Store

---

## ✅ Pré-requis

- [ ] 5-10 SOL pour déploiements mainnet (~$750-1500 selon prix)
- [ ] Compte DigitalOcean ou VPS équivalent
- [ ] Domaine `lucid-l2.com` configuré
- [ ] Compte Eden AI avec payment method
- [ ] Chrome Developer account ($5 one-time)

---

## 🚀 Actions Immédiates (Jour 1-2)

### 1. Préparer Wallet Mainnet
```bash
cd Lucid-L2
solana config set --url mainnet-beta
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json
# Transférer 5-10 SOL depuis exchange
solana balance
```

### 2. Déployer Programme
```bash
cd programs/thought-epoch
anchor build
anchor deploy --provider.cluster mainnet-beta
# Noter le Program ID: XYZ...abc
```

### 3. Créer Token $LUCID
```bash
spl-token create-token --decimals 9
# Noter MINT_ADDRESS: ABC...xyz
spl-token create-account ABC...xyz
spl-token mint ABC...xyz 1000000000
```

### 4. Update Configuration
```typescript
// offchain/src/utils/config.ts
export const MAINNET_CONFIG = {
  programId: 'XYZ...abc',  // Program ID du step 2
  lucidMint: 'ABC...xyz',  // Mint address du step 3
  rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  environment: 'mainnet-beta'
};
```

---

## 📋 Checklist Complète

### Semaine 1: Infrastructure
- [ ] Jour 1: Wallet + Programme mainnet
- [ ] Jour 2: Token $LUCID créé
- [ ] Jour 3: VPS + API production
- [ ] Jour 4: Helius + Supabase + Eden AI
- [ ] Jour 5: Extension configurée mainnet
- [ ] Jour 6-7: Tests end-to-end

### Semaine 2: Publication
- [ ] Jour 8: Optimisations performance
- [ ] Jour 9: Security hardening
- [ ] Jour 10: Load testing
- [ ] Jour 11: Screenshots + Store listing
- [ ] Jour 12: Soumission Chrome Web Store
- [ ] Jour 13-14: Documentation + Landing page

### Semaine 3: Lancement
- [ ] Jour 15: Beta testers (50 invitations)
- [ ] Jour 16-17: Monitoring + Bug fixes
- [ ] Jour 18: Chrome Web Store approved
- [ ] Jour 19: Soft launch (Twitter, Discord)
- [ ] Jour 20: Marketing push
- [ ] Jour 21: Feedback review + iteration

---

## 💰 Budget Détaillé

| Item | Coût | Quand |
|------|------|-------|
| SOL pour déploiement | $750-1500 | Jour 1 |
| Chrome Dev Account | $5 | Jour 12 |
| VPS DigitalOcean | $12/mois | Jour 3 |
| Helius RPC | $0-50/mois | Jour 4 |
| Supabase | $0-25/mois | Jour 4 |
| Domain | $12/an | Jour 13 |
| Eden AI | Pay-per-use | Ongoing |
| **Total Setup** | ~$800-1600 | |
| **Total Mensuel** | ~$50-150 | |

---

## 🎯 Modèles IA Prioritaires

**Top 5 pour MVP:**
1. **GPT-3.5-Turbo** (OpenAI) - Rapide, abordable, populaire
2. **Claude-3-Sonnet** (Anthropic) - Excellent rapport qualité/prix
3. **Llama-3-70B** (Meta) - Open-source, gratuit via HF
4. **Mistral-Large** (Mistral) - Français natif, performant
5. **Gemini-Pro** (Google) - Multimodal, compétitif

**Configuration dropdown extension:**
```javascript
const AI_MODELS = [
  { id: 'gpt35', name: 'GPT-3.5 Turbo', provider: 'openai', cost: 'low' },
  { id: 'claude-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', cost: 'medium' },
  { id: 'llama3', name: 'Llama 3 70B', provider: 'huggingface', cost: 'free' },
  { id: 'mistral', name: 'Mistral Large', provider: 'mistral', cost: 'medium' },
  { id: 'gemini', name: 'Gemini Pro', provider: 'google', cost: 'low' }
];
```

---

## 🔗 Ressources Clés

**Documentation:**
- [MAINNET-MIGRATION-PLAN.md](./MAINNET-MIGRATION-PLAN.md) - Plan complet 3 semaines
- [PHASE-8.2-BROWSER-EXTENSION-GUIDE.md](./PHASE-8.2-BROWSER-EXTENSION-GUIDE.md) - Guide extension
- [TESTNET-DEPLOYMENT-SUMMARY.md](./TESTNET-DEPLOYMENT-SUMMARY.md) - Devnet status

**Services Externes:**
- Helius: https://helius.dev
- Supabase: https://supabase.com
- Eden AI: https://edenai.co
- DigitalOcean: https://digitalocean.com
- Chrome Web Store: https://chrome.google.com/webstore/devconsole/

**Monitoring:**
- Solana Explorer: https://explorer.solana.com
- Grafana Cloud: https://grafana.com/products/cloud/

---

## ❓ Support

**Questions? Contact:**
- Email: support@lucid-l2.com (à configurer)
- Discord: (à créer)
- GitHub: (issues)

**Prêt à démarrer? Exécutez les commandes du Jour 1!** 🚀
