# Achievement Extensions Migration - Quick Guide 🚀

## 📋 Qu'est-ce que cette migration ?

Cette migration ajoute le support pour 2 nouveaux achievements au backend :
- ⚡ **Batch Processor** : 50 pensées en mode batch → 40 mGas
- 🏆 **Referral Champion** : 10 parrainages → 200 mGas

## 🔧 Changements de la migration

**Fichier** : `infrastructure/migrations/20250225_achievement_extensions.sql`

### 1. Table `users`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_users TEXT[] DEFAULT '{}';
```
- Ajoute un tableau pour tracker les utilisateurs parrainés
- Permet le calcul de l'achievement "Referral Champion"

### 2. Table `conversations`
```sql
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB;
```
- Ajoute une colonne metadata en format JSONB
- Permet de marquer les conversations comme "batch" via `{"is_batch": true}`
- Permet le calcul de l'achievement "Batch Processor"

### 3. Index de performance
```sql
CREATE INDEX IF NOT EXISTS idx_conversations_metadata ON conversations USING GIN (metadata);
```
- Index GIN pour requêtes rapides sur le JSONB metadata

## ⚡ Exécution Rapide

### Méthode 1 : Node.js (RECOMMANDÉ)

```bash
cd Lucid-L2/offchain
node ../infrastructure/scripts/run-achievement-extensions-migration.js
```

**Pré-requis** :
- Variables d'environnement configurées dans `offchain/.env`
- Connexion à Supabase Cloud fonctionnelle

### Méthode 2 : Supabase Dashboard (Alternative)

1. Aller sur https://supabase.com/dashboard
2. Sélectionner votre projet
3. Aller dans **SQL Editor**
4. Copier-coller le contenu de `infrastructure/migrations/20250225_achievement_extensions.sql`
5. Cliquer sur **Run**

## ✅ Vérification

Après l'exécution, le script affiche :

```
✅ Migration completed successfully!

📊 Verification:
   ✓ users.referred_users column added
   ✓ conversations.metadata column added

🎯 New achievements now supported:
   • Batch Processor (⚡ 50 batch thoughts → 40 mGas)
   • Referral Champion (🏆 10 referrals → 200 mGas)
```

### Vérification manuelle dans Supabase

```sql
-- Vérifier la colonne referred_users
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'referred_users';

-- Vérifier la colonne metadata
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversations' AND column_name = 'metadata';
```

## 🔄 Rollback (si nécessaire)

Si tu dois annuler la migration :

```sql
-- Supprimer les colonnes ajoutées
ALTER TABLE users DROP COLUMN IF EXISTS referred_users;
ALTER TABLE conversations DROP COLUMN IF EXISTS metadata;

-- Supprimer l'index
DROP INDEX IF EXISTS idx_conversations_metadata;
```

## 📊 Impact sur l'API

Après cette migration, les endpoints suivants fonctionneront correctement :

### `/api/rewards/achievements/:userId`
Retournera **8 achievements** au lieu de 6 :
- Les 6 originaux (first_thought, creative_writer, streak_master, converter, social_butterfly, quality_guru)
- **+2 nouveaux** (batch_processor, referral_champion)

### `/api/rewards/balance/:userId`
Les stats utilisateur incluront maintenant :
- `batch_thoughts` : nombre de conversations en mode batch
- `referrals` : nombre d'utilisateurs parrainés

## 🎯 Utilisation après migration

### Marquer une conversation comme "batch"

```javascript
// Dans le code backend
await client.query(
  `INSERT INTO conversations (user_id, message_type, content, metadata)
   VALUES ($1, $2, $3, $4)`,
  [userId, 'user', content, JSON.stringify({ is_batch: true })]
);
```

### Ajouter un parrainage

```javascript
// Ajouter l'ID du parrainé au tableau du parrain
await client.query(
  `UPDATE users 
   SET referred_users = array_append(referred_users, $1)
   WHERE privy_user_id = $2`,
  [newUserPrivyId, referrerPrivyId]
);
```

## 🐛 Troubleshooting

### Erreur : "Connection timeout"
**Solution** : Vérifier que les variables sont bien définies dans `offchain/.env`
```bash
cat Lucid-L2/offchain/.env | grep POSTGRES
```

### Erreur : "Column already exists"
**Solution** : Normal si la migration a déjà été exécutée. Le script utilise `IF NOT EXISTS` donc c'est safe.

### Erreur : "Permission denied"
**Solution** : Vérifier les credentials Supabase dans `.env`

## 📝 Notes

- Cette migration est **idempotente** (safe à exécuter plusieurs fois)
- Utilise `IF NOT EXISTS` pour éviter les erreurs de duplication
- Compatible avec l'architecture serverless de Supabase
- Pas besoin de redémarrer les services docker après la migration

## 🔗 Voir aussi

- `BACKEND-EXTENSION-ALIGNMENT-COMPLETE.md` - Documentation complète de l'alignement
- `QUICK-START-REWARD-SYSTEM.md` - Guide du système de récompenses
- `infrastructure/migrations/20250206_rewards_system.sql` - Migration originale du système
