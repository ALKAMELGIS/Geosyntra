import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SystemSettingsProvider } from '../store/SystemSettingsContext'
import NavMenu from './NavMenu'

const routerFuture = { v7_relativeSplatPath: true, v7_startTransition: true } as const

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('currentUser', JSON.stringify({ role: 'Admin' }))
  localStorage.setItem('appNotifications', JSON.stringify([]))
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? window.innerWidth <= 768 : false,
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
  it('renders vertical nav semantics and ARIA in desktop viewport', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveClass('navmenu')
    expect(nav).toHaveAttribute('data-viewport', 'desktop')
    expect(screen.getByRole('button', { name: /collapse navigation/i })).toBeInTheDocument()
  })

  it('opens and closes group with keyboard and keeps aria-expanded updated', () => {
    setViewport(1280)
    render(
      <MemoryRouter future={routerFuture}>
        <SystemSettingsProvider>
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const masterData = screen.getByRole('button', { name: /master data/i })
    expect(masterData).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(masterData, { key: 'Enter' })
    expect(masterData).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(masterData, { key: 'Escape' })
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
          <NavMenu />
        </SystemSettingsProvider>
      </MemoryRouter>,
    )
    const groupHeader = screen.getByRole('button', { name: /^settings$/i })
    expect(groupHeader).toBeInTheDocument()
    fireEvent.click(groupHeader)
    expect(screen.getByRole('link', { name: /system settings/i })).toHaveAttribute(
      'href',
      '/admin/system-settings',
    )
  })
})
