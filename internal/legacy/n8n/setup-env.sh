#!/bin/bash
# n8n Environment Setup Script

echo "🔧 Setting up n8n environment..."
echo ""

# Generate secrets
echo "📝 Generating secure secrets..."
ENCRYPTION_KEY=$(openssl rand -hex 32)
HMAC_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -base64 16)

# Create .env file
echo "✍️  Creating .env file..."
cat > .env << EOF
# n8n Basic Auth
N8N_USER=admin
N8N_PASSWORD=Lucid2025!SecurePassword

# Generated Secrets
N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
N8N_HMAC_SECRET=${HMAC_SECRET}
DB_PASSWORD=${DB_PASSWORD}
EOF

echo "✅ .env file created!"
echo ""
echo "📋 Your credentials:"
echo "   Username: admin"
echo "   Password: Lucid2025!SecurePassword"
echo ""
echo "🔐 Generated secrets (saved in .env):"
echo "   Encryption Key: ${ENCRYPTION_KEY:0:20}..."
echo "   HMAC Secret: ${HMAC_SECRET:0:20}..."
echo "   DB Password: ${DB_PASSWORD:0:10}..."
echo ""
echo "⚠️  IMPORTANT: Copy the HMAC Secret to offchain/.env"
echo "   N8N_HMAC_SECRET=${HMAC_SECRET}"
echo ""
echo "🚀 Next steps:"
echo "   1. docker compose up -d"
echo "   2. Wait 15 seconds for postgres to initialize"
echo "   3. docker compose ps (check all are healthy)"
echo "   4. Open http://54.204.114.86:5678"
echo ""
