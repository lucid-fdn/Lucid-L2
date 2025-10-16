# 🔧 n8n Quick Fix - Environment Variables Missing

## Problem

Docker compose shows warnings:
```
WARN: The "N8N_USER" variable is not set
WARN: The "N8N_PASSWORD" variable is not set
WARN: The "N8N_ENCRYPTION_KEY" variable is not set
```

**Postgres is restarting** - This means it's crashing due to missing DB_PASSWORD.

## Solution

You need to create the `.env` file with all required secrets.

### Step 1: Stop Everything

```bash
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose down
```

### Step 2: Generate Secrets & Create .env

```bash
# Generate secrets
ENCRYPTION_KEY=$(openssl rand -hex 32)
HMAC_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -base64 16)

# Create .env file
cat > .env << EOF
# n8n Basic Auth
N8N_USER=admin
N8N_PASSWORD=Lucid2025!SecurePassword

# Generated Secrets
N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
N8N_HMAC_SECRET=${HMAC_SECRET}
DB_PASSWORD=${DB_PASSWORD}
EOF

# Verify file was created
cat .env
```

### Step 3: Start n8n Again

```bash
docker compose up -d

# Wait 10 seconds for postgres to initialize
sleep 10

# Check status
docker compose ps
```

**Expected output:**
```
NAME                 STATUS
lucid-n8n            Up (healthy)
lucid-n8n-postgres   Up (healthy)
lucid-n8n-redis      Up (healthy)
```

### Step 4: Check Logs

```bash
# Check n8n logs
docker compose logs -f n8n

# Look for:
# ✅ "n8n ready on port 5678"
# ✅ "Editor is now accessible via: http://localhost:5678/"
```

### Step 5: Access n8n

```bash
# Your EC2 public IP (from your screenshot)
# http://54.204.114.86:5678

# Or find it with:
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

**Open in browser:**
- URL: `http://54.204.114.86:5678`
- Username: `admin`
- Password: `Lucid2025!SecurePassword`

## If Still Not Working

### Check Postgres Logs

```bash
docker compose logs postgres

# Look for errors like:
# - "password authentication failed"
# - "database does not exist"
```

### Restart Everything Fresh

```bash
# Stop and remove volumes (WARNING: This deletes data!)
docker compose down -v

# Start fresh
docker compose up -d

# Watch logs
docker compose logs -f
```

### Check Port Binding

```bash
# Should show 0.0.0.0:5678
sudo netstat -tulpn | grep 5678
```

## Security Warning

⚠️ Your security group shows port 5678 open to **0.0.0.0/0** (everyone)!

**To fix:**
1. AWS Console → EC2 → Security Groups
2. Edit the rule for port 5678
3. Change Source from `0.0.0.0/0` to **Your IP only**
4. Save

## Quick Commands

```bash
# Stop n8n
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose down

# Start n8n
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps

# Restart just n8n (not postgres)
docker compose restart n8n

# Remove everything and start fresh
docker compose down -v && docker compose up -d
```

## Copy-Paste Solution

Here's the complete fix in one command block:

```bash
# Navigate to n8n directory
cd /home/admin/Lucid/Lucid-L2/n8n

# Stop everything
docker compose down

# Create .env file with generated secrets
cat > .env << 'EOF'
# n8n Basic Auth
N8N_USER=admin
N8N_PASSWORD=Lucid2025!SecurePassword

# Generated Secrets (paste your own from: openssl rand -hex 32)
N8N_ENCRYPTION_KEY=YOUR_ENCRYPTION_KEY_HERE
N8N_HMAC_SECRET=YOUR_HMAC_SECRET_HERE
DB_PASSWORD=YOUR_DB_PASSWORD_HERE
EOF

# Now edit the file and paste actual secrets:
nano .env

# Generate secrets to paste:
echo "Encryption Key: $(openssl rand -hex 32)"
echo "HMAC Secret: $(openssl rand -hex 32)"
echo "DB Password: $(openssl rand -base64 16)"

# After editing .env, start services:
docker compose up -d

# Wait and check:
sleep 15
docker compose ps
docker compose logs n8n | tail -20
```

---

**Once .env is configured properly, all three containers should be "Up (healthy)"!**
