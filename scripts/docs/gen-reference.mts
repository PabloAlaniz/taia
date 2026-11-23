#!/usr/bin/env node
// Generates the docs site pages that come straight from the code, so they
// can't drift: the MCP tools reference, the REST route index and the ADRs.
// Output goes to apps/docs/src/content/docs (gitignored); `pnpm -F @taia/docs
// build` runs this first.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content', 'docs')
const BANNER = '<!-- Generado por scripts/docs/gen-reference.mts: no editar a mano. -->'

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** Text for a Markdown table cell: backslashes first, so `\|` cannot be undone. */
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

// --- MCP tools -------------------------------------------------------------

interface ToolParam {
  name: string
  type: string
  optional: boolean
  description: string
}

interface Tool {
  name: string
  description: string
  params: ToolParam[]
  file: string
}

function stringValue(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = stringValue(node.left)
    const right = stringValue(node.right)
    return left !== undefined && right !== undefined ? left + right : undefined
  }
  if (ts.isParenthesizedExpression(node)) return stringValue(node.expression)
  return undefined
}

function property(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText() === name) return prop.initializer
  }
  return undefined
}

/** Reads a zod chain like `z.string().optional().describe('…')`. */
function zodParam(name: string, expr: ts.Expression): ToolParam {
  const calls: { method: string; args: readonly ts.Expression[] }[] = []
  let node: ts.Expression = expr
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    calls.unshift({ method: node.expression.name.text, args: node.arguments })
    node = node.expression.expression
  }
  const base = calls[0]
  let type = base?.method ?? 'unknown'
  if (type === 'enum' && base?.args[0] && ts.isArrayLiteralExpression(base.args[0])) {
    type = base.args[0].elements.map((e) => stringValue(e as ts.Expression) ?? '?').join(' | ')
  } else if (type === 'array' && base?.args[0]) {
    const inner = zodParam('', base.args[0])
    type = `${inner.type}[]`
  }
  const optional = calls.some((c) => ['optional', 'default', 'nullish'].includes(c.method))
  const describe = calls.find((c) => c.method === 'describe')
  return { name, type, optional, description: stringValue(describe?.args[0]) ?? '' }
}

function collectTools(): Tool[] {
  const dir = join(ROOT, 'apps', 'mcp', 'src', 'tools')
  const tools: Tool[] = []
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('-tools.ts'))
    .sort()) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const name = stringValue(property(node, 'name'))
        const params = property(node, 'params')
        if (name?.startsWith('taia_') && params && ts.isObjectLiteralExpression(params)) {
          tools.push({
            name,
            description: stringValue(property(node, 'description')) ?? '',
            file,
            params: params.properties
              .filter(ts.isPropertyAssignment)
              .map((p) => zodParam(p.name.getText(), p.initializer)),
          })
          return
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return tools
}

