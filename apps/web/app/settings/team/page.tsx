import { redirect } from 'next/navigation'

// People and agents share one home: the Equipo page.
export default function TeamSettingsPage() {
  redirect('/squad')
}
