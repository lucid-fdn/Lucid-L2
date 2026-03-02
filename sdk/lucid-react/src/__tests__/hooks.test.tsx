/**
 * React hooks tests for @lucid/react
 *
 * Tests LucidProvider, useLucid, useChat, usePassport, and useEscrow hooks
 * using a mock SDK to avoid real HTTP calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { LucidProvider, useLucid } from '../context.js';
import { useChat } from '../hooks/useChat.js';
import { usePassport } from '../hooks/usePassport.js';
import { useEscrow } from '../hooks/useEscrow.js';

// ─── Mock SDK ──────────────────────────────────────────────────────

const mockSdk = {
  passports: {
    get: vi.fn(),
    create: vi.fn(),
  },
  escrow: {
    get: vi.fn(),
    create: vi.fn(),
  },
  run: {
    chatCompletions: vi.fn(),
  },
};

vi.mock('@lucid/sdk/lucid', () => ({
  createLucidSDK: () => mockSdk,
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LucidProvider apiKey="test-key" chain="base">
      {children}
    </LucidProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── LucidProvider / useLucid ──────────────────────────────────────

describe('LucidProvider', () => {
  it('provides sdk and chain to children', () => {
    const { result } = renderHook(() => useLucid(), { wrapper });
    expect(result.current.sdk).toBeDefined();
    expect(result.current.chain).toBe('base');
  });

  it('throws when useLucid is called outside provider', () => {
    expect(() => {
      renderHook(() => useLucid());
    }).toThrow('useLucid must be used within a <LucidProvider>');
  });
});

// ─── usePassport ───────────────────────────────────────────────────

describe('usePassport', () => {
  it('fetches passport data', async () => {
    const mockPassport = { passportId: 'p_1', name: 'Test Model', type: 'model' };
    mockSdk.passports.get.mockResolvedValue({ success: true, passport: mockPassport });

    const { result } = renderHook(() => usePassport('p_1'), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSdk.passports.get).toHaveBeenCalledWith({ passportId: 'p_1' });
    expect(result.current.data).toEqual({ success: true, passport: mockPassport });
    expect(result.current.error).toBeNull();
  });

  it('handles errors', async () => {
    mockSdk.passports.get.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => usePassport('p_bad'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Not found');
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when passportId is undefined', () => {
    renderHook(() => usePassport(undefined), { wrapper });

    expect(mockSdk.passports.get).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() => usePassport('p_1', { enabled: false }), { wrapper });

    expect(mockSdk.passports.get).not.toHaveBeenCalled();
  });
});

// ─── useEscrow ─────────────────────────────────────────────────────

describe('useEscrow', () => {
  it('fetches escrow data', async () => {
    const mockEscrow = { escrowId: 'e_1', status: 'Created' };
    mockSdk.escrow.get.mockResolvedValue({ success: true, escrow: mockEscrow });

    const { result } = renderHook(() => useEscrow('e_1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSdk.escrow.get).toHaveBeenCalledWith({ chainId: 'base', escrowId: 'e_1' });
    expect(result.current.data).toEqual({ success: true, escrow: mockEscrow });
    expect(result.current.error).toBeNull();
  });

  it('handles errors', async () => {
    mockSdk.escrow.get.mockRejectedValue(new Error('Escrow not found'));

    const { result } = renderHook(() => useEscrow('e_bad'), { wrapper });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error!.message).toBe('Escrow not found');
  });

  it('does not fetch when escrowId is undefined', () => {
    renderHook(() => useEscrow(undefined), { wrapper });

    expect(mockSdk.escrow.get).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() => useEscrow('e_1', { enabled: false }), { wrapper });

    expect(mockSdk.escrow.get).not.toHaveBeenCalled();
  });

  it('polls with refetchInterval', async () => {
    const mockEscrow = { escrowId: 'e_1', status: 'Created' };
    mockSdk.escrow.get.mockResolvedValue({ success: true, escrow: mockEscrow });

    renderHook(() => useEscrow('e_1', { refetchInterval: 50 }), { wrapper });

    // Initial fetch + at least one poll
    await waitFor(() => {
      expect(mockSdk.escrow.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 500 });
  });
});

// ─── useChat ───────────────────────────────────────────────────────

describe('useChat', () => {
  it('initializes with empty state', () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    expect(result.current.messages).toEqual([]);
    expect(result.current.input).toBe('');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles input changes', () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.handleInputChange({ target: { value: 'Hello' } });
    });

    expect(result.current.input).toBe('Hello');
  });

  it('sends message and receives response', async () => {
    mockSdk.run.chatCompletions.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hi there!' } }],
    });

    const { result } = renderHook(() => useChat(), { wrapper });

    // Set input
    act(() => {
      result.current.handleInputChange({ target: { value: 'Hello' } });
    });

    // Submit
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    expect(result.current.input).toBe('');
    expect(result.current.isStreaming).toBe(false);
  });

  it('uses custom model', async () => {
    mockSdk.run.chatCompletions.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

    const { result } = renderHook(() => useChat({ model: 'llama-3' }), { wrapper });

    act(() => {
      result.current.handleInputChange({ target: { value: 'Hi' } });
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockSdk.run.chatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3' }),
    );
  });

  it('handles API errors', async () => {
    mockSdk.run.chatCompletions.mockRejectedValue(new Error('Rate limited'));

    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.handleInputChange({ target: { value: 'Hello' } });
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Rate limited');
    expect(result.current.messages).toHaveLength(1); // user message stays
  });

  it('does not submit empty input', async () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockSdk.run.chatCompletions).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it('prevents double submission while streaming', async () => {
    let resolveChat: (value: any) => void;
    mockSdk.run.chatCompletions.mockImplementation(
      () => new Promise((resolve) => { resolveChat = resolve; }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.handleInputChange({ target: { value: 'Hello' } });
    });

    // Start first submit (don't await)
    act(() => {
      result.current.handleSubmit();
    });

    // Try second submit while streaming
    act(() => {
      result.current.handleInputChange({ target: { value: 'Second' } });
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    // Only one API call should have been made
    expect(mockSdk.run.chatCompletions).toHaveBeenCalledTimes(1);

    // Resolve the pending chat
    await act(async () => {
      resolveChat!({
        choices: [{ message: { role: 'assistant', content: 'Done' } }],
      });
    });
  });

  it('initializes with initial messages', () => {
    const initial = [
      { role: 'system' as const, content: 'You are helpful' },
      { role: 'user' as const, content: 'Hi' },
    ];

    const { result } = renderHook(
      () => useChat({ initialMessages: initial }),
      { wrapper },
    );

    expect(result.current.messages).toEqual(initial);
  });

  it('calls preventDefault on submit event', async () => {
    mockSdk.run.chatCompletions.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.handleInputChange({ target: { value: 'Hi' } });
    });

    const preventDefault = vi.fn();
    await act(async () => {
      await result.current.handleSubmit({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalled();
  });
});
