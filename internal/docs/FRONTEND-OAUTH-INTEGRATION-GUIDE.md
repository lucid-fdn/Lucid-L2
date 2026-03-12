# Guide d'Intégration OAuth Frontend - Vite/React

**Date:** 10 Novembre 2025  
**Pour:** Développeur Frontend  
**Stack:** Vite + React + TypeScript  
**Authentification Privy:** ✅ Déjà intégrée  

---

## 📋 Vue d'Ensemble

Ce guide vous permet d'ajouter la fonctionnalité de connexion de services externes (Twitter, Discord, Telegram, etc.) à l'application. Les utilisateurs pourront connecter leurs comptes pour permettre à l'application d'effectuer des actions en leur nom via n8n.

### Ce que vous allez implémenter

1. **Page de gestion des connexions OAuth**
2. **Boutons "Connecter [Service]"**
3. **Gestion du callback OAuth**
4. **Affichage des connexions actives**
5. **Possibilité de déconnecter un service**

---

## 🏗️ Architecture

```
Frontend (React)
    ↓ API Call avec Privy JWT
Backend (Express + Nango)
    ↓ Gère OAuth
Services Externes (Twitter, Discord, etc.)
```

**Important:** L'utilisateur doit être authentifié avec Privy AVANT de pouvoir connecter des services.

---

## 🔌 API Endpoints Disponibles

### Base URL
```
http://localhost:3001/api/oauth
```

### 1. Liste des Providers Disponibles

**Endpoint:** `GET /api/oauth/providers`  
**Auth:** ❌ Non requis (endpoint public)

**Response:**
```json
{
  "providers": [
    {
      "id": "twitter",
      "name": "Twitter / X",
      "description": "Connect your Twitter account",
      "icon": "🐦",
      "requiredScopes": ["tweet.read", "tweet.write", "users.read", "offline.access"]
    },
    {
      "id": "discord",
      "name": "Discord",
      "description": "Connect your Discord account",
      "icon": "💬",
      "requiredScopes": ["identify", "guilds", "messages.write"]
    },
    {
      "id": "telegram",
      "name": "Telegram",
      "description": "Connect your Telegram account",
      "icon": "✈️",
      "requiredScopes": ["bot"]
    },
    {
      "id": "binance",
      "name": "Binance",
      "description": "Connect your Binance account",
      "icon": "🔶",
      "requiredScopes": ["spot:read", "spot:trade"]
    },
    {
      "id": "coinbase",
      "name": "Coinbase",
      "description": "Connect your Coinbase account",
      "icon": "🔵",
      "requiredScopes": ["wallet:accounts:read", "wallet:transactions:send"]
    }
  ],
  "timestamp": "2025-11-10T15:00:00.000Z"
}
```

### 2. Initier une Connexion OAuth

**Endpoint:** `POST /api/oauth/:provider/initiate`  
**Auth:** ✅ Privy JWT requis

**Exemple:**
```typescript
// Initier connexion Twitter
POST /api/oauth/twitter/initiate
Headers: {
  'Authorization': 'Bearer <PRIVY_JWT>',
  'Content-Type': 'application/json'
}
```

**Response:**
```json
{
  "authUrl": "https://twitter.com/i/oauth2/authorize?client_id=...",
  "state": "unique-state-string",
  "provider": "Twitter / X",
  "scopes": ["tweet.read", "tweet.write", "users.read"],
  "expiresIn": 300
}
```

**Action:** Rediriger l'utilisateur vers `authUrl`

### 3. Liste des Connexions de l'Utilisateur

**Endpoint:** `GET /api/oauth/connections`  
**Auth:** ✅ Privy JWT requis

**Response:**
```json
{
  "connections": [
    {
      "provider": "twitter",
      "providerName": "Twitter / X",
      "connectedAt": "2025-11-10T14:30:00.000Z",
      "isActive": true,
      "username": "alice_crypto",
      "expiresAt": "2025-12-10T14:30:00.000Z"
    },
    {
      "provider": "discord",
      "providerName": "Discord",
      "connectedAt": "2025-11-09T10:00:00.000Z",
      "isActive": true,
      "username": "alice#1234",
      "expiresAt": null
    }
  ],
  "count": 2,
  "timestamp": "2025-11-10T15:00:00.000Z"
}
```

### 4. Statistiques d'Utilisation

**Endpoint:** `GET /api/oauth/connections/:provider/stats`  
**Auth:** ✅ Privy JWT requis

