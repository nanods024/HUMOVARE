import { useSeo } from '@/hooks/useSeo';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ButtonLink } from '@/components/ui/Button';
import { TrustSection } from '@/components/home/TrustSection';
import { useStoreSettings } from '@/hooks/useStoreSettings';

export function AboutPage() {
  const { text: shopText } = useStoreSettings();
  useSeo({
    title: 'About HUMOVARE',
    description:
      'HUMOVARE makes premium everyday essentials built to outlast the category — heavier fabric, honest construction, colour that holds.',
    canonicalPath: '/about',
  });

  return (
    <>
      <div className="relative flex min-h-[46svh] items-end overflow-hidden bg-canvas">
        <img
          src="https://picsum.photos/seed/humovare-about-hero/1920/1000"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 to-black/20" />

        <div className="container-page relative pb-12 pt-24">
          <h1 className="text-display-lg text-white">
            Not just clothing.
            <br />
            <span className="text-primary">A movement.</span>
          </h1>
        </div>
      </div>

      <div className="container-page py-4">
        <Breadcrumbs items={[{ label: 'About' }]} />
      </div>

      <article id="story" className="container-page max-w-prose pb-16 md:pb-24">
        <p className="eyebrow mb-4">Our story</p>

        <div className="space-y-5 text-base leading-relaxed text-ink-muted">
          <p className="text-lg text-ink">
            HUMOVARE began with a straightforward complaint: most everyday clothing gives up early.
          </p>
          <p>
            The shoulder drops after a month. The neckline waves out. The black you bought fades to
            a tired grey, and a piece you genuinely liked becomes one you keep out of habit rather
            than choice. None of that is inevitable — it is what happens when a garment is costed
            down until only the photograph survives.
          </p>
          <p>
            So we build the other way round. We start at 240 GSM where the category starts at 160.
            Shoulders are taped, necks are bound rather than simply folded, and prints are cured
            twice so they survive the fold instead of cracking along it. Colour is laid down with
            reactive dyes and a cold rinse, which is slower and more expensive, and is the reason
            our black is still black at wash thirty.
          </p>
          <p>
            We also make fewer things. Every piece in the range has to earn its place against what
            is already there, which keeps the palette tight and means anything you buy works with
            everything else you own from us.
          </p>
          <p>
            The name is about movement, and so is the mark — a figure mid-stride, cut into the H.
            What you wear should keep up with where you are going, not quietly hold you back.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { value: '240–400', label: 'GSM fabric weight' },
            { value: shopText.returnDays, label: 'No-fuss returns' },
            { value: '48 hrs', label: 'Dispatch window' },
          ].map((stat) => (
            <div key={stat.label} className="border border-line p-5 rounded-2xl">
              <p className="font-display text-2xl">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-ink-muted">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink to="/shop" variant="primary">
            Shop the collection
          </ButtonLink>
          <ButtonLink to="/contact" variant="outline">
            Talk to us
          </ButtonLink>
        </div>
      </article>

      <TrustSection />
    </>
  );
}

export default AboutPage;
