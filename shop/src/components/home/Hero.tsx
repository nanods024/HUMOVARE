import { ArrowDown } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';

/**
 * Full-bleed editorial hero: one photograph, no copy over it, actions
 * anchored to the bottom edge.
 *
 * The image URL is configurable rather than baked into the markup, so real
 * campaign photography can be swapped in without touching the component.
 *
 * The entrance is CSS keyframes, not Framer Motion, deliberately: this is the
 * one block that must never be stuck invisible. A JS-driven animation that
 * starts at `opacity: 0` leaves the banner blank if the bundle is slow, the
 * tab is throttled, or the script fails. `animation-fill-mode: both` means
 * the image and buttons always land visible, and it keeps the motion library
 * off the critical above-the-fold path. The global `prefers-reduced-motion`
 * rule in index.css disables it wholesale.
 */
const HERO_IMAGE =
  import.meta.env.VITE_HERO_IMAGE || 'https://picsum.photos/seed/humovare-hero-01/1920/1200';

export interface HeroProps {
  eyebrow?: string;
  title?: string;
  highlight?: string;
  description?: string;
  image?: string;
  /** Swapped in below the `sm` breakpoint when the main crop doesn't hold up on a phone. */
  mobileImage?: string;
  primaryCta?: { label?: string; url?: string } | null;
  secondaryCta?: { label?: string; url?: string } | null;
}

/**
 * `eyebrow`/`title`/`highlight`/`description` stay on the props contract so
 * the CMS section shape (and existing published content) still type-checks,
 * but the banner is image-only now, so none of them render.
 */
export function Hero({
  image = HERO_IMAGE,
  mobileImage,
  primaryCta = { label: 'Shop new drops', url: '/new-drops' },
}: HeroProps = {}) {
  return (
    <section
      aria-label="HUMOVARE — built for your movement"
      // Cancels `<main>`'s top padding so the image runs from the very top
      // of the viewport, behind the header, which starts transparent here.
      // Taller than the viewport (rather than exactly filling it) so the
      // banner reads as a big, deliberate photograph rather than a tight crop.
      className="relative -mt-20 flex min-h-[120svh] items-end overflow-hidden bg-surface-alt md:-mt-28"
    >
      <picture>
        {mobileImage && <source media="(max-width: 767px)" srcSet={mobileImage} />}
        <img
          src={image || HERO_IMAGE}
          alt=""
          decoding="sync"
          // The hero is the Largest Contentful Paint element on the homepage.
          // React 18 does not type this attribute, so it is spread in lowercase.
          {...({ fetchpriority: 'high' } as Record<string, string>)}
          className="absolute inset-0 h-full w-full origin-center animate-hero-zoom object-cover object-center"
        />
      </picture>

      {/* A bottom-weighted scrim — enough to carry the buttons without
          turning the whole photograph grey. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent"
      />

      <div className="container-page relative z-10 w-full pb-16 md:pb-20">
        <div
          className="flex animate-hero-rise justify-end"
          style={{ animationDelay: '200ms' }}
        >
          {primaryCta?.label && (
            <ButtonLink to={primaryCta.url || '/shop'} variant="primary" size="lg">
              {primaryCta.label}
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Quiet scroll affordance — the hero fills the viewport. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-6 hidden animate-fade-in justify-center text-white/60 md:flex"
        style={{ animationDelay: '600ms' }}
      >
        <ArrowDown className="h-5 w-5 animate-bounce" />
      </span>
    </section>
  );
}

export default Hero;
