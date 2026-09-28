import { useSeo } from '@/hooks/useSeo';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { AccordionItem } from '@/components/ui/Accordion';
import { ButtonLink } from '@/components/ui/Button';
import { SizeGuideTables } from '@/components/product/SizeGuideTables';
import { useStoreSettings, fillCopy } from '@/hooks/useStoreSettings';

const FAQS = [
  {
    question: 'How do HUMOVARE sizes run?',
    answer:
      'Our regular fits are true to size. Oversized and boxy pieces are cut deliberately roomy — if you want a closer silhouette, take one size down. Every product page lists the exact measurements for that garment.',
  },
  {
    question: 'How long does delivery take?',
    answer:
      'Orders are dispatched within {dispatch}. Metro PIN codes usually receive in 3–4 working days; the rest of India in 4–6. You will get a tracking link by email as soon as the parcel leaves us.',
  },
  {
    question: 'What does shipping cost?',
    answer:
      'Free on orders above {freeAbove}. Below that a flat {fee} applies, shown before you pay. There are no surprise charges at the door.',
  },
  {
    question: 'Can I return something?',
    answer:
      'Yes — within {returnDays} of delivery, as long as the piece is unworn, unwashed and still has its tags. Start the return from your orders page and we will arrange a pickup.',
  },
  {
    question: 'Can I change or cancel my order?',
    answer:
      'You can cancel from your orders page any time before the parcel is handed to the courier. After that it becomes a return. To change a size, cancel and reorder — it is faster than editing.',
  },
  {
    question: 'Will a sold-out piece come back?',
    answer:
      'Core pieces are restocked. Seasonal drops and limited graphics usually are not. Join the HUMOVARE list and you will hear about restocks first.',
  },
  {
    question: 'How should I wash my HUMOVARE pieces?',
    answer:
      'Cold machine wash with like colours, no bleach, tumble dry low. Iron warm and avoid going directly over any print. Heavyweight cotton holds up well — heat is the main thing that shortens its life.',
  },
];

export function FaqPage() {
  const store = useStoreSettings();
  const faqs = FAQS.map((faq) => ({ ...faq, answer: fillCopy(faq.answer, store) }));
  useSeo({
    title: 'FAQs & size guide',
    description:
      'Answers on HUMOVARE sizing, shipping, returns and care — plus the full size guide.',
    canonicalPath: '/faq',
    // FAQPage markup can earn an expandable result in search.
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  });

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'FAQs' }]} />

      <header className="my-6 md:my-10">
        <h1 className="text-display-md">Frequently asked</h1>
        <p className="mt-3 max-w-prose text-sm text-ink-muted">
          The questions we get most. If yours is not here, we are one message away.
        </p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <div className="min-w-0">
          <div className="acct-card max-w-prose px-5 sm:px-6">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} title={faq.question} className="last:border-b-0">
                {faq.answer}
              </AccordionItem>
            ))}
          </div>

          <section id="size-guide" className="mt-16 scroll-mt-24">
            <h2 className="text-display-sm">Size guide</h2>
            <p className="mb-6 mt-3 max-w-prose text-sm text-ink-muted">
              All measurements in inches, taken with the garment laid flat.
            </p>
            <SizeGuideTables />
          </section>
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:h-fit">
          <div className="acct-card p-5 sm:p-6">
            <h2 className="eyebrow mb-3">Still stuck?</h2>
            <p className="mb-5 text-sm text-ink-muted">
              Send us the order number and what went wrong. We reply within a working day.
            </p>
            <ButtonLink to="/contact" variant="primary" fullWidth>
              Contact us
            </ButtonLink>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default FaqPage;
