import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SystemSettingsProvider } from '../store/SystemSettingsContext'
import NavMenu from './NavMenu'
import PrimaryNavIcons from './PrimaryNavIcons'

const routerFuture = { v7_relativeSplatPath: true, v7_startTransition: true } as const

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'currentUser',
    JSON.stringify({
      id: 1,
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'Admin',
    }),
  )
  localStorage.setItem('appNotifications', JSON.stringify([]))
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('(max-width: 767px)')
        ? window.innerWidth <= 767
        : query.includes('max-width')
          ? window.innerWidth <= 768
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NavMenu vertical responsive', () => {
  it('does not render the mobile nav strip on desktop (primary nav lives in the header)', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation', { name: /^primary$/i })).not.toBeInTheDocument()
  })

  it('renders header primary icon nav on desktop viewport', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary app navigation/i })
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveClass('geosyntra-primary-nav')
  })

  it('navigates satellite imagery directly without a separate submenu', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const satellite = screen.getByTitle(/satellite imagery/i)
    expect(satellite.tagName).toBe('A')
    expect(satellite).toHaveAttribute('href', '/satellite/indices')
    expect(satellite).not.toHaveAttribute('aria-expanded')
  })

  it('does not render the legacy mobile nav strip (icons live in header)', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation', { name: /^primary$/i })).not.toBeInTheDocument()
  })

  it('renders compact primary icon nav in header on mobile viewport', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary app navigation/i })
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveClass('geosyntra-primary-nav--mobile')
  })

  it('shows Content route from Settings for signed-in users', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const settings = screen.getByTitle(/^Settings$/i)
    expect(settings.tagName).toBe('A')
    expect(settings).toHaveAttribute('href', '/settings/gis-content')
  })

  it('shows satellite imagery as a single mobile header nav item (no submenu)', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const satellite = screen.getByTitle(/satellite imagery/i)
    expect(satellite.tagName).toBe('A')
    expect(satellite).toHaveAttribute('href', '/satellite/indices')
    expect(satellite).not.toHaveAttribute('aria-expanded')
  })
})
