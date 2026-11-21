import { runAdapterContract } from './adapter-contract'
import { createMockAdapter } from './mock-adapter'

runAdapterContract({
  name: 'MockRuntimeAdapter',
  makeAdapter: () => createMockAdapter(),
})
