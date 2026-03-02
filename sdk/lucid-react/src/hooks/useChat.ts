import { useState, useCallback } from 'react';
import { useLucid } from '../context.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UseChatOptions {
  model?: string;
  initialMessages?: ChatMessage[];
}

export function useChat(options: UseChatOptions = {}) {
  const { sdk } = useLucid();
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleInputChange = useCallback(
    (e: { target: { value: string } }) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      if (!input.trim() || isStreaming) return;

      const userMessage: ChatMessage = { role: 'user', content: input };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput('');
      setIsStreaming(true);
      setError(null);

      try {
        const result = await sdk.run.chatCompletions({
          model: options.model ?? 'deepseek-v3',
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        const choice = result.choices?.[0];
        if (choice?.message) {
          const content = choice.message.content ?? '';
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    [input, messages, isStreaming, sdk, options.model],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isStreaming,
    error,
    setMessages,
    setInput,
  };
}
