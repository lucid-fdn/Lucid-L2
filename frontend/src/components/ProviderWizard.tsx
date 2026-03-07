'use client';

import { useState, useMemo } from 'react';
import { useAgentCapabilities } from '@/hooks/useLucidApi';

interface ProviderWizardProps {
  onClose: () => void;
}

interface Requirements {
  gpu: boolean;
  budget: 'low' | 'medium' | 'high';
  privacy: boolean;
  autoScale: boolean;
  gpuModel: string;
}

// Provider characteristics for recommendation scoring
const providerProfiles: Record<
  string,
  {
    label: string;
    gpu: boolean;
    costTier: 'low' | 'medium' | 'high';
    privacy: boolean;
    autoScale: boolean;
    description: string;
    pros: string[];
    cons: string[];
    gpuModels: string[];
  }
> = {
  railway: {
    label: 'Railway',
    gpu: false,
    costTier: 'medium',
    privacy: false,
    autoScale: true,
    description: 'Managed PaaS with auto-deploy from Docker images. Best for CPU-only agents.',
    pros: ['Easy setup', 'Auto-deploy', 'Built-in domains', 'Auto-scaling'],
    cons: ['No GPU support', 'Higher cost at scale'],
    gpuModels: [],
  },
  akash: {
    label: 'Akash Network',
    gpu: true,
    costTier: 'low',
    privacy: false,
    autoScale: false,
    description: 'Decentralized compute marketplace. Lowest cost for GPU workloads.',
    pros: ['Cheapest GPU compute', 'Decentralized', 'Bid-based pricing'],
    cons: ['Manual scaling', 'Variable availability', 'Setup complexity'],
    gpuModels: ['rtx-4090', 'a100', 'h100', 'rtx-3090'],
  },
  phala: {
    label: 'Phala Network',
    gpu: true,
    costTier: 'medium',
    privacy: true,
    autoScale: false,
    description: 'Confidential computing with TEE enclaves. Best for privacy-sensitive agents.',
    pros: ['TEE confidentiality', 'Encrypted env vars', 'Verifiable compute'],
    cons: ['Higher latency', 'Limited GPU selection'],
    gpuModels: ['rtx-4090'],
  },
  ionet: {
    label: 'io.net',
    gpu: true,
    costTier: 'low',
    privacy: false,
    autoScale: true,
    description: 'GPU cloud aggregator. Wide hardware selection with auto-extension.',
    pros: ['GPU variety', 'Competitive pricing', 'Auto-extend leases'],
    cons: ['Newer platform', 'Variable node quality'],
    gpuModels: ['rtx-4090', 'a100', 'h100', 'a6000', 'rtx-3090'],
  },
  nosana: {
    label: 'Nosana',
    gpu: true,
    costTier: 'low',
    privacy: false,
    autoScale: false,
    description: 'Solana-native GPU compute. INFINITE duration for persistent services.',
    pros: ['Solana-native', 'Persistent GPU jobs', 'Low cost'],
    cons: ['Solana ecosystem only', 'Manual management'],
    gpuModels: ['rtx-4090', 'rtx-3090'],
  },
  docker: {
    label: 'Docker (Self-hosted)',
    gpu: true,
    costTier: 'low',
    privacy: true,
    autoScale: false,
    description: 'Local Docker deployment. Full control, no external dependencies.',
    pros: ['Full control', 'No vendor lock-in', 'Free (your hardware)'],
    cons: ['Manual ops', 'No built-in HA', 'Self-managed'],
    gpuModels: [],
  },
};

function scoreProvider(provider: (typeof providerProfiles)[string], reqs: Requirements): number {
  let score = 50;
  if (reqs.gpu && !provider.gpu) return 0;
  if (reqs.gpu && provider.gpu) score += 20;
  if (reqs.privacy && provider.privacy) score += 25;
  if (reqs.privacy && !provider.privacy) score -= 15;
  if (reqs.autoScale && provider.autoScale) score += 15;
  if (reqs.budget === 'low' && provider.costTier === 'low') score += 20;
  if (reqs.budget === 'low' && provider.costTier === 'high') score -= 20;
  if (reqs.budget === 'high' && provider.costTier !== 'low') score += 10;
  if (reqs.gpuModel && provider.gpuModels.includes(reqs.gpuModel)) score += 15;
  return Math.max(0, Math.min(100, score));
}

