'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

interface ThoughtEpoch {
  text: string;
  root: string;
  txSignature: string;
  timestamp: number;
  gasCost: {
    iGas: number;
    mGas: number;
    total: number;
  };
}

interface ApiResponse {
  success: boolean;
  txSignature?: string;
  root?: string;
  error?: string;
}

export default function LucidInterface() {
  const { publicKey, connected, connecting, wallet, connect, disconnect } = useWallet();
  const { connection } = useConnection();
  const [text, setText] = useState('');
  const [batchTexts, setBatchTexts] = useState(['']);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [thoughtEpochs, setThoughtEpochs] = useState<ThoughtEpoch[]>([]);
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [mounted, setMounted] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Debug wallet connection
  useEffect(() => {
    console.log('Wallet state:', { 
      connected, 
      connecting, 
      wallet: wallet?.adapter?.name,
      publicKey: publicKey?.toString() 
    });
    
    if (connecting) {
      setConnectionError(null);
      // Set a timeout to detect stuck connections
      const timeout = setTimeout(() => {
        if (connecting && !connected) {
          setConnectionError('Connection timeout. Please try again or check if your wallet extension is installed and unlocked.');
        }
      }, 10000); // 10 second timeout
      
      return () => clearTimeout(timeout);
    }
  }, [connected, connecting, wallet, publicKey]);

  const API_BASE_URL = process.env.NODE_ENV === 'development' 
    ? 'http://172.28.35.139:3000' 
    : 'http://localhost:3000'; // Update for production

  const submitSingleThought = useCallback(async () => {
    if (!text.trim() || !connected) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      const data: ApiResponse = await response.json();

      if (data.success && data.txSignature && data.root) {
        const newEpoch: ThoughtEpoch = {
          text: text.trim(),
          root: data.root,
          txSignature: data.txSignature,
          timestamp: Date.now(),
          gasCost: {
            iGas: 1,
            mGas: 5,
            total: 6
          }
        };
        setThoughtEpochs(prev => [newEpoch, ...prev]);
        setText('');
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error submitting thought:', error);
      alert('Failed to submit thought. Make sure the API server is running.');
    } finally {
      setLoading(false);
    }
  }, [text, connected, API_BASE_URL]);

  const submitBatchThoughts = useCallback(async () => {
    const validTexts = batchTexts.filter(t => t.trim());
    if (validTexts.length === 0 || !connected) return;

    setBatchLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ texts: validTexts }),
      });

      const data = await response.json();

      if (data.success && data.txSignature && data.roots) {
        const newEpochs: ThoughtEpoch[] = validTexts.map((text, index) => ({
          text: text.trim(),
          root: data.roots[index],
          txSignature: data.txSignature,
          timestamp: Date.now(),
          gasCost: data.gasCost
        }));

        setThoughtEpochs(prev => [...newEpochs, ...prev]);
        setBatchTexts(['']);
        
        if (data.savings) {
          alert(`Batch processed! Gas savings: ${data.savings.percentage}% (${data.savings.saved} $LUCID saved)`);
        }
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error submitting batch:', error);
      alert('Failed to submit batch thoughts. Make sure the API server is running.');
    } finally {
      setBatchLoading(false);
    }
  }, [batchTexts, connected, API_BASE_URL]);

  const addBatchInput = () => {
    setBatchTexts(prev => [...prev, '']);
  };

  const updateBatchText = (index: number, value: string) => {
    setBatchTexts(prev => prev.map((text, i) => i === index ? value : text));
  };

  const removeBatchInput = (index: number) => {
    if (batchTexts.length > 1) {
      setBatchTexts(prev => prev.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4">
            Lucid L2™
          </h1>
          <p className="text-xl text-gray-300 mb-6">
            Transform thoughts into immutable on-chain commitments
          </p>
          {mounted && <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />}
        </div>

        {connected ? (
          <div className="max-w-4xl mx-auto">
            {/* Tab Navigation */}
            <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('single')}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === 'single'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Single Thought
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === 'batch'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Batch Thoughts
              </button>
            </div>

            {/* Single Thought Tab */}
            {activeTab === 'single' && (
              <div className="bg-gray-800 rounded-lg p-6 mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">Single Thought Commitment</h2>
                <div className="space-y-4">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter your thought to commit to the blockchain..."
                    className="w-full h-32 p-4 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
                    disabled={loading}
                  />
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-400">
                      Gas Cost: <span className="text-purple-400">1 iGas + 5 mGas = 6 $LUCID</span>
                    </div>
                    <button
                      onClick={submitSingleThought}
                      disabled={!text.trim() || loading}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? 'Committing...' : 'Commit Thought'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Batch Thoughts Tab */}
            {activeTab === 'batch' && (
              <div className="bg-gray-800 rounded-lg p-6 mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">Batch Thought Commitment</h2>
                <div className="space-y-4">
                  {batchTexts.map((batchText, index) => (
                    <div key={index} className="flex gap-2">
                      <textarea
                        value={batchText}
                        onChange={(e) => updateBatchText(index, e.target.value)}
                        placeholder={`Thought ${index + 1}...`}
                        className="flex-1 h-20 p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
                        disabled={batchLoading}
                      />
                      {batchTexts.length > 1 && (
                        <button
                          onClick={() => removeBatchInput(index)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          disabled={batchLoading}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between items-center">
                    <button
                      onClick={addBatchInput}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      disabled={batchLoading}
                    >
                      + Add Thought
                    </button>
                    <div className="text-sm text-gray-400">
                      Gas Cost: <span className="text-purple-400">
                        2 iGas + {batchTexts.filter(t => t.trim()).length * 5} mGas = {2 + batchTexts.filter(t => t.trim()).length * 5} $LUCID
                      </span>
                      {batchTexts.filter(t => t.trim()).length > 1 && (
                        <span className="text-green-400 ml-2">
                          (Save {((batchTexts.filter(t => t.trim()).length * 6 - (2 + batchTexts.filter(t => t.trim()).length * 5)) / (batchTexts.filter(t => t.trim()).length * 6) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={submitBatchThoughts}
                      disabled={batchTexts.filter(t => t.trim()).length === 0 || batchLoading}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {batchLoading ? 'Committing...' : 'Commit Batch'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Thought Epochs History */}
            {thoughtEpochs.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Committed Thought Epochs</h2>
                <div className="space-y-4">
                  {thoughtEpochs.map((epoch, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="text-white font-medium mb-1">{epoch.text}</p>
                          <p className="text-sm text-gray-400">
                            Root: <span className="font-mono text-purple-400">{epoch.root}</span>
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-400">
                          <p>{new Date(epoch.timestamp).toLocaleString()}</p>
                          <p className="text-purple-400">
                            {epoch.gasCost.iGas} iGas + {epoch.gasCost.mGas} mGas = {epoch.gasCost.total} $LUCID
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <a
                          href={`https://explorer.solana.com/tx/${epoch.txSignature}?cluster=custom&customUrl=http://localhost:8899`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          View Transaction ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md mx-auto">
              <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
              <p className="text-gray-400 mb-6">
                Connect your Solana wallet to start committing thoughts to the blockchain.
              </p>
              {mounted && <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
