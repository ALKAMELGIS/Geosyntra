import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import './saas-entry-shell.css'

export type SaasNavItem = {
  id: string
  href: string
  label: ReactNode
}

export type SaasEntryAction = {
  label: ReactNode
  onClick: () => void
  'aria-label'?: string
}

export type SaasEntryShellProps = {
  className?: string
  brand?: ReactNode
  brandHref?: string
  navItems?: SaasNavItem[]
  signInAction?: SaasEntryAction
  /** Entire hero body — headlines, CTA, and any CMS/SaaS-injected content. */
  hero: ReactNode
}

type SaasButtonProps = {
  size?: 'sm' | 'lg'
  variant?: 'primary' | 'ghost'
  className?: string
  children: ReactNode
  onClick?: () => void
  'aria-label'?: string
}

function SaasButton({ size = 'sm', variant = 'primary', className, children, onClick, ...rest }: SaasButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null)

  const handleClick = () => {
    const el = ref.current
    if (el) {
      el.classList.add('saas-entry__btn--bounce')
      window.setTimeout(() => el.classList.remove('saas-entry__btn--bounce'), 300)
    }
    onClick?.()
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'saas-entry__btn',
        size === 'lg' ? 'saas-entry__btn--lg' : 'saas-entry__btn--sm',
        variant === 'ghost' ? 'saas-entry__btn--ghost' : 'saas-entry__btn--primary',
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  )
}

export type SaasNavigationProps = Pick<SaasEntryShellProps, 'brand' | 'brandHref' | 'navItems' | 'signInAction'> & {
  className?: string
  /** When set, brand click scrolls to this in-page section instead of navigating away. */
  brandScrollTargetId?: string
  /** Logged-in trial / plan status between nav links and sign-in CTA. */
  statusSlot?: ReactNode
}

export function SaasNavigation({
  brand,
  brandHref = '/',
  navItems = [],
  signInAction,
  className,
  brandScrollTargetId,
  statusSlot,
}: SaasNavigationProps) {
  const onBrandClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!brandScrollTargetId) return
    e.preventDefault()
    document.getElementById(brandScrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuOpen) return
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <nav className={cn('saas-entry__nav', className)} aria-label="Entry navigation">
      <div className="saas-entry__nav-inner">
        <a
          href={brandScrollTargetId ? `#${brandScrollTargetId}` : brandHref}
          className="saas-entry__brand"
          onClick={onBrandClick}
        >
          {brand}
        </a>

        <div className="saas-entry__nav-links">
          {navItems.map(item => (
            <a key={item.id} href={item.href} className="saas-entry__nav-link">
              {item.label}
            </a>
          ))}
          {statusSlot}
          {signInAction ? (
            <SaasButton size="sm" variant="primary" onClick={signInAction.onClick} aria-label={signInAction['aria-label']}>
              {signInAction.label}
            </SaasButton>
          ) : null}
        </div>

        <div className="saas-entry__nav-mobile">
          <button
            ref={triggerRef}
            type="button"
            className="saas-entry__btn saas-entry__btn--sm saas-entry__btn--ghost font-medium"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? '×' : '≡'}
          </button>
          {menuOpen ? (
            <div ref={menuRef} className="saas-entry__mobile-menu" role="menu">
              <div className="saas-entry__mobile-menu-links">
                {navItems.map(item => (
                  <a
                    key={item.id}
                    href={item.href}
                    className="saas-entry__nav-link block px-3 py-2 rounded-md"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              {statusSlot ? <div className="saas-entry__mobile-menu-status">{statusSlot}</div> : null}
              {signInAction ? (
                <div className="saas-entry__mobile-menu-actions">
                  <SaasButton
                    size="sm"
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      setMenuOpen(false)
                      signInAction.onClick()
                    }}
                  >
                    {signInAction.label}
                  </SaasButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}

function SaasHero({ children }: { children: ReactNode }) {
  return (
    <section className="saas-entry__hero" aria-label="Entry">
      <div className="saas-entry__hero-inner">{children}</div>
    </section>
  )
}

export default function SaasEntryShell({
  className,
  brand,
  brandHref = '/',
  navItems,
  signInAction,
  hero,
}: SaasEntryShellProps) {
  return (
    <div className={cn('saas-entry', className)}>
      <SaasNavigation brand={brand} brandHref={brandHref} navItems={navItems} signInAction={signInAction} />
      <SaasHero>{hero}</SaasHero>
    </div>
  )
}

export { SaasButton }
