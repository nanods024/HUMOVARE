import { ButtonLink } from '@/components/ui/Button';

/**
 * Editorial split: a full-bleed image against a block of brand copy.
 * Deliberately asymmetric so the homepage does not read as a stack of grids.
 */
/** Served from shop/public; resized copies of our_story.jpeg. */
const DEFAULT_IMAGE = '/our_story-1400.jpg';
const DEFAULT_SRCSET = '/our_story-1400.jpg 1400w, /our_story-2000.jpg 2000w';

const DEFAULT_PARAGRAPHS = [
  'HUMOVARE started with a straightforward complaint: most everyday clothing gives up early. The shoulder drops, the neck waves out, the black fades to grey — and a piece you liked becomes one you keep out of habit.',
  'So we build the other way round. Heavier fabric than the category expects, seams taped where they take strain, colour dyed to hold. Fewer pieces, made properly, in a palette that does not date.',
  'The name is about movement, and so is the mark — a figure mid-stride, cut into the H. What you wear should keep up with where you are going.',
];

export interface BrandStoryProps {
  eyebrow?: string;
  title?: string;
  highlight?: string;
  image?: string;
  paragraphs?: string[];
  cta?: { label?: string; url?: string } | null;
}

export function BrandStory({
  eyebrow = 'Our story',
  title = 'Not just clothes.',
  highlight = 'A way to move.',
  image,
  paragraphs,
  cta = { label: 'Read our story', url: '/about' },
}: BrandStoryProps = {}) {
  const body = paragraphs?.length ? paragraphs : DEFAULT_PARAGRAPHS;

  return (
    <section className="bg-surface">
      {/* Shown whole at its own shape, so a wide photo is never cropped. */}
      <img
        src={image || DEFAULT_IMAGE}
        srcSet={image ? undefined : DEFAULT_SRCSET}
        sizes="100vw"
        // Reserves the photo's shape before it loads, so the page does not jump.
        width={image ? undefined : 1400}
        height={image ? undefined : 788}
        alt="HUMOVARE editorial"
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />

      <div className="container-page grid gap-8 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="eyebrow mb-4">{eyebrow}</p>

          <h2 className="text-display-lg">
            {title}
            <br />
            <span className="text-primary">{highlight}</span>
          </h2>
        </div>

        <div className="lg:pt-8">
          <div className="max-w-prose space-y-4 text-sm leading-relaxed text-ink-muted">
            {body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          {cta?.label && (
            <div className="mt-8">
              <ButtonLink to={cta.url || '/about'} variant="outline">
                {cta.label}
              </ButtonLink>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default BrandStory;
