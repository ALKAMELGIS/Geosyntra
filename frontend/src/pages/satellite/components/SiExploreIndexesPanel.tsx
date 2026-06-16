import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/lib/i18n';
import {
  SI_EXPLORE_INDEX_BANDS,
  SI_EXPLORE_INDEX_TABS,
  filterSiExploreIndexBands,
  type SiExploreIndexBand,
  type SiExploreIndexTab,
} from '../utils/siExploreIndexesCatalog';
import { resolveExploreIndexLayerId } from '../utils/siExploreIndexesLayerResolve';
import { resolveExploreIndexStaticThumbUrl } from './siExploreIndexThumbAssets';
import {
  paintExploreIndexPreviewToCanvas,
  SI_EXPLORE_INDEX_PREVIEW_SIZE,
} from '../utils/siExploreIndexPreviewRaster';
import {
  measureCarouselCardStep,
  readCarouselNavState,
  scrollCarouselByStep,
  scrollToCarouselCard,
} from '../utils/siExploreIndexesCarouselScroll';
import './SiExploreIndexesPanel.css';

export type SiExploreIndexesPanelProps = {
  open: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onClose: () => void;
  activeLayerId?: string;
  layerOptions: Array<{ id: string; label: string }>;
  onSelectLayer: (layerId: string, band: SiExploreIndexBand) => void;
};

