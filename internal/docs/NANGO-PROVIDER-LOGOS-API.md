# Nango Provider Logos API

## ✅ Yes, Nango Exposes Provider Logos via HTTP!

Nango serves all provider logos through its web interface, which is accessible via your public URL.

---

## 📡 API Endpoint

### Public URL Format
```
https://api.lucid.foundation/nango/images/template-logos/{provider}.svg
```

### Local Development URL Format
```
http://localhost:3007/images/template-logos/{provider}.svg
```

---

## 🎨 Available Provider Logos

### Twitter/X
```
https://api.lucid.foundation/nango/images/template-logos/twitter.svg
https://api.lucid.foundation/nango/images/template-logos/twitter-v2.svg
```

Both files are identical (1,181 bytes, blue Twitter bird logo).

### Other Popular Providers
```
# Social
https://api.lucid.foundation/nango/images/template-logos/facebook.svg
https://api.lucid.foundation/nango/images/template-logos/instagram.svg
https://api.lucid.foundation/nango/images/template-logos/linkedin.svg
https://api.lucid.foundation/nango/images/template-logos/reddit.svg
https://api.lucid.foundation/nango/images/template-logos/youtube.svg

# Developer Tools
https://api.lucid.foundation/nango/images/template-logos/github.svg
https://api.lucid.foundation/nango/images/template-logos/gitlab.svg
https://api.lucid.foundation/nango/images/template-logos/bitbucket.svg

# Communication
https://api.lucid.foundation/nango/images/template-logos/slack.svg
https://api.lucid.foundation/nango/images/template-logos/discord.svg
https://api.lucid.foundation/nango/images/template-logos/microsoft-teams.svg
https://api.lucid.foundation/nango/images/template-logos/zoom.svg

# Productivity
https://api.lucid.foundation/nango/images/template-logos/google.svg
https://api.lucid.foundation/nango/images/template-logos/google-drive.svg
https://api.lucid.foundation/nango/images/template-logos/google-calendar.svg
https://api.lucid.foundation/nango/images/template-logos/notion.svg
https://api.lucid.foundation/nango/images/template-logos/asana.svg
https://api.lucid.foundation/nango/images/template-logos/trello.svg
https://api.lucid.foundation/nango/images/template-logos/monday.svg

# CRM & Sales
https://api.lucid.foundation/nango/images/template-logos/salesforce.svg
https://api.lucid.foundation/nango/images/template-logos/hubspot.svg
https://api.lucid.foundation/nango/images/template-logos/pipedrive.svg

# And 100+ more...
```

---

## 📋 Response Details

### Headers
- **Content-Type:** `image/svg+xml`
- **Cache-Control:** `public, max-age=14400` (4 hours)
- **Access-Control-Allow-Origin:** `*` (CORS enabled)
- **Server:** Cloudflare (via your reverse proxy)

### File Size
Most logos are between 500 bytes and 15 KB.

---

## 🔧 Usage in Your Application

### Direct Reference in HTML
```html
<img src="https://api.lucid.foundation/nango/images/template-logos/twitter.svg" 
     alt="Twitter" 
     width="24" 
     height="24" />
```

### In React/Next.js
```jsx
const ProviderLogo = ({ provider }) => (
  <img
    src={`https://api.lucid.foundation/nango/images/template-logos/${provider}.svg`}
    alt={provider}
    className="w-6 h-6"
  />
);

// Usage
<ProviderLogo provider="twitter" />
```

### In Your nangoService.ts
Update the SUPPORTED_PROVIDERS to use Nango's logo URLs:

```typescript
export const SUPPORTED_PROVIDERS: OAuthProvider[] = [
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: 'https://api.lucid.foundation/nango/images/template-logos/twitter.svg',
    requiredScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    category: 'social'
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'https://api.lucid.foundation/nango/images/template-logos/discord.svg',
    requiredScopes: ['identify', 'guilds', 'messages.write'],
    category: 'communication'
  },
  // ... etc
];
```

---

## 📦 Complete Provider List (100+ logos)

<details>
<summary>Click to expand full list</summary>

- accelo.svg
- adobe.svg
- aircall.svg
- airtable.svg
- amazon.svg
- amplitude.svg
- apollo.svg
- asana.svg
- ashby.svg
- atlassian.svg
- auth0.svg
- bamboohr.svg
- battlenet.svg
- bitbucket.svg
- blackbaud.svg
- box.svg
- braintree-sandbox.svg
- braintree.svg
- brex-staging.svg
- brex.svg
- calendly.svg
- clickup.svg
- coda.svg
- confluence.svg
- contentstack.svg
- digitalocean.svg
- discord.svg
- dropbox.svg
- epic-games.svg
- eventbrite.svg
- facebook.svg
- factorial.svg
- fitbit.svg
- freshbooks.svg
- front.svg
- github-app.svg
- github.svg
- gitlab.svg
- gong-oauth.svg
- gong.svg
- google-calendar.svg
- google-drive.svg
- google-mail.svg
- google-sheet.svg
- google.svg
- greenhouse.svg
- highlevel.svg
- hubspot.svg
- instagram.svg
- intercom.svg
- intuit.svg
- jira.svg
- level.svg
- linear.svg
- linkedin.svg
- microsoft-teams.svg
- mixpanel.svg
- monday.svg
- notion.svg
- okta.svg
- outreach.svg
- pagerduty.svg
- paypal-sandbox.svg
- paypal.svg
- pipedrive.svg
- quickbooks.svg
- ramp-sandbox.svg
- ramp.svg
- reddit.svg
- sage.svg
- salesforce-sandbox.svg
- salesforce.svg
- salesloft.svg
- sendgrid.svg
- servicenow.svg
- shopify.svg
- shortcut.svg
- slack.svg
- smugmug.svg
- splitwise.svg
- spotify.svg
- stackexchange.svg
- stripe-express.svg
- stripe.svg
- timely.svg
- trello.svg
- twitter-v2.svg
- twitter.svg
- wakatime.svg
- wave-accounting.svg
- wildix-pbx.svg
- xero.svg
- yahoo.svg
- youtube.svg
- zapier-nla.svg
- zendesk.svg
- zoho-books.svg
- zoho-crm.svg
- zoho-desk.svg
- zoho-inventory.svg
- zoho-invoices.svg
- zoom.svg

</details>

---

## 🚀 Benefits

1. **No storage needed** - Direct reference to Nango's hosted logos
2. **CORS enabled** - Can be used in frontend apps
3. **Cached** - 4-hour cache for performance
4. **CDN delivery** - Served through Cloudflare for fast global access
5. **Always up-to-date** - Nango maintains the logos
6. **Consistent branding** - Official provider logos

---

## 💡 Recommendation

Update your `nangoService.ts` to use these URLs instead of local `/icons/` paths. This ensures consistency with Nango's provider list and saves you from managing icon assets.
