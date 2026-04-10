'use client'
import dynamic from 'next/dynamic'
// Disable SSR — component uses browser File APIs
const App = dynamic(() => import('../components/RecRoomArchive'), { ssr: false })
export default function Page() { return <App /> }
