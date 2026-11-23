import { redirect } from 'next/navigation'

// Agent configuration (identity, context, version history, schedule) lives in
// the expanded rows of the Squad roster.
export default function AgentsPage() {
  redirect('/squad')
}
