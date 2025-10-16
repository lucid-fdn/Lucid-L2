# n8n Network Access Guide

## ✅ Current Configuration

Your n8n is **already listening on 0.0.0.0:5678**, which means it's accessible from:

1. **Localhost:** `http://localhost:5678`
2. **EC2 Private IP:** `http://<private-ip>:5678`
3. **EC2 Public IP:** `http://<public-ip>:5678` *(requires security group configuration)*

## 🔍 How to Verify

```bash
# Check the port binding
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose ps

# You'll see:
# PORTS
# 0.0.0.0:5678->5678/tcp

# The "0.0.0.0" means it's listening on all network interfaces
```

## 🌐 Accessing n8n Remotely

### Option 1: AWS Security Group (Recommended with IP Restriction)

**Steps:**

1. **Get Your Public IP:**
```bash
curl ifconfig.me
# Save this IP address
```

2. **AWS Console:**
   - Go to EC2 → Security Groups
   - Find your instance's security group
   - Click "Edit inbound rules"
   - Add rule:
     - **Type:** Custom TCP
     - **Port:** 5678
     - **Source:** My IP (or paste your IP: `<your-ip>/32`)
     - **Description:** n8n UI access
   - Save rules

3. **Access n8n:**
```bash
# Get your EC2 public IP
curl http://169.254.169.254/latest/meta-data/public-ipv4

# Open browser to:
http://<ec2-public-ip>:5678
```

### Option 2: SSH Tunnel (Most Secure)

If you want to keep port 5678 closed in security groups:

```bash
# From your local machine:
ssh -L 8080:localhost:5678 -i your-key.pem admin@<ec2-public-ip>

# Then access n8n on your local machine at:
# http://localhost:8080
```

### Option 3: Nginx Reverse Proxy with SSL (Production)

For production, use a reverse proxy with SSL:

```nginx
# /etc/nginx/sites-available/n8n
server {
    listen 80;
    server_name n8n.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then add SSL with Certbot:
```bash
sudo certbot --nginx -d n8n.yourdomain.com
```

## ⚠️ Security Warnings

### 🚨 NEVER expose n8n publicly without:

1. **Strong Authentication:**
   - Change default password in `.env`
   - Use strong password (20+ chars, mixed case, numbers, symbols)

2. **IP Restrictions:**
   - Limit security group to your IP only
   - Use VPN for team access
   - Never use `0.0.0.0/0` (all IPs)

3. **SSL/TLS:**
   - Use HTTPS in production
   - Never send credentials over HTTP on public internet

4. **Firewall:**
   - Only open port 5678 when needed
   - Consider SSH tunnel instead

## 🔒 Current Security Settings

Your n8n is protected by:

✅ **Basic Auth:** Username/password required (set in `.env`)
✅ **Private by default:** Port 5678 not in AWS security group yet
✅ **HMAC verification:** API requests signed
✅ **Docker network:** Internal services isolated

## 📊 Network Architecture

```
Internet
    ↓
AWS Security Group (Firewall)
    ↓ (if port 5678 allowed)
EC2 Instance (0.0.0.0:5678)
    ↓
Docker Bridge Network
    ↓
n8n Container (listening on 0.0.0.0:5678 inside container)
```

## 🧪 Testing Access

### Test 1: From EC2 Instance (Always Works)
```bash
curl http://localhost:5678/
# Should return HTML
```

### Test 2: From Outside (Requires Security Group)
```bash
# From your local machine:
curl http://<ec2-public-ip>:5678/
# If times out: Port blocked by security group
# If returns HTML: Port open and working
```

### Test 3: Check Docker Port Binding
```bash
# On EC2:
sudo netstat -tulpn | grep 5678
# Should show: 0.0.0.0:5678 (not 127.0.0.1:5678)
```

## 🛠️ Troubleshooting

### "Connection timeout" from outside

**Cause:** Security group blocking port 5678

**Solution:**
1. Add inbound rule for port 5678
2. Restrict to your IP only
3. Test: `curl http://<ec2-ip>:5678/`

### "Connection refused" from localhost

**Cause:** n8n not running

**Solution:**
```bash
cd /home/admin/Lucid/Lucid-L2/n8n
docker compose up -d
docker compose logs -f n8n
```

### Want to change to localhost-only?

If you want n8n to ONLY listen on localhost:

```yaml
# docker-compose.yml
services:
  n8n:
    ports:
      - "127.0.0.1:5678:5678"  # Add 127.0.0.1 prefix
```

Then:
```bash
docker compose down
docker compose up -d
```

## 📝 Recommendations

**For Development (Current Setup):**
- ✅ Keep 0.0.0.0:5678 (allows remote access)
- ✅ Use SSH tunnel or restrict security group to your IP
- ✅ Strong password in `.env`

**For Production:**
- Use Nginx reverse proxy with SSL
- Domain name (n8n.yourdomain.com)
- Let's Encrypt SSL certificate
- VPN for team access
- CloudFlare for DDoS protection

## 🎯 Quick Access Methods

| Method | Security | Ease | Best For |
|--------|----------|------|----------|
| localhost:5678 | ✅ High | ✅ Easy | On EC2 directly |
| SSH Tunnel | ✅ High | 🟡 Medium | Remote development |
| Security Group + Your IP | 🟡 Medium | ✅ Easy | Quick testing |
| Nginx + SSL + Domain | ✅ High | 🔴 Complex | Production |

## 🚀 Quick Start

**To access n8n from your computer right now:**

1. **Get EC2 public IP:**
```bash
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

2. **Add security group rule:**
   - Port: 5678
   - Source: Your IP only

3. **Open browser:**
```
http://<ec2-public-ip>:5678
```

4. **Login:**
   - Username: Value of `N8N_USER` from `.env`
   - Password: Value of `N8N_PASSWORD` from `.env`

---

**Your n8n is already listening on 0.0.0.0:5678 - you just need to configure AWS security groups to access it remotely!** 🎉
