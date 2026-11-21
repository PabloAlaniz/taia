'use client'

import { useTranslations } from 'next-intl'
import { RuntimeProviderForm, type RuntimeSavedEvent } from '../runtime-provider-form'

interface StepConnectionProps {
  /** Called once a runtime (or standalone mode) was saved as active. */
  onConnected: (event: RuntimeSavedEvent) => void
}

export function StepConnection({ onConnected }: StepConnectionProps) {
  const t = useTranslations('onboarding')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">{t('connectTitle')}</h2>
        <p className="text-sm text-muted">{t('connectDesc')}</p>
      </div>
      <RuntimeProviderForm onSaved={onConnected} />
    </div>
  )
}
