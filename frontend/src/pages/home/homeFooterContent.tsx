import { SAAS_ROUTES } from '../../lib/saasRoutes'

export type HomeFooterLink = {
  href: string
  label: string
  external?: boolean
}

export type HomeFooterColumn = {
  title: string
  links: HomeFooterLink[]
}

export const homeFooterColumns: HomeFooterColumn[] = [
  {
    title: 'Platform',
    links: [
      { href: SAAS_ROUTES.dashboardDefault, label: 'Satellite Intelligence' },
      { href: '#innovation', label: 'Earth Observation' },
      { href: '#discovery', label: 'AOI & Analytics' },
      { href: '#future', label: 'Scientific Reporting' },
      { href: '#get-started', label: 'Start free trial' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { href: '#innovation', label: 'Remote sensing' },
      { href: '#discovery', label: 'Vegetation indices' },
      { href: '#discovery', label: 'Change detection' },
      { href: '#future', label: 'Geo AI copilot' },
      { href: '/learn-more', label: 'Enterprise GIS' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/learn-more', label: 'Documentation' },
      { href: '#pricing', label: 'Pricing' },
      { href: '#start', label: 'Getting started' },
      { href: '#start', label: 'Platform tour' },
      { href: 'mailto:support@geosyntra.com', label: 'Contact support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/learn-more', label: 'Terms of service' },
      { href: '/learn-more', label: 'Privacy policy' },
      { href: '/learn-more', label: 'Cookie notice' },
      { href: '/learn-more', label: 'Data processing' },
      { href: '/learn-more', label: 'Security & trust' },
    ],
  },
]

export const homeFooterSocial = [
  { href: 'https://linkedin.com', label: 'LinkedIn', icon: 'fa-brands fa-linkedin-in' },
  { href: 'https://twitter.com', label: 'X (Twitter)', icon: 'fa-brands fa-x-twitter' },
  { href: 'https://github.com', label: 'GitHub', icon: 'fa-brands fa-github' },
  { href: 'https://youtube.com', label: 'YouTube', icon: 'fa-brands fa-youtube' },
] as const
