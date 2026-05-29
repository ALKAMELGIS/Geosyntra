import './home-partner-logo-slider.css'

const PARTNER_LOGOS = [
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/Satellogic_White_new.svg',
    alt: 'Satellogic — high-resolution daily satellite imagery',
  },
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/BlackSky_White.svg',
    alt: 'BlackSky — high-resolution satellite imagery',
  },
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/SpaceWill_White.svg',
    alt: 'SpaceWill — satellite imagery',
  },
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/SIIS_White.svg',
    alt: 'SIIS — satellite imagery',
  },
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/AT_White.svg',
    alt: '21AT — satellite imagery',
  },
  {
    src: 'https://eos.com/wp-content/uploads/2026/02/GEOSAT_White-2.svg',
    alt: 'GeoSat — satellite imagery',
  },
] as const

function LogoItems({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <>
      {PARTNER_LOGOS.map((logo, index) => (
        <div
          key={`${ariaHidden ? 'dup-' : ''}${index}-${logo.alt}`}
          className="home-partner-slider__item"
          aria-hidden={ariaHidden || undefined}
        >
          <img
            src={logo.src}
            alt={ariaHidden ? '' : logo.alt}
            width={200}
            height={80}
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
      ))}
    </>
  )
}

/** Infinite partner logo strip for the Future scroll section. */
export function HomePartnerLogoSlider() {
  return (
    <div
      className="home-partner-slider row-slider mt-lg-7 py-2"
      role="region"
      aria-label="Satellite imagery partners"
    >
      <div className="slider-logos-partners home-partner-slider__viewport">
        <div className="slider-inner animation home-partner-slider__track">
          <LogoItems />
          <LogoItems ariaHidden />
        </div>
      </div>
    </div>
  )
}
