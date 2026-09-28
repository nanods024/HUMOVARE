import { Shirt, Scissors, Droplets, Sparkles, Layers } from 'lucide-react';
import { SectionHeader } from './SectionHeader';

const PILLARS = [
  {
    icon: Layers,
    title: 'Heavyweight fabric',
    copy: '240–400 GSM combed cotton and brushed fleece. Substantial enough to hold a shape wash after wash.',
  },
  {
    icon: Scissors,
    title: 'Honest construction',
    copy: 'Taped shoulder seams, flat-locked joins and bound necks — the details that decide whether a piece lasts.',
  },
  {
    icon: Sparkles,
    title: 'Print that survives',
    copy: 'Water-based and high-density inks, double-cured so a graphic will not crack along the fold.',
  },
  {
    icon: Shirt,
    title: 'Considered fit',
    copy: 'Every silhouette gets its own block — oversized, regular and boxy are drafted separately, not graded from one pattern.',
  },
  {
    icon: Droplets,
    title: 'Colour that holds',
    copy: 'Reactive dyes and a cold rinse, so black stays black rather than drifting to grey.',
  },
];

/**
 * Quality storytelling. Sits on a dark panel to break up the white canvas
 * roughly halfway down the homepage.
 */
export interface QualityProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  image?: string;
  pillars?: { title?: string; copy?: string }[];
}

export function QualitySection({
  eyebrow = 'Made properly',
  title = 'Built to be worn',
  description = 'Premium is not a price point. It is what the piece looks like after thirty washes.',
  image,
  pillars,
}: QualityProps = {}) {
  // Icons stay in code; the admin edits the words next to them.
  const entries = pillars?.length
    ? pillars.map((pillar, index) => ({
        icon: PILLARS[index]?.icon ?? PILLARS[0].icon,
        title: pillar.title ?? '',
        copy: pillar.copy ?? '',
      }))
    : PILLARS;

  return (
    <section className="on-dark bg-canvas py-16 text-ink md:py-24">
      <div className="container-page">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />

        <div className="grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3 overflow-hidden rounded-2xl">
          {entries.map((pillar) => (
            <article key={pillar.title} className="bg-canvas p-6 md:p-8">
              <pillar.icon className="h-6 w-6 text-primary" strokeWidth={1.4} aria-hidden="true" />
              <h3 className="mt-5 text-sm font-bold uppercase tracking-wider">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{pillar.copy}</p>
            </article>
          ))}

          <div className="relative hidden min-h-[14rem] bg-canvas md:col-span-1 md:block">
            <img
              src={image || "https://picsum.photos/seed/humovare-fabric-detail/800/800"}
              alt="Close-up of HUMOVARE fabric and stitching"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default QualitySection;
