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

  it('opens and closes merged group popover with click and Escape', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const masterData = screen.getByTitle(/master data/i)
    expect(masterData).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(masterData)
    expect(masterData).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(masterData).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps primary navigation expanded on mobile (no hamburger toggle)', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toHaveClass('navmenu-open')
    expect(screen.queryByRole('button', { name: /open navigation menu/i })).not.toBeInTheDocument()
    const list = document.getElementById('primary-nav')
    expect(list).toBeTruthy()
    expect(list).toHaveAttribute('aria-hidden', 'false')
  })

  it('closes flyout groups when tapping outside on mobile', () => {
    setViewport(390)
    render(
      <MemoryRouter future={routerFuture}>
        <div data-testid="outside">outside</div>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const masterData = screen.getByRole('button', { name: /master data/i })
    fireEvent.click(masterData)
    expect(masterData).toHaveAttribute('aria-expanded', 'true')
    fireEvent.touchStart(document.body)
    expect(masterData).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders the Settings group with the system-settings leaf', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture} initialEntries={['/admin/system-settings']}>
        <SystemSettingsProvider>
          <PrimaryNavIcons />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const groupHeader = screen.getByRole('button', { name: /^settings$/i })
    expect(groupHeader).toBeInTheDocument()
    fireEvent.click(groupHeader)
    expect(screen.getByRole('menuitem', { name: /system settings/i })).toHaveAttribute(
      'href',
      '/admin/system-settings',
    )
  })
})
