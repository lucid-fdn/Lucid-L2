# 🔗 Guide d'Intégration llm-proxy ↔ Lucid-L2

**Objectif:** Faire fonctionner llm-proxy et l'intégrer avec Lucid-L2 pour utiliser 100+ modèles IA

---

## 📊 État Actuel vs Objectif

### ❌ État Actuel
```
Lucid-L2 API → OpenAI directement (package 'openai')
```

### ✅ Objectif
```
Lucid-L2 API → llm-proxy → 100+ modèles (OpenAI, Claude, Llama, etc.)
```

---

## 🎯 Plan d'Intégration (4 Étapes)

### Étape 1: Démarrer llm-proxy ⏱️ 5 min

```bash
cd /home/admin/Lucid/llm-proxy

# Installer dépendances Python (si pas déjà fait)
pip install -r requirements.txt

# Configurer .env (API keys optionnelles pour MVP)
cat > .env << 'EOF'
# Eden AI (optionnel - pour modèles payants)
EDEN_API_KEY=your_key_here

# HuggingFace (optionnel - pour meilleurs rate limits)
HF_API_KEY=your_key_here

# API Config
API_HOST=0.0.0.0
API_PORT=8000
EOF

# Démarrer llm-proxy
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Vérification:**
```bash
curl http://localhost:8000/
# Devrait retourner: API info
```

---

### Étape 2: Créer Provider llm-proxy dans Lucid-L2 ⏱️ 15 min

**Fichier à créer:** `Lucid-L2/offchain/src/providers/llmproxy.ts`

```typescript
// offchain/src/providers/llmproxy.ts
import axios from 'axios';
import { LLMProvider, LLMResponse, LLMError, hashResponse, calculateQualityScore } from './llm';

export class LLMProxyProvider implements LLMProvider {
  public readonly name = 'llmproxy';
  public readonly models: string[] = [];
  
  private baseUrl: string;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: {
    baseUrl: string;
    defaultModel?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultModel = config.defaultModel || 'hf-gpt2';
    this.maxTokens = config.maxTokens || 150;
    this.temperature = config.temperature || 0.7;
    
    // Fetch available models on initialization
    this.fetchAvailableModels();
  }

  private async fetchAvailableModels(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`);
      if (response.data && Array.isArray(response.data)) {
        this.models.push(...response.data.map((m: any) => m.id || m.name));
      }
    } catch (error) {
      console.warn('Could not fetch models from llm-proxy:', error);
      // Fallback to common models
      this.models.push('hf-gpt2', 'openai-gpt35-turbo', 'openai-gpt4');
    }
  }

  async generateResponse(input: string, model?: string): Promise<LLMResponse> {
    const selectedModel = model || this.defaultModel;
    
    try {
      const startTime = Date.now();
      
      // Call llm-proxy /invoke/model/{model_id} endpoint
      const response = await axios.post(
        `${this.baseUrl}/invoke/model/${selectedModel}`,
        {
          prompt: input,
          parameters: {
            max_tokens: this.maxTokens,
            temperature: this.temperature
          }
        },
        {
          timeout: 30000, // 30 seconds
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.output || response.data.result || '';
      const hash = hashResponse(content);
      const qualityScore = calculateQualityScore(content);
      
      // Extract token usage from llm-proxy response
      const usage = response.data.usage || {};
      const inputTokens = usage.prompt_tokens || Math.ceil(input.length / 4);
      const outputTokens = usage.completion_tokens || Math.ceil(content.length / 4);
      const totalTokens = usage.total_tokens || inputTokens + outputTokens;
      
      // Cost estimation (llm-proxy may provide this)
      const cost = response.data.cost || 0;
      
      return {
        content,
        hash,
        model: selectedModel,
        provider: this.name,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        },
        cost,
        qualityScore,
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';
      throw new LLMError(
        `llm-proxy API error: ${errorMessage}`,
        this.name,
        selectedModel,
        error?.response?.status?.toString()
      );
    }
  }

  async estimateCost(input: string, model?: string): Promise<number> {
    // llm-proxy doesn't charge directly, but can estimate based on provider
    // For now, return 0 for free models, small amount for others
    const selectedModel = model || this.defaultModel;
    
    if (selectedModel.startsWith('hf-')) {
      return 0; // HuggingFace models are free
    }
    
    if (selectedModel.startsWith('openai-')) {
      // Rough estimate
      const tokens = Math.ceil(input.length / 4) + this.maxTokens;
      return tokens * 0.000002; // Very rough estimate
    }
    
    return 0;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async healthCheck(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      throw new Error('llm-proxy health check failed');
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`);
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((m: any) => m.id || m.name);
      }
      return [];
    } catch (error) {
      return this.models; // Return cached models
    }
  }
}
```

---

### Étape 3: Modifier Router pour Utiliser llm-proxy ⏱️ 5 min

**Fichier à modifier:** `Lucid-L2/offchain/src/providers/router.ts`

```typescript
// Ajouter en haut du fichier:
import { LLMProxyProvider } from './llmproxy';

