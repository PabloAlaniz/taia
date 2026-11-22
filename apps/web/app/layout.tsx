import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Barlow_Semi_Condensed, IBM_Plex_Mono } from 'next/font/google'
import { SkipLink } from '../components/atoms'
import { AppShell } from '../components/templates/app-shell'
import './globals.css'

// Barlow Semi Condensed carries the strips; Plex Mono only ids, commands and
// diff counts. next/font self-hosts both at build time.
const barlow = Barlow_Semi_Condensed({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TAIA - Tablero de Agentes IA',
  description: 'Tablero de gestión de tareas multi-agente',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2b3138' },
    { media: '(prefers-color-scheme: dark)', color: '#1d2329' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${barlow.variable} ${plexMono.variable}`}
      style={{ colorScheme: 'dark light' }}
    >
      <head />
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <SkipLink />
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
