import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Rec Room Archive', description: 'Explore and preserve your Rec Room export data' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, padding: 0, background: '#0d0d14' }}>{children}</body></html>
}