export function ProviderWizard({ onClose }: ProviderWizardProps) {
  const [step, setStep] = useState(1);
  const [reqs, setReqs] = useState<Requirements>({
    gpu: false,
    budget: 'medium',
    privacy: false,
    autoScale: false,
    gpuModel: '',
  });

  const { data: caps } = useAgentCapabilities();
  const availableTargets = caps?.capabilities?.targets ?? Object.keys(providerProfiles);

  const recommendations = useMemo(() => {
    return availableTargets
      .map((target: string) => {
        const profile = providerProfiles[target];
        if (!profile) return null;
        return { target, profile, score: scoreProvider(profile, reqs) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [availableTargets, reqs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-gray-800 bg-gray-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {step === 1 ? 'Agent Requirements' : 'Recommended Providers'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">
            &times;
          </button>
        </div>

        {/* Step 1: Requirements */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            {/* GPU */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Does your agent need GPU?
              </label>
              <div className="flex gap-3">
                {[
                  { value: false, label: 'No (CPU only)' },
                  { value: true, label: 'Yes (GPU required)' },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setReqs((r) => ({ ...r, gpu: opt.value }))}
                    className={`rounded-md border px-4 py-2 text-sm transition ${
                      reqs.gpu === opt.value
                        ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* GPU Model */}
            {reqs.gpu && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Preferred GPU</label>
                <select
                  value={reqs.gpuModel}
                  onChange={(e) => setReqs((r) => ({ ...r, gpuModel: e.target.value }))}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Any GPU</option>
                  <option value="rtx-4090">RTX 4090</option>
                  <option value="rtx-3090">RTX 3090</option>
                  <option value="a100">A100</option>
                  <option value="h100">H100</option>
                  <option value="a6000">A6000</option>
                </select>
              </div>
            )}

            {/* Budget */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Budget</label>
              <div className="flex gap-3">
                {(['low', 'medium', 'high'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setReqs((r) => ({ ...r, budget: b }))}
                    className={`rounded-md border px-4 py-2 text-sm capitalize transition ${
                      reqs.budget === b
                        ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Confidential computing (TEE)?
              </label>
              <div className="flex gap-3">
                {[
                  { value: false, label: 'Not required' },
                  { value: true, label: 'Required' },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setReqs((r) => ({ ...r, privacy: opt.value }))}
                    className={`rounded-md border px-4 py-2 text-sm transition ${
                      reqs.privacy === opt.value
                        ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-scale */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Auto-scaling?</label>
              <div className="flex gap-3">
                {[
                  { value: false, label: 'Fixed capacity' },
                  { value: true, label: 'Auto-scale' },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setReqs((r) => ({ ...r, autoScale: opt.value }))}
                    className={`rounded-md border px-4 py-2 text-sm transition ${
                      reqs.autoScale === opt.value
                        ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
              >
                See Recommendations
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Recommendations */}
        {step === 2 && (
          <div className="p-6">
            <div className="space-y-4">
              {recommendations.map(({ target, profile, score }, idx) => (
                <div
                  key={target}
                  className={`rounded-lg border p-4 transition ${
                    idx === 0
                      ? 'border-blue-700/50 bg-blue-950/20'
                      : 'border-gray-800 bg-gray-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-200">{profile.label}</h3>
                        {idx === 0 && (
                          <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs text-blue-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-400">{profile.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-200">{score}</div>
                      <div className="text-xs text-gray-500">score</div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-6">
                    <div>
                      <p className="text-xs text-green-500 mb-1">Pros</p>
                      <ul className="space-y-0.5">
                        {profile.pros.map((p) => (
                          <li key={p} className="text-xs text-gray-400">
                            + {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs text-red-400 mb-1">Cons</p>
                      <ul className="space-y-0.5">
                        {profile.cons.map((c) => (
                          <li key={c} className="text-xs text-gray-400">
                            - {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.gpu && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">GPU</span>
                    )}
                    {profile.privacy && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">TEE</span>
                    )}
                    {profile.autoScale && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        Auto-scale
                      </span>
                    )}
                    <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      Cost: {profile.costTier}
                    </span>
                  </div>
                </div>
              ))}

              {recommendations.length === 0 && (
                <p className="text-center text-gray-500">
                  No providers match your requirements. Try relaxing some constraints.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Back
              </button>
              <button
                onClick={onClose}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