// Dans initializeProviders(), ajouter:
private initializeProviders(): void {
  // ... code existant ...
  
  // Initialize llm-proxy provider
  if (this.config.baseUrl) {
    this.providers.set('llmproxy', new LLMProxyProvider({
      baseUrl: this.config.baseUrl,
      defaultModel: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature
    }));
  }
}
```

---

### Étape 4: Configuration et Tests ⏱️ 10 min

**Fichier à modifier:** `Lucid-L2/offchain/src/utils/config.ts`

```typescript
// Ajouter configuration llm-proxy
export const LLM_CONFIG = {
  provider: 'llmproxy',  // ← Changer de 'mock' ou 'openai' à 'llmproxy'
  baseUrl: 'http://localhost:8000',  // ← URL llm-proxy
  model: 'hf-gpt2',  // Modèle par défaut (gratuit HuggingFace)
  maxTokens: 150,
  temperature: 0.7,
  fallbackProviders: ['mock']  // Fallback si llm-proxy down
};
```

**Test end-to-end:**
```bash
# 1. llm-proxy doit être running
curl http://localhost:8000/

# 2. Lucid-L2 API doit être running
curl http://localhost:3001/system/status

# 3. Test via Lucid-L2 API
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, test llm-proxy integration!"}'
```

---

## 🎯 Modèles Disponibles via llm-proxy

### Modèles Gratuits (HuggingFace)
```
hf-gpt2                    - Petit, rapide, gratuit
hf-meta-llama/Llama-2-7b   - Plus puissant
hf-mistralai/Mistral-7B    - Excellent rapport qualité
```

### Modèles Payants (si API keys configurées)
```
openai-gpt35-turbo         - Rapide, abordable
openai-gpt4                - Plus puissant
anthropic-claude-3-sonnet  - Excellent raisonnement
google-gemini-pro          - Multimodal
```

---

## 🔧 Debugging

### llm-proxy ne démarre pas?
```bash
# Vérifier dépendances
cd llm-proxy
pip install -r requirements.txt

# Vérifier port disponible
netstat -tulpn | grep 8000

# Logs détaillés
uvicorn main:app --reload --log-level debug
```

### Lucid-L2 n'appelle pas llm-proxy?
```bash
# Vérifier config
cat Lucid-L2/offchain/src/utils/config.ts | grep LLM_CONFIG

# Vérifier provider chargé
curl http://localhost:3001/system/status | jq .

# Logs Lucid-L2 API
# (voir terminal où npm start tourne)
```

### Erreur "Model not found"?
```bash
# Lister modèles disponibles
curl http://localhost:8000/models

# Utiliser un modèle existant
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "model": "hf-gpt2"}'
```

---

## 📝 Checklist Complète

### Setup llm-proxy
- [ ] Dependencies installées (`pip install -r requirements.txt`)
- [ ] .env configuré (optionnel)
- [ ] llm-proxy démarré (`uvicorn main:app --reload`)
- [ ] Répond sur http://localhost:8000

### Intégration Lucid-L2
- [ ] Fichier `providers/llmproxy.ts` créé
- [ ] Router modifié (`providers/router.ts`)
- [ ] Config mise à jour (`utils/config.ts`)
- [ ] Lucid-L2 API redémarrée

### Tests
- [ ] llm-proxy health check OK
- [ ] Liste modèles disponibles
- [ ] Test inference via llm-proxy directement
- [ ] Test inference via Lucid-L2 API
- [ ] Vérification transaction devnet

---

## 🚀 Prochaines Étapes

Une fois l'intégration fonctionnelle:

1. **Ajouter plus de modèles** (Eden AI pour GPT-4, Claude, etc.)
2. **Configurer extension browser** pour utiliser différents modèles
3. **Beta testing** avec vrais utilisateurs
4. **Optimiser coûts** (mix modèles gratuits/payants)

---

## 📞 Support

**Vérifications Rapides:**
```bash
# llm-proxy running?
curl http://localhost:8000/

# Lucid-L2 API running?
curl http://localhost:3001/system/status

# Test direct llm-proxy
curl -X POST http://localhost:8000/invoke/model/hf-gpt2 \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "parameters": {"max_tokens": 50}}'

# Test via Lucid-L2
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello!"}'
```

---

**Prêt à démarrer? Je peux:**
- A: Démarrer llm-proxy maintenant
- B: Créer le provider llmproxy.ts
- C: Tout faire automatiquement (A+B+tests)

**Dites-moi et on commence! 🚀**