**Response:**
```json
{
  "provider": "twitter",
  "stats": {
    "totalCalls": 156,
    "last24Hours": 23,
    "lastUsed": "2025-11-10T14:45:00.000Z",
    "successRate": 98.7
  },
  "timestamp": "2025-11-10T15:00:00.000Z"
}
```

### 5. Déconnecter un Service

**Endpoint:** `DELETE /api/oauth/:provider`  
**Auth:** ✅ Privy JWT requis

**Exemple:**
```typescript
DELETE /api/oauth/twitter
Headers: {
  'Authorization': 'Bearer <PRIVY_JWT>'
}
```

**Response:**
```json
{
  "success": true,
  "message": "twitter connection revoked successfully",
  "provider": "twitter",
  "timestamp": "2025-11-10T15:00:00.000Z"
}
```

---

## 🛠️ Implémentation Frontend

### 1. Service API (`src/services/oauthService.ts`)

Créez ce fichier pour gérer toutes les interactions avec l'API OAuth:

```typescript
// src/services/oauthService.ts
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface OAuthProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiredScopes: string[];
}

export interface OAuthConnection {
  provider: string;
  providerName: string;
  connectedAt: string;
  isActive: boolean;
  username?: string;
  expiresAt?: string | null;
}

export interface ConnectionStats {
  totalCalls: number;
  last24Hours: number;
  lastUsed: string | null;
  successRate: number;
}

class OAuthService {
  /**
   * Récupère la liste des providers OAuth disponibles
   * Pas d'authentification requise
   */
  async getProviders(): Promise<OAuthProvider[]> {
    const response = await axios.get(`${API_BASE_URL}/api/oauth/providers`);
    return response.data.providers;
  }

  /**
   * Initie le flux OAuth pour un provider
   * Requiert un token Privy valide
   */
  async initiateOAuth(provider: string, privyToken: string): Promise<string> {
    const response = await axios.post(
      `${API_BASE_URL}/api/oauth/${provider}/initiate`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${privyToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.authUrl;
  }

  /**
   * Récupère les connexions OAuth de l'utilisateur
   * Requiert un token Privy valide
   */
  async getConnections(privyToken: string): Promise<OAuthConnection[]> {
    const response = await axios.get(
      `${API_BASE_URL}/api/oauth/connections`,
      {
        headers: {
          'Authorization': `Bearer ${privyToken}`
        }
      }
    );
    
    return response.data.connections;
  }

  /**
   * Récupère les statistiques d'une connexion
   * Requiert un token Privy valide
   */
  async getConnectionStats(
    provider: string,
    privyToken: string
  ): Promise<ConnectionStats> {
    const response = await axios.get(
      `${API_BASE_URL}/api/oauth/connections/${provider}/stats`,
      {
        headers: {
          'Authorization': `Bearer ${privyToken}`
        }
      }
    );
    
    return response.data.stats;
  }

  /**
   * Déconnecte un provider OAuth
   * Requiert un token Privy valide
   */
  async disconnectProvider(provider: string, privyToken: string): Promise<void> {
    await axios.delete(
      `${API_BASE_URL}/api/oauth/${provider}`,
      {
        headers: {
          'Authorization': `Bearer ${privyToken}`
        }
      }
    );
  }
}

export const oauthService = new OAuthService();
```

### 2. Hook Personnalisé (`src/hooks/useOAuth.ts`)

Hook React pour gérer l'état OAuth:

```typescript
// src/hooks/useOAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { oauthService, OAuthProvider, OAuthConnection } from '../services/oauthService';

export const useOAuth = () => {
  const { getAccessToken, authenticated } = usePrivy();
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les providers disponibles (public)
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await oauthService.getProviders();
      setProviders(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load providers');
      console.error('Error loading providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les connexions de l'utilisateur (requiert auth)
  const loadConnections = useCallback(async () => {
    if (!authenticated) {
      setConnections([]);
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) throw new Error('No access token');
      
      const data = await oauthService.getConnections(token);
      setConnections(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load connections');
      console.error('Error loading connections:', err);
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);

  // Initier une connexion OAuth
  const connectProvider = useCallback(async (providerId: string) => {
    if (!authenticated) {
      throw new Error('Please login first');
    }

    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) throw new Error('No access token');

      const authUrl = await oauthService.initiateOAuth(providerId, token);
      
      // Rediriger vers la page d'autorisation OAuth
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate OAuth');
      console.error('Error connecting provider:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);

  // Déconnecter un provider
  const disconnectProvider = useCallback(async (providerId: string) => {
    if (!authenticated) {
      throw new Error('Please login first');
    }

    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) throw new Error('No access token');

      await oauthService.disconnectProvider(providerId, token);
      
      // Recharger les connexions
      await loadConnections();
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect provider');
      console.error('Error disconnecting provider:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, loadConnections]);

  // Vérifier si un provider est connecté
  const isConnected = useCallback((providerId: string): boolean => {
    return connections.some(conn => conn.provider === providerId && conn.isActive);
  }, [connections]);

  // Charger les données au montage
  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (authenticated) {
      loadConnections();
    }
  }, [authenticated, loadConnections]);

  return {
    providers,
    connections,
    loading,
    error,
    connectProvider,
    disconnectProvider,
    isConnected,
    refreshConnections: loadConnections
  };
};
```

