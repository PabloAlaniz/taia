import { expect, test, type Page } from '@playwright/test'

// The core loop of TAIA on a fresh install, as one person would do it in one
// browser session: finish the onboarding, create a task, move it and find it
// again after a reload.

const WORKSPACE = 'Equipo E2E'
const TASK = 'Publicar el repositorio'

function column(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^Columna ${name}, \\d+ tareas?\\b`) })
}

function taskCard(page: Page) {
  return page.getByRole('button', { name: new RegExp(TASK) })
}

test('first run: onboarding, create a task and move it', async ({ page, browser }) => {
  await test.step('onboarding without a runtime ends on an empty board', async () => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Configurar TAIA' }).click()
    await page.getByRole('button', { name: 'Omitir conexión' }).click()

    // The first project comes before the first workspace.
    await page.getByPlaceholder('Nombre del proyecto').fill('Proyecto E2E')
    await page.getByRole('button', { name: 'Crear y seguir' }).click()

    await page.getByPlaceholder('ej: Marketing, Escritura…').fill(WORKSPACE)
    await page.getByRole('button', { name: /Personalizado/ }).click()
    await page.getByRole('button', { name: 'Crear Workspace' }).click()

    await expect(page.getByRole('button', { name: new RegExp(WORKSPACE) })).toBeVisible()
    for (const name of ['To Do', 'In Progress', 'Done']) {
      await expect(column(page, name)).toHaveAccessibleName(new RegExp(`${name}, 0 tareas\\b`))
    }
  })

  await test.step('a new task appears once, in the first column', async () => {
    await page.getByRole('button', { name: '+ Tarea' }).click()
    await page.locator('#task-title').fill(TASK)
    await page.getByRole('button', { name: 'Crear', exact: true }).click()

    await expect(column(page, 'To Do')).toHaveAccessibleName(/To Do, 1 tarea\b/)
    await expect(taskCard(page)).toHaveCount(1)
  })

  await test.step('the onboarding project exists, outside any workspace scope', async () => {
    const projects = (await (await page.request.get('/api/projects')).json()).projects
    expect(projects.map((p: { name: string }) => p.name)).toEqual(['Proyecto E2E'])
  })

  await test.step('the first workspace is the default one, with the task in it', async () => {
    // The onboarding sets up the seeded default workspace rather than adding
    // a second one, so API, MCP and CLI calls without a workspace land here.
    const workspaces = (await (await page.request.get('/api/workspaces')).json()).workspaces
    expect(workspaces.map((w: { id: string; name: string }) => [w.id, w.name])).toEqual([
      ['ws-default', WORKSPACE],
    ])

    const tasks = (await (await page.request.get('/api/tasks?workspace_id=ws-default')).json())
      .tasks
    expect(tasks.map((t: { title: string }) => t.title)).toEqual([TASK])
  })

  await test.step('a second workspace keeps its tasks apart', async () => {
    const created = await page.request.post('/api/workspaces', {
      data: {
        name: 'Otro equipo',
        columns: [
          {
            slug: 'TODO',
            label: 'To Do',
            icon: '📋',
            is_initial_state: true,
            is_done_state: false,
          },
        ],
      },
    })
    expect(created.ok()).toBe(true)
    const other = (await created.json()).workspace.id
    expect(other).not.toBe('ws-default')

    await page.request.post('/api/tasks', {
      headers: { 'x-workspace-id': other },
      data: { action: 'create', task: { title: 'Tarea del otro equipo', created_by: 'web-ui' } },
    })

    await page.reload()
    await expect(column(page, 'To Do')).toHaveAccessibleName(/To Do, 1 tarea\b/)
    await expect(page.getByText('Tarea del otro equipo')).toHaveCount(0)
  })

  await test.step('moving the task to another column survives a reload', async () => {
    await taskCard(page).click()
    await expect(page.getByRole('heading', { name: TASK })).toBeVisible()
    await page
      .locator('select')
      .filter({ hasText: 'In Progress' })
      .selectOption({ label: '🔨 In Progress' })
    await page.getByRole('button', { name: /Back/ }).click()

    await expect(column(page, 'In Progress')).toHaveAccessibleName(/In Progress, 1 tarea\b/)
    await expect(column(page, 'To Do')).toHaveAccessibleName(/To Do, 0 tareas\b/)

    await page.reload()

    await expect(column(page, 'In Progress')).toHaveAccessibleName(/In Progress, 1 tarea\b/)
    await expect(taskCard(page)).toHaveCount(1)
  })

  await test.step('another browser lands on the same board', async () => {
    // Nothing in its localStorage: it falls back to the default workspace.
    const context = await browser.newContext()
    const other = await context.newPage()
    await other.goto('/')

    await expect(column(other, 'In Progress')).toHaveAccessibleName(/In Progress, 1 tarea\b/)
    await expect(taskCard(other)).toHaveCount(1)
    await context.close()
  })
})
