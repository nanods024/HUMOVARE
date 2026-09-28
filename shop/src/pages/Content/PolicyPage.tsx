import { useSeo } from '@/hooks/useSeo';

import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { useStoreSettings, fillCopy } from '@/hooks/useStoreSettings';

type PolicyKey = 'shipping' | 'returns' | 'privacy' | 'terms';

interface PolicySection {
  heading: string;
  body: string[];
}

interface Policy {
  title: string;
  description: string;
  intro: string;
  sections: PolicySection[];
}

/**
 * Policy copy lives in one structured object so all four pages share a single
 * layout, table of contents and SEO treatment.
 *
 * NOTE: this is plain-language commercial copy written for HUMOVARE, not
 * legal advice. Have it reviewed before going live in a real jurisdiction.
 */
const POLICIES: Record<PolicyKey, Policy> = {
  shipping: {
    title: 'Shipping',
    description: 'How and when HUMOVARE orders are dispatched and delivered across India.',
    intro:
      'We ship across India from our facility in Visakhapatnam. Here is exactly what to expect once you place an order.',
    sections: [
      {
        heading: 'Dispatch',
        body: [
          'Orders placed before 4pm IST on a working day are picked and packed the same day. Everything else goes out within {dispatch}.',
          'You will receive a tracking link by email the moment the parcel is handed to our courier partner.',
        ],
      },
      {
        heading: 'Delivery times',
        body: [
          'Metro cities: 3–4 working days from dispatch.',
          'Rest of India: 4–6 working days from dispatch.',
          'Remote and hill PIN codes can take 2–3 days longer. The courier will contact you directly if access is restricted.',
        ],
      },
      {
        heading: 'Shipping charges',
        body: [
          'Free standard shipping on all orders above {freeAbove}.',
          'A flat {fee} applies to orders below {freeAbove}. The charge is always shown in your bag before you pay — there is never anything extra collected at the door.',
        ],
      },
      {
        heading: 'Cash on delivery',
        body: [
          '{codLine}',
        ],
      },
      {
        heading: 'A parcel that has gone quiet',
        body: [
          'If tracking has not updated in three working days, contact us with your order number and we will chase the courier on your behalf.',
        ],
      },
    ],
  },

  returns: {
    title: 'Returns & exchanges',
    description: 'HUMOVARE returns policy — {returnDays} returns on unworn pieces, with free pickup.',
    intro:
      'If something does not work out, we make it straightforward. No arguing, no restocking fees.',
    sections: [
      {
        heading: 'The window',
        body: [
          'You have {returnDays} from delivery to start a return.',
          'Pieces must be unworn and unwashed, with the original tags still attached and in their original packaging.',
        ],
      },
      {
        heading: 'How to start one',
        body: [
          'Go to your orders page, open the order and choose "Return". Tell us which pieces and why.',
          'We arrange a free pickup from the same address. Most pickups happen within 2–3 working days.',
        ],
      },
      {
        heading: 'Exchanges',
        body: [
          'We do not currently swap sizes directly. Return the piece and place a new order in the size you need — it is faster than an exchange, and you are not waiting on our stock to move twice.',
        ],
      },
      {
        heading: 'What we cannot take back',
        body: [
          'Pieces that have been worn, washed, altered or damaged after delivery.',
          'Anything returned without its tags.',
          'Items marked as a final-sale clearance at the time of purchase.',
        ],
      },
      {
        heading: 'If something arrives wrong or faulty',
        body: [
          'Contact us within 48 hours of delivery with a photograph and your order number. We will replace it, and we will cover the return.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    description: 'What data HUMOVARE collects, why we collect it, and the control you have over it.',
    intro:
      'We collect the minimum we need to sell you clothes and get them to your door. We do not sell your data to anyone.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account details: your name, email address and (optionally) your phone number.',
          'Order details: delivery addresses, what you bought and your order history.',
          'Technical data: basic device and browser information, plus the pages you visit on this site, used to keep the store working and improve it.',
        ],
      },
      {
        heading: 'What we never store',
        body: [
          'We do not store card numbers, CVVs or UPI credentials. Online payments are handled entirely by our payment provider — those details never reach our servers.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          'To process and deliver your orders, and to handle returns.',
          'To answer your support messages.',
          'To send you marketing email, only if you have asked for it. Every one of those has a one-click unsubscribe.',
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          'Courier partners, so they can deliver your parcel.',
          'Our payment provider, to take payment.',
          'Infrastructure providers who host the store and its database.',
          'We do not sell or rent your personal data to third parties, for any purpose.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'We use cookies that are necessary for the store to function — keeping you signed in, and remembering what is in your bag. We do not run advertising trackers.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          `You can ask for a copy of the data we hold on you, ask us to correct it, or ask us to delete your account entirely. Email {email} and we will action it within 30 days.`,
          'Note that we must retain order and invoice records for the period required by tax law, even after an account is closed.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Traffic is encrypted in transit. Passwords are hashed with bcrypt and are never stored or recoverable in plain text — which is why a reset creates a new password rather than sending you the old one.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms of service',
    description: 'The terms that apply when you shop with HUMOVARE.',
    intro:
      'These terms cover your use of this store. By placing an order you are agreeing to them.',
    sections: [
      {
        heading: 'Your account',
        body: [
          'You are responsible for keeping your password confidential and for activity that happens under your account.',
          'Tell us immediately if you think someone else has access, and we will invalidate every active session.',
        ],
      },
      {
        heading: 'Products and pricing',
        body: [
          'We photograph every piece as accurately as we can, but colours can vary slightly between screens.',
          'All prices are in Indian Rupees and include applicable taxes.',
          'Prices and availability can change without notice. If a genuine pricing error occurs, we will contact you before processing the order and you may cancel it.',
        ],
      },
      {
        heading: 'Orders',
        body: [
          'An order is an offer to buy. It is accepted once we confirm it, and a contract forms at that point.',
          'We may decline or cancel an order where stock has run out, where we cannot verify the delivery details, or where we suspect fraudulent use.',
        ],
      },
      {
        heading: 'Intellectual property',
        body: [
          'The HUMOVARE name, logo, product photography, graphics and site content belong to us. Please do not reproduce them commercially without written permission.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'To the extent permitted by law, our liability for any order is limited to the amount you paid for it.',
          'Nothing in these terms limits your statutory rights as a consumer.',
        ],
      },
      {
        heading: 'Governing law',
        body: [
          'These terms are governed by the laws of India, and the courts of Visakhapatnam, Andhra Pradesh have exclusive jurisdiction over any dispute.',
        ],
      },
      {
        heading: 'Changes',
        body: [
          'We may update these terms. The version in force is the one published here on the day you place your order.',
        ],
      },
    ],
  },
};

export function PolicyPage({ policy }: { policy: PolicyKey }) {
  const store = useStoreSettings();
  const BRAND = store.brand;
  const codWhere = store.cod.area ? `only for deliveries in ${store.cod.area.city}` : 'on most PIN codes';
  const codLimit = store.cod.maxOrderValue > 0 ? `, on orders up to ${store.text.codMax}` : '';
  const codElsewhere = store.cod.area ? ' Every other address pays online at checkout.' : '';
  const codLine = store.cod.enabled
    ? `COD is available ${codWhere}${codLimit}.${codElsewhere} Please keep the exact amount ready; some courier partners cannot provide change.`
    : 'Cash on delivery is not available at the moment. Every order is paid online at checkout.';
  // Settings-driven numbers (shipping fee, returns window…) are filled in here.
  const fill = (text: string) => fillCopy(text, store).replace('{codLine}', codLine);
  const raw = POLICIES[policy];
  const content = {
    ...raw,
    description: fill(raw.description),
    intro: fill(raw.intro),
    sections: raw.sections.map((section) => ({ ...section, body: section.body.map(fill) })),
  };

  useSeo({
    title: content.title,
    description: content.description,
    canonicalPath: `/${policy}`,
  });

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: content.title }]} />

      <header className="my-6 max-w-prose md:my-10">
        <h1 className="text-display-md">{content.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">{content.intro}</p>
        <p className="mt-4 text-xs uppercase tracking-wider text-ink-subtle">
          Last updated {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_16rem] lg:gap-16">
        <article className="max-w-prose space-y-10">
          {content.sections.map((section, index) => (
            <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-24">
              <h2 className="font-sans text-base font-semibold normal-case">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section className="border-t border-line pt-8">
            <h2 className="font-sans text-base font-semibold normal-case">Questions</h2>
            <p className="mt-3 text-sm text-ink-muted">
              Email{' '}
              <a href={`mailto:${BRAND.email}`} className="underline underline-offset-4">
                {BRAND.email}
              </a>{' '}
              and a person will get back to you.
            </p>
          </section>
        </article>

        {/* On-page table of contents; these documents get long. */}
        <nav aria-label="On this page" className="hidden lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:block lg:h-fit">
          <p className="eyebrow mb-3">On this page</p>
          <ul className="space-y-2 border-l border-line pl-4">
            {content.sections.map((section, index) => (
              <li key={section.heading}>
                <a
                  href={`#section-${index + 1}`}
                  className="text-xs text-ink-muted transition-colors hover:text-ink"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export default PolicyPage;
