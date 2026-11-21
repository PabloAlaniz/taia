/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ==========================================================================
    // Layer 1: @taia/types — Zero dependencies (pure types)
    // ==========================================================================
    {
      name: 'types-no-internal-deps',
      comment: '@taia/types must have zero internal dependencies (pure types only)',
      severity: 'error',
      from: { path: '^packages/types' },
      to: { path: '^(packages/(core|domain|runtime)|apps|tools)/' },
    },

    // ==========================================================================
    // Layer 2: @taia/domain — Can only depend on types
    // ==========================================================================
    {
      name: 'domain-only-types',
      comment: '@taia/domain can only import from @taia/types',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: { path: '^(packages/(core|runtime)|apps|tools)/' },
    },

    // ==========================================================================
    // Layer 3: @taia/core — Can depend on types and domain
    // ==========================================================================
    {
      name: 'core-no-apps',
      comment: '@taia/core cannot import from apps (web, cli, mcp)',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { path: '^(apps|tools)/' },
    },

    // ==========================================================================
    // Apps cannot import from each other
    // ==========================================================================
    {
      name: 'apps-no-cross-import',
      comment: 'Apps cannot import from each other',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^(apps/mcp|tools/cli)' },
    },
    {
      name: 'cli-no-cross-import',
      comment: 'CLI cannot import from web or mcp',
      severity: 'error',
      from: { path: '^tools/cli' },
      to: { path: '^apps/(web|mcp)' },
    },
    {
      name: 'mcp-no-cross-import',
      comment: 'MCP cannot import from web or cli',
      severity: 'error',
      from: { path: '^apps/mcp' },
      to: { path: '^(apps/web|tools/cli)' },
    },

    // ==========================================================================
    // @taia/runtime — adapters never reach into core, domain or apps
    // (ADR-005: core versions and dispatches; adapters render and apply)
    // ==========================================================================
    {
      name: 'runtime-no-core',
      comment: '@taia/runtime may only import @taia/types; hosts inject what adapters need',
      severity: 'error',
      from: { path: '^packages/runtime' },
      to: { path: '^(packages/(core|domain)|apps)/' },
    },

    // ==========================================================================
    // No circular dependencies
    // ==========================================================================
    {
      name: 'no-circular',
      comment: 'No circular dependencies allowed',
      severity: 'error',
      from: {},
      to: { circular: true },
    },

    // ==========================================================================
    // No orphan modules (files not imported anywhere)
    // ==========================================================================
    {
      name: 'no-orphans',
      comment: 'No orphan modules (not imported by anything)',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          // Entry points are allowed to be orphans
          '\\.(test|spec)\\.(ts|tsx)$',
          'index\\.ts$',
          'page\\.tsx$',
          'layout\\.tsx$',
          'route\\.ts$',
          'vitest\\..*\\.config\\.ts$',
          '__tests__/',
          // Loaded by their tools by convention, never imported.
          '(^|/)(next|postcss)\\.config\\.js$',
          'next-env\\.d\\.ts$',
          '^apps/web/i18n/request\\.ts$',
          '^apps/web/e2e/',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', '\\.next', 'dist', 'coverage'],
    },
    exclude: {
      path: ['node_modules', '\\.next', '/dist/', 'coverage', '^apps/docs/'],
    },
    tsConfig: {
      // Root paths plus the `@/` alias of apps/web, so imports between web
      // modules are followed.
      fileName: 'tsconfig.depcruise.json',
    },
    // Count `import type` too: type-only imports still couple layers.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
      text: {
        highlightFocused: true,
      },
    },
  },
}
