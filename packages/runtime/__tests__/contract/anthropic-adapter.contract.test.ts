import { vi } from 'vitest'
import { createAnthropicAdapter, type ToolExecutor } from '@taia/runtime/adapters/anthropic'
import { runAdapterContract } from './adapter-contract'
import { InMemoryRuntimeSessionStore } from './anthropic-in-memory-store'

// Mock the Anthropic SDK at module level so the adapter never opens a real connection.
vi.mock('@anthropic-ai/sdk', () => {
  const streamFn = vi.fn().mockReturnValue({
    on() {
      return this
    },
    async finalMessage() {
      return {
        id: 'msg_1',
        model: 'claude-opus-4-7',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }
    },
  })
  class MockAnthropic {
    models = {
      retrieve: vi.fn().mockResolvedValue({ id: 'claude-opus-4-7' }),
    }
    messages = { stream: streamFn }
    // The adapter goes through beta.messages.stream for compaction +
    // memory tool. Same call shape — point both surfaces at the same mock.
    beta = { messages: { stream: streamFn } }
  }
  return { __esModule: true, default: MockAnthropic }
})

const noopExecutor: ToolExecutor = async () => 'mock'

runAdapterContract({
  name: 'AnthropicAdapter (with mocked SDK)',
  makeAdapter: () =>
    createAnthropicAdapter({
      apiKey: 'sk-test',
      store: new InMemoryRuntimeSessionStore(),
      executeTool: noopExecutor,
      enableThinking: false,
    }),
})
