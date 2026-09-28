import { ButtonLink } from '@/components/ui/Button';

/**
 * Editorial split: a full-bleed image against a block of brand copy.
 * Deliberately asymmetric so the homepage does not read as a stack of grids.
 */
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
    <section className="grid md:grid-cols-2">
      <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[34rem]">
        <img
          src={image || 'https://picsum.photos/seed/humovare-story-01/1000/1250'}
          alt="HUMOVARE editorial"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-col justify-center bg-surface px-gutter py-14 md:py-20 lg:px-16">
        <p className="eyebrow mb-4">{eyebrow}</p>

        <h2 className="text-display-lg">
          {title}
          <br />
          <span className="text-primary">{highlight}</span>
        </h2>

        <div className="mt-6 max-w-prose space-y-4 text-sm leading-relaxed text-ink-muted">
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
    </section>
  );
}

export default BrandStory;