function t(lang: string | undefined, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

function ExploreIndexBandCard({
  band,
  active,
  resolvedLayerId,
  onSelect,
}: {
  band: SiExploreIndexBand;
  active: boolean;
  resolvedLayerId: string | null;
  onSelect: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticThumbUrl = resolveExploreIndexStaticThumbUrl(band.id);
  const [thumbReady, setThumbReady] = useState(!!staticThumbUrl);
  const [previewPainted, setPreviewPainted] = useState(!!staticThumbUrl);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (staticThumbUrl) return;
    const el = rootRef.current;
    if (!el || thumbReady) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setThumbReady(true);
          obs.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [thumbReady, staticThumbUrl]);

  useEffect(() => {
    if (staticThumbUrl || !thumbReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintExploreIndexPreviewToCanvas(ctx, band.id, SI_EXPLORE_INDEX_PREVIEW_SIZE);
    setPreviewPainted(true);
  }, [thumbReady, band.id, staticThumbUrl]);

  return (
    <article
      ref={rootRef}
      className={
        'si-explore-indexes-card' +
        (active ? ' si-explore-indexes-card--active' : '') +
        (resolvedLayerId ? '' : ' si-explore-indexes-card--unresolved')
      }
    >
      <button
        type="button"
        className="si-explore-indexes-card__hit"
        title={`${band.title} — ${band.description}`}
        aria-label={`${band.title}: ${band.description}`}
        aria-pressed={active}
        onClick={onSelect}
      >
        <div
          className={
            'si-explore-indexes-card__thumb' +
            (previewPainted ? ' si-explore-indexes-card__thumb--ready' : '')
          }
        >
          {staticThumbUrl ? (
            <img
              src={staticThumbUrl}
              className="si-explore-indexes-card__thumb-img"
              alt={`${band.title} satellite index preview`}
              loading="lazy"
              decoding="async"
              onLoad={() => setPreviewPainted(true)}
            />
          ) : (
            <canvas
              ref={canvasRef}
              className="si-explore-indexes-card__thumb-canvas"
              width={SI_EXPLORE_INDEX_PREVIEW_SIZE}
              height={SI_EXPLORE_INDEX_PREVIEW_SIZE}
              role="img"
              aria-label={`${band.title} satellite index preview`}
            />
          )}
        </div>
        <div className="si-explore-indexes-card__hover" aria-hidden>
          <span className="si-explore-indexes-card__hover-title">{band.title}</span>
          <span className="si-explore-indexes-card__hover-desc">{band.description}</span>
        </div>
        <span className="si-explore-indexes-card__title">{band.title}</span>
      </button>
      <button
        type="button"
        className="si-explore-indexes-card__info"
        title={band.description}
        aria-label={`Info: ${band.title}`}
        aria-expanded={infoOpen}
        onClick={e => {
          e.stopPropagation();
          setInfoOpen(o => !o);
        }}
      >
        <i className="fa-solid fa-circle-info" aria-hidden />
      </button>
      {infoOpen ? (
        <div className="si-explore-indexes-card__help" role="tooltip">
          <strong>{band.title}</strong>
          <p>{band.description}</p>
          {resolvedLayerId ? (
            <span className="si-explore-indexes-card__help-layer">Layer: {resolvedLayerId}</span>
          ) : (
            <span className="si-explore-indexes-card__help-layer si-explore-indexes-card__help-layer--warn">
              Not available in current catalog
            </span>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function SiExploreIndexesPanel({
  open,
  collapsed,
  onCollapsedChange,
  onClose,
  activeLayerId = '',
  layerOptions,
  onSelectLayer,
}: SiExploreIndexesPanelProps) {
  const { direction: dir, language } = useLanguage();
  const [tab, setTab] = useState<SiExploreIndexTab>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const bands = filterSiExploreIndexBands(tab);
  const isRtl = dir === 'rtl';
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canGoPrevious, setCanGoPrevious] = useState(false);
  const [canGoNext, setCanGoNext] = useState(false);
  const showLeftArrow = hasOverflow && canGoPrevious;
  const showRightArrow = hasOverflow && canGoNext;

  const getCarouselCards = useCallback(() => {
    const track = trackRef.current;
    if (!track) return [] as HTMLElement[];
    return Array.from(track.querySelectorAll<HTMLElement>('.si-explore-indexes-card'));
  }, []);

  const syncScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanGoPrevious(false);
      setCanGoNext(false);
      return;
    }
    const { overflow, canPrevious, canNext } = readCarouselNavState(el);
    setHasOverflow(overflow);
    setCanGoPrevious(canPrevious);
    setCanGoNext(canNext);
  }, []);

  useEffect(() => {
    if (!open || collapsed) return;
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el) return;

    const onScroll = () => syncScrollArrows();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScroll, { passive: true });

    const ro = new ResizeObserver(() => syncScrollArrows());
    ro.observe(el);
    if (track) ro.observe(track);

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(syncScrollArrows);
    });
    const t1 = window.setTimeout(syncScrollArrows, 80);
    const t2 = window.setTimeout(syncScrollArrows, 320);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [bands, collapsed, open, syncScrollArrows]);

  const navigateCards = useCallback(
    (direction: 'prev' | 'next') => {
      const el = scrollRef.current;
      if (!el) return;
      const cards = getCarouselCards();
      const step = measureCarouselCardStep(cards);
      if (cards.length) scrollToCarouselCard(cards, el, direction, isRtl);
      else scrollCarouselByStep(el, direction, step, isRtl);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(syncScrollArrows);
      });
      window.setTimeout(syncScrollArrows, 360);
    },
    [getCarouselCards, isRtl, syncScrollArrows],
  );

  if (!open) return null;

  const panel = (
    <section
      className={
        'si-explore-indexes-panel' + (collapsed ? ' si-explore-indexes-panel--collapsed' : '')
      }
      dir={dir}
      aria-label={t(language, 'Explore Indexes', 'استكشاف المؤشرات')}
      data-open={open ? 'true' : 'false'}
    >
      <header className="si-explore-indexes-panel__header">
        <div className="si-explore-indexes-panel__brand">
          <span className="si-explore-indexes-panel__emoji" aria-hidden>
            🧩
          </span>
          <span className="si-explore-indexes-panel__name">
            {t(language, 'Explore Indexes', 'استكشاف المؤشرات')}
          </span>
        </div>
        <nav className="si-explore-indexes-panel__tabs" role="tablist" aria-label="Index categories">
          {SI_EXPLORE_INDEX_TABS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={
                'si-explore-indexes-panel__tab' +
                (tab === item.id ? ' si-explore-indexes-panel__tab--on' : '')
              }
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="si-explore-indexes-panel__actions">
          <button
            type="button"
            className="si-explore-indexes-panel__collapse"
            title={collapsed ? t(language, 'Expand', 'توسيع') : t(language, 'Hide', 'إخفاء')}
            aria-label={collapsed ? t(language, 'Expand panel', 'توسيع اللوحة') : t(language, 'Collapse panel', 'طي اللوحة')}
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <span className="si-explore-indexes-panel__collapse-label">
              {collapsed ? t(language, 'Show', 'عرض') : t(language, 'Hide', 'إخفاء')}
            </span>
            <i
              className={`fa-solid fa-chevron-${collapsed ? 'up' : 'down'}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className="si-explore-indexes-panel__close"
            title={t(language, 'Close', 'إغلاق')}
            aria-label={t(language, 'Close Explore Indexes', 'إغلاق استكشاف المؤشرات')}
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      </header>

      <div className="si-explore-indexes-panel__body">
        <div className="si-explore-indexes-panel__carousel">
          <div
            className={
              'si-explore-indexes-panel__edge si-explore-indexes-panel__edge--left' +
              (showLeftArrow ? ' si-explore-indexes-panel__edge--on' : '')
            }
            aria-hidden
          />
          <div
            className={
              'si-explore-indexes-panel__edge si-explore-indexes-panel__edge--right' +
              (showRightArrow ? ' si-explore-indexes-panel__edge--on' : '')
            }
            aria-hidden
          />

          <button
            type="button"
            className={
              'si-explore-indexes-panel__arrow si-explore-indexes-panel__arrow--left' +
              (showLeftArrow ? '' : ' si-explore-indexes-panel__arrow--hidden')
            }
            aria-label={t(language, 'Previous card', 'الكارد السابق')}
            title={t(language, 'Previous card', 'الكارد السابق')}
            aria-hidden={!showLeftArrow}
            tabIndex={showLeftArrow ? 0 : -1}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              if (!showLeftArrow) return;
              navigateCards('prev');
            }}
          >
            <i className="fa-solid fa-chevron-left" aria-hidden />
          </button>

          <div className="si-explore-indexes-panel__scroll" ref={scrollRef} dir={dir}>
            <div className="si-explore-indexes-panel__track" ref={trackRef}>
              {bands.map(band => {
                const resolved = resolveExploreIndexLayerId(band, layerOptions);
                const active =
                  !!resolved &&
                  (activeLayerId === resolved ||
                    normEq(activeLayerId, resolved) ||
                    normEq(activeLayerId, band.title));
                return (
                  <ExploreIndexBandCard
                    key={band.id}
                    band={band}
                    active={active}
                    resolvedLayerId={resolved}
                    onSelect={() => {
                      if (resolved) onSelectLayer(resolved, band);
                    }}
                  />
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={
              'si-explore-indexes-panel__arrow si-explore-indexes-panel__arrow--right' +
              (showRightArrow ? '' : ' si-explore-indexes-panel__arrow--hidden')
            }
            aria-label={t(language, 'Next card', 'الكارد التالي')}
            title={t(language, 'Next card', 'الكارد التالي')}
            aria-hidden={!showRightArrow}
            tabIndex={showRightArrow ? 0 : -1}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              if (!showRightArrow) return;
              navigateCards('next');
            }}
          >
            <i className="fa-solid fa-chevron-right" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}

function normEq(a: string, b: string): boolean {
  return (
    String(a || '')
      .trim()
      .toUpperCase() ===
    String(b || '')
      .trim()
      .toUpperCase()
  );
}
