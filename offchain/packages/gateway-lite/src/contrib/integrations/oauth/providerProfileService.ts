export interface ProviderProfile {
  username?: string;
  screen_name?: string;
  name?: string;
  display_name?: string;
  email?: string;
  profile_image_url?: string;
  avatar_url?: string;
  [key: string]: any;
}

export interface NormalizedProfile {
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

/**
 * Fetch a provider profile using the provider's API and an access token.
 *
 * Currently implemented: twitter (X) via Twitter API v2.
 */
export async function fetchProviderProfile(provider: string, accessToken: string): Promise<ProviderProfile> {
  if (!accessToken) {
    throw new Error('Missing access token');
  }

  switch (provider) {
    case 'twitter': {
      // Twitter API v2: GET /2/users/me
      // Need profile_image_url field explicitly.
      const url = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url';
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Twitter profile fetch failed: ${res.status} ${res.statusText} ${text}`);
      }

      const json: any = await res.json();
      // twitter v2 returns { data: { id, name, username, profile_image_url } }
      return json?.data || json;
    }

    default:
      throw new Error(`fetchProviderProfile not implemented for provider: ${provider}`);
  }
}

export function normalizeProfile(profile: ProviderProfile): NormalizedProfile {
  return {
    username: (profile.username || profile.screen_name) ?? null,
    displayName: (profile.name || profile.display_name) ?? null,
    email: profile.email ?? null,
    avatarUrl: (profile.profile_image_url || profile.avatar_url) ?? null
  };
}
