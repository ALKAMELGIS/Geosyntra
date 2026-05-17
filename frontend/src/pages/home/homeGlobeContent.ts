import type { ScrollGlobeSection } from '../../components/ui/landing-page'

export type HomeGlobeCtaHandlers = {
  onPrimary: () => void
  onSecondary: () => void
}

/** Two scroll panels after Start — Innovation + Future (3-part home narrative with leading Start). */
export function buildHomeGlobeSections({
  onPrimary,
  onSecondary,
}: HomeGlobeCtaHandlers): ScrollGlobeSection[] {
  return [
    {
      id: 'innovation',
      badge: 'Innovation',
      title: 'Connected Worldwide',
      description:
        'From every corner of the globe, we witness the interconnected web of human achievement. Each connection represents progress, every interaction drives innovation forward into uncharted territories.',
      align: 'center',
      actions: [
        { label: 'Begin Journey', variant: 'primary', onClick: onPrimary },
        { label: 'Learn More', variant: 'secondary', onClick: onSecondary },
      ],
    },
    {
      id: 'future',
      badge: 'Future',
      title: 'Our Shared',
      subtitle: 'Tomorrow',
      description:
        'In this moment of unity, we see not just a planet, but a canvas of infinite human potential. Every connection represents hope, every innovation builds bridges to our collective future of endless possibilities.',
      align: 'center',
      actions: [
        { label: 'Join the Movement', variant: 'primary', onClick: onPrimary },
        { label: 'Explore More', variant: 'secondary', onClick: onSecondary },
      ],
    },
  ]
}
