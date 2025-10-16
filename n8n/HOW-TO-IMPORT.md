# 📥 How to Import Workflows in n8n UI

## Quick Guide

Looking at your n8n UI, here's how to import workflows:

### Method 1: Using the Menu Button (Recommended)

1. Look at the **top right** of the screen
2. Next to the **"Create Workflow"** button (orange), you should see a **dropdown arrow** or **three dots (...)**
3. Click on the **dropdown arrow** next to "Create Workflow"
4. Select **"Import from file"** or **"Import from URL"**
5. Choose **"Import from file"**
6. Browse to the workflow JSON file
7. Click **"Open"**

### Method 2: Settings Menu

1. Click the **three-line menu icon** (hamburger menu) in the **top left corner**
2. Look for **"Settings"** or **"Import"** option
3. Select **"Import workflow"**
4. Choose your file

### Method 3: Drag and Drop (If Available)

1. Open your file explorer on EC2
2. Navigate to `/home/admin/Lucid/Lucid-L2/n8n/workflows/`
3. Simply **drag the JSON file** into the n8n browser window

## 🎯 Files to Import

You need to import these 3 files (in order):

1. `/home/admin/Lucid/Lucid-L2/n8n/workflows/gateway.json`
2. `/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/llm-proxy-adapter.json`
3. `/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/solana-write-adapter.json`

## 🔍 Can't Find Import Option?

### Try This:

**Option A: Use the API to Import**

Since you're on the EC2 server, we can import via command line:

```bash
# Copy workflow files to a location accessible from browser
cd /home/admin/Lucid/Lucid-L2/n8n/workflows

# Or use curl to import directly (requires n8n API key)
# First, get API key from n8n UI: Settings → API → Create API Key
```

**Option B: Manual Copy-Paste**

1. Click **"Create Workflow"** (orange button top right)
2. This opens a new workflow editor
3. Click on the **three dots menu** in the workflow editor
4. Look for **"Import from file"** or **"JSON"** option
5. If you see **"Code"** or **"JSON"** view, you can paste the content

Let me create a helper script to make this easier...

## 🚀 Quick Import Script

Run this on your EC2 server:

```bash
cd /home/admin/Lucid/Lucid-L2/n8n

# Show the workflow JSON content (you can copy-paste into n8n)
echo "==== GATEWAY WORKFLOW ===="
cat workflows/gateway.json

echo ""
echo "==== LLM PROXY ADAPTER ===="
cat workflows/adapters/llm-proxy-adapter.json

echo ""
echo "==== SOLANA WRITE ADAPTER ===="
cat workflows/adapters/solana-write-adapter.json
```

Then:
1. Copy the JSON content
2. In n8n UI → Create new workflow
3. Find import/paste option
4. Paste the JSON

## 📱 Alternative: Access Files from Browser

Since you're accessing n8n at `http://54.204.114.86:5678`, you can:

1. Open a **new terminal on your local machine**
2. Copy files from EC2 to your local machine:

```bash
# From your local machine:
scp -i your-key.pem admin@54.204.114.86:/home/admin/Lucid/Lucid-L2/n8n/workflows/gateway.json ./
scp -i your-key.pem admin@54.204.114.86:/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/llm-proxy-adapter.json ./
scp -i your-key.pem admin@54.204.114.86:/home/admin/Lucid/Lucid-L2/n8n/workflows/adapters/solana-write-adapter.json ./
```

3. Then import these local files into n8n UI

## 🎯 Expected UI Elements

In n8n, you should see:

- **Top Right:** "Create Workflow" button (orange)
- **Next to it:** A dropdown or "..." menu
- **In that menu:** "Import from file" or "Import from URL"

If you don't see this, try:
- Refreshing the page
- Clicking around the UI
- Looking for a settings/menu icon

## ✅ After Import

Once imported, each workflow will:
1. Open in the editor
2. Show you the workflow diagram
3. Have a "Save" button (top right)
4. Have an "Active" toggle switch (turn it ON!)

---

**Still can't find it?** Let me know what you see in the top right corner of your n8n UI, and I'll help you locate the import option!
