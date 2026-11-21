'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Select } from './select'

const LOCALES = ['es', 'pt'] as const

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations('locale')

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`
    window.location.reload()
  }

  return (
    <Select value={locale} onChange={handleChange} className="w-auto text-xs">
      {LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {t(loc)}
        </option>
      ))}
    </Select>
  )
}