function toolsPage(tools: Tool[]): string {
  const byFile = new Map<string, Tool[]>()
  for (const tool of tools) byFile.set(tool.file, [...(byFile.get(tool.file) ?? []), tool])
  const groupName = (file: string) =>
    ({
      'agent-tools.ts': 'Agentes',
      'dependency-tools.ts': 'Dependencias',
      'message-tools.ts': 'Mensajes',
      'planning-tools.ts': 'Planificación',
      'project-tools.ts': 'Proyectos',
      'runtime-target-tools.ts': 'Diagnóstico',
      'session-tools.ts': 'Sesiones',
      'subtask-tools.ts': 'Subtareas',
      'task-tools.ts': 'Tareas',
      'workspace-tools.ts': 'Workspaces',
      'worktree-tools.ts': 'Worktrees',
    })[file] ?? file

  const lines = [
    '---',
    'title: Herramientas MCP',
    `description: Las ${tools.length} herramientas que expone el servidor MCP de TAIA.`,
    'sidebar:',
    '  order: 2',
    '---',
    '',
    BANNER,
    '',
    `El servidor MCP expone **${tools.length} herramientas**. Las descripciones están en inglés porque son las que leen los agentes. Para conectarte, ver [Conectar un cliente MCP](../../guias/cliente-mcp/).`,
    '',
  ]
  for (const [file, group] of byFile) {
    lines.push(`## ${groupName(file)}`, '')
    for (const tool of group) {
      lines.push(`### \`${tool.name}\``, '', tool.description || '—', '')
      if (tool.params.length === 0) {
        lines.push('Sin parámetros.', '')
        continue
      }
      lines.push('| Parámetro | Tipo | Requerido | Descripción |', '|---|---|---|---|')
      for (const p of tool.params) {
        lines.push(
          `| \`${p.name}\` | ${escapeCell(p.type)} | ${p.optional ? 'no' : 'sí'} | ${escapeCell(p.description) || '—'} |`,
        )
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

// --- REST routes -----------------------------------------------------------

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

function routeMethods(source: string): string[] {
  const found = new Set<string>()
  for (const m of METHODS) {
    const declared = new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${m}\\b`)
    const reexported = new RegExp(`export\\s*\\{[^}]*\\b(?:as\\s+)?${m}\\b[^}]*\\}`)
    if (declared.test(source) || reexported.test(source)) found.add(m)
  }
  return METHODS.filter((m) => found.has(m))
}

function routesPage(): string {
  const apiDir = join(ROOT, 'apps', 'web', 'app')
  const routes = walk(join(apiDir, 'api'))
    .filter((f) => f.endsWith(`${sep}route.ts`))
    .map((f) => ({
      path: `/${relative(apiDir, dirname(f)).split(sep).join('/')}`,
      methods: routeMethods(readFileSync(f, 'utf8')),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return [
    '---',
    'title: Índice de rutas de la API',
    `description: Las ${routes.length} rutas REST de TAIA y sus métodos.`,
    'sidebar:',
    '  order: 5',
    '---',
    '',
    BANNER,
    '',
    `Todas las rutas de la API (${routes.length}), tomadas de \`apps/web/app/api/**/route.ts\`. La explicación de los grupos principales está en [API REST](../api/).`,
    '',
    '| Ruta | Métodos |',
    '|---|---|',
    ...routes.map((r) => `| \`${r.path}\` | ${r.methods.join(', ') || '—'} |`),
    '',
  ].join('\n')
}

// --- ADRs ------------------------------------------------------------------

function adrPages() {
  const dir = join(ROOT, 'docs', 'adr')
  const out = join(CONTENT, 'arquitectura', 'adr')
  rmSync(out, { recursive: true, force: true })
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const raw = readFileSync(join(dir, file), 'utf8')
    const match = raw.match(/^#\s+(.+)$/m)
    const title = match?.[1] ?? file
    const isIndex = file === 'README.md'
    // Sibling ADRs: from the index they are ./slug/, from an ADR ../slug/.
    const sibling = isIndex ? './' : '../'
    const up = isIndex ? '../' : '../../'
    const body = raw
      .replace(/^#\s+.+$/m, '')
      .replace(/\]\(\.\/([\w-]+)\.md(#[\w-]+)?\)/g, (_m, slug, hash = '') =>
        slug === 'README' ? `](${sibling}${hash})` : `](${sibling}${slug.toLowerCase()}/${hash})`,
      )
      .replace(/\]\(\.\.\/AGENT_CONTEXT_MODEL\.md(#[\w-]+)?\)/g, (_m, hash = '') => {
        return `](${up}modelo-de-contexto/${hash})`
      })
    const name = isIndex ? 'index.md' : file.toLowerCase()
    write(
      join(out, name),
      // JSON strings are valid YAML double-quoted scalars, escapes included.
      `---\ntitle: ${JSON.stringify(isIndex ? 'Decisiones de arquitectura (ADRs)' : title)}\n---\n\n${BANNER}\n${body}`,
    )
  }
}

const tools = collectTools()
write(join(CONTENT, 'referencia', 'herramientas-mcp.md'), toolsPage(tools))
write(join(CONTENT, 'referencia', 'rutas-api.md'), routesPage())
adrPages()
console.log(`[docs] ${tools.length} MCP tools, routes and ADRs generated`)