### 3. Composant Provider Card (`src/components/ProviderCard.tsx`)

Composant pour afficher chaque provider:

```typescript
// src/components/ProviderCard.tsx
import React from 'react';
import { OAuthProvider } from '../services/oauthService';

interface ProviderCardProps {
  provider: OAuthProvider;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isConnected,
  onConnect,
  onDisconnect,
  loading = false
}) => {
  return (
    <div className="provider-card">
      <div className="provider-header">
        <span className="provider-icon">{provider.icon}</span>
        <h3>{provider.name}</h3>
      </div>
      
      <p className="provider-description">{provider.description}</p>
      
      <div className="provider-scopes">
        <small>Permissions requises:</small>
        <ul>
          {provider.requiredScopes.map(scope => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      </div>

      <div className="provider-actions">
        {isConnected ? (
          <>
            <span className="status-badge connected">✓ Connecté</span>
            <button
              onClick={onDisconnect}
              disabled={loading}
              className="btn-secondary"
            >
              {loading ? 'Déconnexion...' : 'Déconnecter'}
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Connexion...' : `Connecter ${provider.name}`}
          </button>
        )}
      </div>
    </div>
  );
};
```

### 4. Page Principale OAuth (`src/pages/OAuthConnections.tsx`)

Page complète de gestion des connexions:

