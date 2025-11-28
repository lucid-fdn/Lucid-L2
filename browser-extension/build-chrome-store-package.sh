#!/bin/bash
# Script de packaging pour Chrome Web Store
# Crée un package propre sans fichiers de développement

echo "🔧 Building Chrome Web Store package..."

# Nettoyer ancien package
rm -rf chrome-store-package
rm -f lucid-chrome-store.zip

# Créer structure propre
mkdir -p chrome-store-package

# Copier fichiers essentiels
echo "📁 Copying essential files..."
cp manifest.json chrome-store-package/
cp background.js chrome-store-package/
cp content.js chrome-store-package/
cp popup.html chrome-store-package/
cp popup.js chrome-store-package/
cp popup-styles.css chrome-store-package/
cp sidebar.html chrome-store-package/
cp sidebar.js chrome-store-package/
cp sidebar-styles.css chrome-store-package/
cp auth.html chrome-store-package/
cp auth-redirect.js chrome-store-package/
cp config.js chrome-store-package/
cp reward-system.js chrome-store-package/
cp privy-api-bridge.js chrome-store-package/

# Copier dossiers nécessaires
echo "📂 Copying directories..."
cp -r icons chrome-store-package/
cp -r dist chrome-store-package/ 2>/dev/null || echo "⚠️  Warning: dist/ folder not found - run npm run build first"

# Créer README utilisateur simple
cat > chrome-store-package/README.md << 'EOF'
# Lucid AI Memory Extension

Connect your ChatGPT conversations to earn crypto rewards on Lucid L2 blockchain.

## Quick Start

1. Click the extension icon in your browser
2. Connect your Solana wallet via Privy
3. Visit ChatGPT and start chatting
4. Earn mGas tokens automatically

## Features

- 🔐 Secure wallet connection via Privy
- 💬 Automatic ChatGPT conversation capture
- ⚡ Earn mGas tokens for AI interactions
- 💎 Convert mGas to LUCID tokens
- 📊 Track rewards and achievements

## Support

- Website: https://www.lucid.foundation
- Privacy Policy: https://www.lucid.foundation/privacy
- Email: support@lucid.foundation

## Version

1.0.0
EOF

# Créer ZIP
echo "📦 Creating ZIP package..."
cd chrome-store-package
zip -r ../lucid-chrome-store.zip . -x "*.DS_Store" -q
cd ..

# Afficher résultat
echo ""
echo "✅ Package créé avec succès !"
echo "📦 Fichier : lucid-chrome-store.zip"
echo "📊 Taille : $(du -h lucid-chrome-store.zip | cut -f1)"
echo ""
echo "📋 Contenu du package :"
unzip -l lucid-chrome-store.zip

# Vérifications
echo ""
echo "🔍 Vérifications de sécurité :"

# Vérifier manifest.json
if unzip -l lucid-chrome-store.zip | grep -q "manifest.json"; then
  echo "✅ manifest.json présent"
else
  echo "❌ ERREUR : manifest.json MANQUANT"
  exit 1
fi

# Vérifier icônes
if unzip -l lucid-chrome-store.zip | grep -q "icons/icon128.png"; then
  echo "✅ Icônes présentes"
else
  echo "⚠️  Warning: Vérifier les icônes (icon16, 32, 48, 128)"
fi

# Vérifier dist/
if unzip -l lucid-chrome-store.zip | grep -q "dist/"; then
  echo "✅ Bundle dist/ présent"
else
  echo "❌ ERREUR : dist/ folder manquant - exécutez 'npm run build' d'abord"
  exit 1
fi

# Vérifier qu'aucun fichier de dev n'est inclus
echo ""
echo "🔒 Vérification absence fichiers de développement :"
if unzip -l lucid-chrome-store.zip | grep -q "package.json\|node_modules\|tsconfig\|vite.config"; then
  echo "⚠️  WARNING: Fichiers de développement détectés dans le package !"
else
  echo "✅ Pas de fichiers de développement"
fi

# Vérifier taille (ne doit pas dépasser 128 MB)
SIZE_BYTES=$(stat -f%z lucid-chrome-store.zip 2>/dev/null || stat -c%s lucid-chrome-store.zip)
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
if [ $SIZE_MB -gt 128 ]; then
  echo "❌ ERREUR : Package trop gros ($SIZE_MB MB > 128 MB limite Chrome)"
  exit 1
else
  echo "✅ Taille OK ($SIZE_MB MB < 128 MB)"
fi

echo ""
echo "🎉 Package prêt pour soumission au Chrome Web Store !"
echo ""
echo "📝 Prochaines étapes :"
echo "1. Vérifier que Privacy Policy est publiée : https://www.lucid.foundation/privacy"
echo "2. Préparer 3-5 screenshots (1280x800)"
echo "3. Aller sur https://chrome.google.com/webstore/devconsole/"
echo "4. Upload lucid-chrome-store.zip"
echo "5. Remplir les informations de listing"
echo ""
