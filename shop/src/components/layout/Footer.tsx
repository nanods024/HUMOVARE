import { Link } from 'react-router-dom';
import { Instagram, MessageCircle, ShieldCheck, Truck, RotateCcw, Headphones } from 'lucide-react';
import { Logo } from './Logo';
import { Newsletter } from '@/components/home/Newsletter';
import { useStoreSettings } from '@/hooks/useStoreSettings';


const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'T-Shirts', to: '/t-shirts' },
      { label: 'Hoodies', to: '/hoodies' },
      { label: 'Shirts', to: '/shirts' },
      { label: 'Bottom Wear', to: '/bottom-wear' },
      { label: 'New Drops', to: '/new-drops' },
      { label: 'Bestsellers', to: '/bestsellers' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Contact Us', to: '/contact' },
      { label: 'Track Order', to: '/account/orders' },
      { label: 'Returns', to: '/returns' },
      { label: 'Shipping', to: '/shipping' },
      { label: 'FAQs', to: '/faq' },
      { label: 'Size Guide', to: '/faq#size-guide' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About HUMOVARE', to: '/about' },
      { label: 'Our Story', to: '/about#story' },
      { label: 'Contact', to: '/contact' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
];

const ASSURANCES = [
  { label: 'Secure payments', icon: ShieldCheck },
  { label: 'Fast shipping', icon: Truck },
  { label: 'Easy returns', icon: RotateCcw },
  { label: 'Real support', icon: Headphones },
];

const CREDIT_NAME = 'Nano Digital Services';

export function Footer() {
  const { brand: BRAND, cod } = useStoreSettings();
  const SOCIALS = [
    { label: 'Instagram', href: BRAND.instagram, icon: Instagram },
    { label: 'WhatsApp', href: BRAND.whatsapp, icon: MessageCircle },
  ];

  return (
    <footer className="border-t border-line bg-surface">
      <Newsletter />

      <div className="container-page grid gap-10 border-t border-line py-14 md:grid-cols-2 lg:grid-cols-5 lg:gap-8">
        <div className="lg:col-span-2">
          <Logo className="h-9" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-muted">
            Printed tees and heavyweight hoodies, cut from cotton that holds its shape. Not just
            clothing — a movement.
          </p>

          <address className="mt-5 text-xs not-italic leading-relaxed text-ink-subtle">
            {BRAND.address.line1}
            <br />
            {BRAND.address.line2}
            <br />
            {BRAND.address.city} {BRAND.address.postalCode}
            <br />
            <a href={`tel:${BRAND.phoneRaw}`} className="transition-colors hover:text-ink">
              {BRAND.phone}
            </a>
          </address>

          <ul className="mt-6 flex gap-3">
            {SOCIALS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={social.label}
                  className="grid h-10 w-10 place-items-center border border-line transition-colors hover:border-primary hover:text-primary rounded-xl"
                >
                  <social.icon className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="eyebrow mb-4 text-ink">{column.title}</h2>
            <ul className="space-y-2.5">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.label}`}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container-page border-t border-line py-6">
        <ul className="grid grid-cols-2 gap-4 md:flex md:justify-between">
          {ASSURANCES.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-xs text-ink-muted">
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="container-page flex flex-col gap-3 border-t border-line py-6 text-xs text-ink-muted md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Secure checkout</span>
          <span aria-hidden="true">·</span>
          <span>UPI · Cards · Net banking{cod.enabled ? ' · COD' : ''}</span>
        </p>
      </div>

      {/* Credit strip — same surface as the rest of the footer, so it reads
          as one continuous band rather than a separate bar. */}
      <div className="bg-surface pb-6">
        <p className="container-page flex items-center justify-center gap-1.5 text-[0.6875rem] tracking-wide text-ink-subtle">
          Powered by
          {/* Only the name is the link. At rest it is plain text; while the
              cursor is on it, a wave runs through the letters — each one
              springs up and turns brand red a moment after the one before. */}
          <a
            href="https://nanodigitalservices.onrender.com/"
            target="_blank"
            rel="noreferrer noopener"
            aria-label={CREDIT_NAME}
            className="group inline-flex font-semibold text-ink-muted focus-visible:outline-none"
          >
            {CREDIT_NAME.split('').map((char, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="inline-block whitespace-pre transition-[transform,color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-[3px] group-hover:text-primary group-focus-visible:-translate-y-[3px] group-focus-visible:text-primary"
                style={{ transitionDelay: `${index * 22}ms` }}
              >
                {char}
              </span>
            ))}
          </a>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
