import { redirect } from 'next/navigation'

// Runtime settings moved to a single provider-agnostic page.
export default function LegacyRuntimeSettingsPage() {
  redirect('/settings/runtime')
}
