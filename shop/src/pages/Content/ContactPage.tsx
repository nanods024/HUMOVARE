import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mail, Phone, Instagram, Clock, MapPin, Send } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

import { feedbackApi } from '@/api/feedback';
import { getErrorMessage } from '@/api/client';
import { toast } from '@/store/toastStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { isCustomerEmail, CUSTOMER_EMAIL_MESSAGE } from '@/utils/customerEmail';
import { useStoreSettings } from '@/hooks/useStoreSettings';

/**
 * Contact form.
 *
 * Messages are stored and land in the admin's feedback inbox rather than being
 * emailed: an inbox someone owns is more reliable than mail that depends on a
 * provider being configured, and it keeps a record of what was asked. Replies
 * go out from the shop's own mail client, to the address given here.
 */
export function ContactPage() {
  const { brand: BRAND } = useStoreSettings();
  useSeo({
    title: 'Contact us',
    description: 'Questions about an order, a size or a return? Talk to the HUMOVARE team.',
    canonicalPath: '/contact',
  });

  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = useMutation({
    mutationFn: feedbackApi.submit,
    onSuccess: () => {
      setSent(true);
      toast.success('Message received — we will reply within a day');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not send that message')),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();
    const orderNumber = String(data.get('orderNumber') ?? '').trim();

    const nextErrors: Record<string, string> = {};
    if (name.length < 2) nextErrors.name = 'Enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address';
    else if (!isCustomerEmail(email)) nextErrors.email = CUSTOMER_EMAIL_MESSAGE;
    if (message.length < 10) nextErrors.message = 'Tell us a little more (at least 10 characters)';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    send.mutate({
      name,
      email,
      // An order number is the strongest signal of what the message is about,
      // so it picks the topic rather than being buried in the body.
      topic: orderNumber ? 'order' : 'general',
      subject: orderNumber ? `Order ${orderNumber}` : '',
      message,
    });
  };

  const channels = [
    { icon: Mail, label: 'Email', value: BRAND.email, href: `mailto:${BRAND.email}` },
    { icon: Phone, label: 'Phone', value: BRAND.phone, href: `tel:${BRAND.phoneRaw}` },
    { icon: Instagram, label: 'Instagram', value: BRAND.instagramHandle, href: BRAND.instagram },
  ];

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Contact' }]} />

      <header className="my-6 md:my-10">
        <h1 className="text-display-md">Talk to us</h1>
        <p className="mt-3 max-w-prose text-sm text-ink-muted">
          Sizing, an order that has gone quiet, a return — whatever it is, a real person will read
          this and reply.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <div>
          {sent ? (
            <div className="border border-success/40 bg-success/5 p-6 rounded-2xl">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-success">
                Message sent
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Thanks for getting in touch. We reply to everything within one working day.
              </p>
              <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>
                Send another
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input label="Your name" name="name" autoComplete="name" required error={errors.name} />
                <Input label="Email" name="email" type="email" autoComplete="email" required placeholder="you@gmail.com" error={errors.email} />
              </div>

              <Input label="Order number" name="orderNumber" hint="Optional — helps us find you faster" />

              <Textarea
                label="Message"
                name="message"
                rows={6}
                required
                error={errors.message}
                placeholder="Tell us what is going on…"
              />

              <Button type="submit" variant="primary" size="lg" isLoading={send.isPending}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Send message
              </Button>
            </form>
          )}
        </div>

        <aside className="space-y-6">
          <div className="border border-line p-5 rounded-2xl">
            <h2 className="eyebrow mb-4">Other ways to reach us</h2>
            <ul className="space-y-4">
              {channels.map((channel) => (
                <li key={channel.label}>
                  <a
                    href={channel.href}
                    target={channel.label === 'Instagram' ? '_blank' : undefined}
                    rel={channel.label === 'Instagram' ? 'noreferrer noopener' : undefined}
                    className="group flex items-start gap-3"
                  >
                    <channel.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-sm">
                      <span className="block text-[0.625rem] uppercase tracking-wider text-ink-subtle">
                        {channel.label}
                      </span>
                      <span className="block text-ink underline-offset-4 group-hover:underline">
                        {channel.value}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-line p-5 rounded-2xl">
            <h2 className="eyebrow mb-3 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Studio
            </h2>
            <address className="text-sm not-italic leading-relaxed text-ink-muted">
              {BRAND.address.line1}
              <br />
              {BRAND.address.line2}
              <br />
              {BRAND.address.city}, {BRAND.address.state} {BRAND.address.postalCode}
            </address>
          </div>

          <div className="border border-line bg-surface p-5 rounded-2xl">
            <h2 className="eyebrow mb-3 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Support hours
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Monday to Saturday, 10:00 – 18:00 IST.
              <br />
              We aim to reply within one working day.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ContactPage;
