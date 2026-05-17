import type { ScrollGlobeSection } from '../../components/ui/landing-page'

export type HomeGlobeCtaHandlers = {
  onPrimary: () => void
  onSecondary: () => void
}

/** Four scroll panels after the SaaS signup screen — platform story + globe. */
export function buildHomeGlobeSections({
  onPrimary,
  onSecondary,
}: HomeGlobeCtaHandlers): ScrollGlobeSection[] {
  return [
    {
      id: 'hero',
      badge: 'Welcome',
      title: 'Geosyntra',
      description:
        'Journey through an intelligent geospatial ecosystem where GIS, remote sensing, and smart technologies converge. Explore dynamic spatial insights, advanced analytics, and immersive digital experiences designed to transform data into intelligent decision-making.',
      align: 'left',
      actions: [
        { label: 'Begin Journey', variant: 'primary', onClick: onPrimary },
        { label: 'Learn More', variant: 'secondary', onClick: onSecondary },
      ],
    },
    {
      id: 'innovation',
      badge: 'Innovation',
      title: 'Connected Worldwide',
      description:
        'From every corner of the globe, we witness the interconnected web of human achievement. Each connection represents progress, every interaction drives innovation forward into uncharted territories.',
      align: 'center',
    },
    {
      id: 'discovery',
      badge: 'Discovery',
      title: 'Expanding',
      subtitle: 'Possibilities',
      description:
        "As we push beyond familiar boundaries, new worlds of opportunity emerge from the horizon. What seemed impossible yesterday becomes tomorrow's foundation for extraordinary achievements.",
      align: 'left',
      features: [
        {
          title: 'Limitless Exploration',
          description: 'Discover new dimensions of possibility and innovation',
        },
        {
          title: 'Seamless Integration',
          description: 'Where cutting-edge technology meets human intuition',
        },
        {
          title: 'Future-Ready Solutions',
          description: "Built for tomorrow's challenges and opportunities",
        },
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
