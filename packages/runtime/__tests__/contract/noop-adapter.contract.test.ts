import { createNoopAdapter } from '@taia/runtime/adapters/noop'
import { runAdapterContract } from './adapter-contract'

runAdapterContract({
  name: 'NoopRuntimeAdapter',
  makeAdapter: () => createNoopAdapter(),
  // No-op declares zero capabilities; the mutation contract test would short-circuit anyway,
  // but skip explicitly to make intent visible.
  skipMutation: true,
})
