import express from 'express';
import { Nango } from '@nangohq/node';
import { verifyPrivyToken, PrivyRequest } from '../../middleware/privyAuth';
import { PROVIDER_TO_NANGO_MAP } from '../../contrib/integrations/oauth/nangoService';

const router = express.Router();

const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY!,
  host: process.env.NANGO_API_URL || 'http://localhost:3003'
});

type Option = { name: string; value: string };

type ResourceConfig = {
  endpoint: string;
  method: 'GET' | 'POST';
  transform: (data: any) => Option[];
  requiredParams?: string[];
};

const RESOURCE_ENDPOINTS: Record<string, Record<string, ResourceConfig>> = {
  twitter: {
    lists: {
      endpoint: '/2/users/me/owned_lists',
      method: 'GET',
      transform: (data) => data?.data?.map((l: any) => ({ name: l.name, value: l.id })) || []
    }
  },
  airtable: {
    bases: {
      endpoint: '/v0/meta/bases',
      method: 'GET',
      transform: (data) => data?.bases?.map((b: any) => ({ name: b.name, value: b.id })) || []
    },
    tables: {
      endpoint: '/v0/meta/bases/:baseId/tables',
      requiredParams: ['baseId'],
      method: 'GET',
      transform: (data) => data?.tables?.map((t: any) => ({ name: t.name, value: t.id })) || []
    }
  },
  slack: {
    channels: {
      endpoint: '/conversations.list',
      method: 'GET',
      transform: (data) => data?.channels?.map((c: any) => ({ name: `#${c.name}`, value: c.id })) || []
    }
  },
  'google-sheets': {
    spreadsheets: {
      endpoint: '/drive/v3/files?q=mimeType="application/vnd.google-apps.spreadsheet"',
      method: 'GET',
      transform: (data) => data?.files?.map((f: any) => ({ name: f.name, value: f.id })) || []
    }
  }
};

function substituteEndpoint(endpoint: string, params: URLSearchParams): string {
  return endpoint.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = params.get(key);
    if (!value) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
}

// All routes require Privy auth
router.use((req, res, next) => verifyPrivyToken(req as PrivyRequest, res, next));

/**
 * GET /api/oauth/:provider/resources/:resource
 * Fetch resource lists (dynamic dropdown options) via Nango Proxy.
 * Query params:
 * - connectionId (required): the Nango connectionId representing the chosen account
 * - additional params for endpoint substitution (e.g. baseId)
 */
router.get('/:provider/resources/:resource', async (req: PrivyRequest, res) => {
  const { provider, resource } = req.params;
  const params = req.query as Record<string, string | undefined>;

  const connectionId = params.connectionId;
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId required', options: [] });
  }

  const resourceConfig = RESOURCE_ENDPOINTS[provider]?.[resource];
  if (!resourceConfig) {
    return res.status(404).json({ error: 'Unknown resource', options: [] });
  }

  try {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string') {
        searchParams.set(k, v);
      }
    }

    // Validate required params
    for (const key of resourceConfig.requiredParams || []) {
      if (!searchParams.get(key)) {
        return res.status(400).json({ error: `${key} required`, options: [] });
      }
    }

    const endpoint = substituteEndpoint(resourceConfig.endpoint, searchParams);
    const integrationId = PROVIDER_TO_NANGO_MAP[provider] || provider;

    const response = await (nango as any).proxy({
      integrationId,
      connectionId,
      method: resourceConfig.method,
      endpoint
    });

    const options = resourceConfig.transform(response?.data);

    return res.json({ options });
  } catch (error: any) {
    console.error(`[OAuth Resources] Error fetching ${provider}/${resource}:`, error);
    return res.status(500).json({ error: 'Failed to fetch options', options: [] });
  }
});

export const oauthResourcesRouter = router;
