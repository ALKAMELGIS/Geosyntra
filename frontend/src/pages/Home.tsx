import './Home.css'

/**
 * Home route (`/`) — intentionally blank main canvas; use the sidebar for navigation.
 */
export default function Home() {
  return (
    <div
      className="page home-page home-page--empty"
      style={{ background: 'transparent' }}
      aria-label="Home"
    />
  )
}
