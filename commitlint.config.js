// Commitlint configuration
// https://commitlint.js.org/
//
// Enforces conventional commit format:
//   <type>(<scope>): <subject>
//
// Examples:
//   feat(api): add task assignment endpoint
//   fix(web): correct drag-drop state sync
//   docs: update installation guide
//   chore(deps): bump vitest to 4.0.18

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types allowed
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, no code change
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf', // Performance improvement
        'test', // Adding or updating tests
        'build', // Build system or external dependencies
        'ci', // CI configuration
        'chore', // Other changes (e.g., updating .gitignore)
        'revert', // Revert a previous commit
        'deps', // Dependency updates
      ],
    ],
    // Scope is optional
    'scope-empty': [0],
    // Subject line max length
    'subject-max-length': [2, 'always', 100],
    // Don't require body
    'body-max-line-length': [0],
  },
}