```typescript
// src/pages/OAuthConnections.tsx
import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useOAuth } from '../hooks/useOAuth';
import { ProviderCard } from '../components/ProviderCard';

export const OAuthConnections: React.FC = () => {
  const { authenticated, login } = usePrivy();
  const {
    providers,
    connections,
    loading,
    error,
    connectProvider,
    disconnectProvider,
    isConnected
  } = useOAuth();

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const handleConnect = async (providerId: string) => {
    try {
      setConnectingProvider(providerId);
      await connectProvider(providerId);
    } catch (err) {
      console.error('Connection failed:', err);
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir déconnecter ce service ?`)) {
      return;
    }

    try {
      setConnectingProvider(providerId);
      await disconnectProvider(providerId);
    } catch (err) {
      console.error('Disconnection failed:', err);
    } finally {
      setConnectingProvider(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="oauth-page">
        <h1>Connecter vos Services</h1>
        <p>Vous devez être connecté pour gérer vos connexions.</p>
        <button onClick={login} className="btn-primary">
          Se Connecter avec Privy
        </button>
      </div>
    );
  }

  return (
    <div className="oauth-page">
      <header className="page-header">
        <h1>Vos Connexions OAuth</h1>
        <p>
          Connectez vos comptes pour permettre à nos workflows automatisés
          d'agir en votre nom.
        </p>
      </header>

      {error && (
        <div className="alert alert-error">
          <strong>Erreur:</strong> {error}
        </div>
      )}

      {connections.length > 0 && (
        <section className="connected-services">
          <h2>Services Connectés ({connections.length})</h2>
          <div className="connections-list">
            {connections.map(conn => (
              <div key={conn.provider} className="connection-item">
                <div className="connection-info">
                  <strong>{conn.providerName}</strong>
                  {conn.username && <span>@{conn.username}</span>}
                  <small>
                    Connecté le {new Date(conn.connectedAt).toLocaleDateString('fr-FR')}
                  </small>
                </div>
                <span className={`status ${conn.isActive ? 'active' : 'inactive'}`}>
                  {conn.isActive ? '● Actif' : '○ Inactif'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="available-providers">
        <h2>Services Disponibles</h2>
        {loading && providers.length === 0 ? (
          <div className="loading">Chargement des services...</div>
        ) : (
          <div className="providers-grid">
            {providers.map(provider => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isConnected={isConnected(provider.id)}
                onConnect={() => handleConnect(provider.id)}
                onDisconnect={() => handleDisconnect(provider.id)}
                loading={connectingProvider === provider.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
```

### 5. Gestionnaire de Callback OAuth (`src/pages/OAuthCallback.tsx`)

Page pour gérer le retour de l'autorisation OAuth:

```typescript
// src/pages/OAuthCallback.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Récupérer les paramètres de l'URL
    const oauthSuccess = searchParams.get('oauth_success');
    const oauthError = searchParams.get('oauth_error');
    const errorMessage = searchParams.get('message');

    if (oauthSuccess) {
      setStatus('success');
      setMessage(`${oauthSuccess} connecté avec succès !`);
      
      // Rediriger vers la page OAuth après 2 secondes
      setTimeout(() => {
        navigate('/connections');
      }, 2000);
    } else if (oauthError) {
      setStatus('error');
      setMessage(errorMessage || `Erreur: ${oauthError}`);
      
      // Rediriger après 5 secondes
      setTimeout(() => {
        navigate('/connections');
      }, 5000);
    } else {
      // Pas de paramètres OAuth, rediriger immédiatement
      navigate('/connections');
    }
  }, [searchParams, navigate]);

  return (
    <div className="oauth-callback">
      {status === 'loading' && (
        <div className="callback-loading">
          <div className="spinner"></div>
          <p>Finalisation de la connexion...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="callback-success">
          <div className="success-icon">✓</div>
          <h2>Connexion Réussie !</h2>
          <p>{message}</p>
          <p className="redirect-message">
            Redirection automatique vers vos connexions...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="callback-error">
          <div className="error-icon">✗</div>
          <h2>Erreur de Connexion</h2>
          <p>{message}</p>
          <button onClick={() => navigate('/connections')} className="btn-primary">
            Retour aux Connexions
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## 🎨 Styles CSS Suggérés

```css
/* src/styles/oauth.css */

.oauth-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.page-header p {
  color: #666;
  font-size: 1.1rem;
}

/* Alerts */
.alert {
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.alert-error {
  background-color: #fee;
  border: 1px solid #fcc;
  color: #c33;
}

/* Connected Services */
.connected-services {
  margin-bottom: 3rem;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.connection-info strong {
  font-size: 1.1rem;
}

.connection-info small {
  color: #666;
  font-size: 0.85rem;
}

.status {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
}

.status.active {
  color: #22c55e;
}

.status.inactive {
  color: #999;
}

/* Providers Grid */
.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.provider-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: box-shadow 0.2s;
}

.provider-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.provider-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.provider-icon {
  font-size: 2rem;
}

.provider-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.provider-description {
  color: #666;
  font-size: 0.95rem;
  margin: 0;
}

.provider-scopes {
  font-size: 0.85rem;
}

.provider-scopes ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.provider-scopes li {
  background: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
}

.provider-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
}

.status-badge.connected {
  background-color: #dcfce7;
  color: #16a34a;
}

/* Buttons */
.btn-primary {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-secondary {
  background-color: transparent;
  color: #666;
  border: 1px solid #e0e0e0;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #f5f5f5;
  border-color: #ccc;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* OAuth Callback */
.oauth-callback {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 2rem;
}

.callback-loading,
.callback-success,
.callback-error {
  text-align: center;
  max-width: 400px;
}

.success-icon,
.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.success-icon {
  color: #22c55e;
}

.error-icon {
  color: #ef4444;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.redirect-message {
  color: #666;
  font-size: 0.9rem;
  margin-top: 1rem;
}

/* Loading State */
.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

/* Responsive */
@media (max-width: 768px) {
  .providers-grid {
    grid-template-columns: 1fr;
  }
  
  .connection-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
}
```

---

## 🔧 Configuration

### 1. Variables d'Environnement (`.env`)

```bash
# URL de l'API backend
VITE_API_URL=http://localhost:3001

# URL de callback OAuth (doit correspondre à votre frontend)
VITE_OAUTH_CALLBACK_URL=http://localhost:5173/oauth/callback
```

### 2. Routes (`src/App.tsx` ou router config)

Ajoutez ces routes à votre configuration React Router:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OAuthConnections } from './pages/OAuthConnections';
import { OAuthCallback } from './pages/OAuthCallback';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ... autres routes ... */}
        
        {/* Page de gestion OAuth */}
        <Route path="/connections" element={<OAuthConnections />} />
        
        {/* Callback OAuth (IMPORTANT !) */}
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/dashboard" element={<OAuthCallback />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 📱 Flux Utilisateur Complet

### Étape 1: Navigation vers la page OAuth
```
User → Clique sur "Connexions" dans le menu
     → Navigate to
