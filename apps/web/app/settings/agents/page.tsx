import { redirect } from 'next/navigation'

// Agent management lives on the Squad page.
export default function AgentSettingsPage() {
  redirect('/squad')
}
