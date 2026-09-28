import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';

import { homepageApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { toast } from '@/store/toastStore';
import type { HomepageSection } from '@/types';
import { ImageInput } from '@/components/common/ImageInput';
import { Modal, Button, Input, Textarea, Select } from '@/components/ui';


/**
 * Which fields each section type actually renders.
 *
 * Showing a hero's CTA fields on a trust strip would invite an admin to fill in
 * something the storefront never displays, so the form is driven by the type.
 */
const FIELDS: Record<string, string[]> = {
  // The hero is image-only on the storefront now — no heading, no copy, no
  // second button — so those fields were removed here too. An admin filling
  // one in would see it saved but never rendered.
  hero: ['image', 'mobileImage', 'primaryCta'],
  categories: ['title', 'description', 'link'],
  collections: ['eyebrow', 'title', 'description', 'link'],
  productRail: ['eyebrow', 'title', 'description', 'link', 'source', 'limit'],
  brandStory: ['eyebrow', 'title', 'highlight', 'image', 'paragraphs', 'primaryCta'],
  styleRail: ['eyebrow', 'title', 'description', 'tiles'],
  quality: ['eyebrow', 'title', 'description', 'image', 'pillars'],
  community: ['eyebrow', 'title', 'description', 'link', 'instaLink'],
  trust: ['title', 'pillars'],
};

interface Props {
  section: HomepageSection;
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
}

export function SectionEditor({ section, onClose, onSaved, readOnly }: Props) {
  const [form, setForm] = useState<Record<string, unknown>>({});

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => homepageApi.update(section._id, payload),
    onSuccess: () => {
      toast.success(`${section.name} saved`);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save this section')),
  });

  const fields = FIELDS[section.type] ?? ['title', 'description'];

  const value = (key: string) =>
    form[key] !== undefined ? form[key] : (section as unknown as Record<string, unknown>)[key];

  const set = (key: string, next: unknown) => setForm((current) => ({ ...current, [key]: next }));

  const setCta = (key: 'primaryCta' | 'link', field: 'label' | 'url', next: string) => {
    const existing = (value(key) ?? {}) as Record<string, unknown>;
    set(key, { ...existing, [field]: next });
  };

  const setImage = (key: 'image' | 'mobileImage', url: string) => {
    const existing = (value(key) ?? {}) as Record<string, unknown>;
    // Clearing the field removes the image rather than storing an empty URL.
    set(key, url ? { ...existing, url } : null);
  };

  /** Repeatable items — community tiles, style tiles, pillars, paragraphs. */
  const items = (value('items') ?? []) as Record<string, unknown>[];
  const setItem = (index: number, field: string, next: string) => {
    const copy = items.map((item, i) => (i === index ? { ...item, [field]: next } : item));
    set('items', copy);
  };
  const addItem = (template: Record<string, unknown>) => set('items', [...items, template]);
  const removeItem = (index: number) => set('items', items.filter((_, i) => i !== index));

  const isDirty = Object.keys(form).length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit — ${section.name}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(form)} isLoading={save.isPending} disabled={!isDirty || readOnly}>
            Save section
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {fields.includes('eyebrow') && (
          <Input label="Eyebrow" value={String(value('eyebrow') ?? '')} onChange={(e) => set('eyebrow', e.target.value)} disabled={readOnly} hint="Small label above the heading." />
        )}

        {fields.includes('title') && (
          <Input label="Heading" value={String(value('title') ?? '')} onChange={(e) => set('title', e.target.value)} disabled={readOnly} />
        )}

        {fields.includes('highlight') && (
          <Input
            label="Highlighted word"
            value={String(value('highlight') ?? '')}
            onChange={(e) => set('highlight', e.target.value)}
            disabled={readOnly}
            hint="Rendered in brand red on the second line of the heading."
          />
        )}

        {fields.includes('description') && (
          <Textarea label="Description" rows={3} value={String(value('description') ?? '')} onChange={(e) => set('description', e.target.value)} disabled={readOnly} />
        )}

        {fields.includes('source') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Products shown"
              value={String(value('source') ?? 'manual')}
              onChange={(e) => set('source', e.target.value)}
              disabled={readOnly}
              hint="Automatic rails follow the product flags."
            >
              <option value="newDrops">New drops</option>
              <option value="bestsellers">Bestsellers</option>
              <option value="featured">Featured</option>
              <option value="sale">On sale</option>
              <option value="designerExclusive">Designer Wear - Exclusive</option>
              <option value="manual">Hand-picked</option>
            </Select>
            <Input
              label="Maximum products"
              type="number"
              min={1}
              max={24}
              value={String(value('limit') ?? 8)}
              onChange={(e) => set('limit', Number(e.target.value))}
              disabled={readOnly}
            />
          </div>
        )}

        {fields.includes('image') && (
          <ImageInput
            label="Image"
            value={String(((value('image') ?? {}) as { url?: string }).url ?? '')}
            onChange={(url) => setImage('image', url)}
            folder="homepage"
            disabled={readOnly}
            aspect="aspect-[4/3]"
          />
        )}

        {fields.includes('mobileImage') && (
          <ImageInput
            label="Mobile image (optional)"
            value={String(((value('mobileImage') ?? {}) as { url?: string }).url ?? '')}
            onChange={(url) => setImage('mobileImage', url)}
            folder="homepage"
            disabled={readOnly}
            aspect="aspect-[3/4]"
            hint="Used on phones when the main image crops badly."
          />
        )}

        {(fields.includes('primaryCta') || fields.includes('link')) && (
          <div className="space-y-3 rounded-md border border-line bg-canvas p-4">
            <p className="text-xs font-medium text-ink-muted">Calls to action</p>

            {fields.includes('primaryCta') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Primary button label" value={String(((value('primaryCta') ?? {}) as { label?: string }).label ?? '')} onChange={(e) => setCta('primaryCta', 'label', e.target.value)} disabled={readOnly} />
                <Input label="Primary button link" value={String(((value('primaryCta') ?? {}) as { url?: string }).url ?? '')} onChange={(e) => setCta('primaryCta', 'url', e.target.value)} disabled={readOnly} />
              </div>
            )}

            {fields.includes('link') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Section link label" value={String(((value('link') ?? {}) as { label?: string }).label ?? '')} onChange={(e) => setCta('link', 'label', e.target.value)} disabled={readOnly} />
                <Input label="Section link URL" value={String(((value('link') ?? {}) as { url?: string }).url ?? '')} onChange={(e) => setCta('link', 'url', e.target.value)} disabled={readOnly} />
              </div>
            )}
          </div>
        )}

        {fields.includes('paragraphs') && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-muted">Body paragraphs</p>
            {items.map((item, index) => (
              <Textarea
                key={index}
                rows={3}
                aria-label={`Paragraph ${index + 1}`}
                value={String(item.text ?? '')}
                onChange={(e) => setItem(index, 'text', e.target.value)}
                disabled={readOnly}
              />
            ))}
          </div>
        )}

        {fields.includes('instaLink') && (
          <p className="rounded-md border border-line bg-canvas px-4 py-3 text-sm text-ink-muted">
            The posts themselves are managed on the{' '}
            <Link to="/instagram" className="font-medium text-ink underline underline-offset-2">
              Insta posts
            </Link>{' '}
            screen, where a link is all you need to paste.
          </p>
        )}

        {(fields.includes('tiles') || fields.includes('pillars')) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-muted">
                {fields.includes('pillars') ? 'Pillars' : 'Tiles'}
              </p>
              {fields.includes('tiles') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addItem({ slug: '', title: '', copy: '', url: '', image: '' })}
                  disabled={readOnly}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add tile
                </Button>
              )}
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-md border border-line bg-canvas p-3 sm:grid-cols-2">
                {fields.includes('tiles') && (
                  <div className="flex justify-end sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={readOnly}
                      aria-label={`Remove tile ${index + 1}`}
                      className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
                <Input
                  label="Title"
                  value={String(item.title ?? '')}
                  onChange={(e) => setItem(index, 'title', e.target.value)}
                  disabled={readOnly}
                />
                <Input
                  label="Copy"
                  value={String(item.copy ?? '')}
                  onChange={(e) => setItem(index, 'copy', e.target.value)}
                  disabled={readOnly}
                />
                {'image' in item && (
                  <div className="sm:col-span-2">
                    <ImageInput
                      label="Image"
                      value={String(item.image ?? '')}
                      onChange={(next) => setItem(index, 'image', next)}
                      folder="homepage"
                      disabled={readOnly}
                      aspect="aspect-[3/4]"
                    />
                  </div>
                )}
                {'url' in item && (
                  <Input
                    label="Links to"
                    containerClassName="sm:col-span-2"
                    value={String(item.url ?? '')}
                    onChange={(e) => setItem(index, 'url', e.target.value)}
                    disabled={readOnly}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Input
            label="Publish from (optional)"
            type="datetime-local"
            value={String(value('startAt') ?? '').slice(0, 16)}
            onChange={(e) => set('startAt', e.target.value || null)}
            disabled={readOnly}
            hint="Leave blank to publish immediately."
          />
          <Input
            label="Publish until (optional)"
            type="datetime-local"
            value={String(value('endAt') ?? '').slice(0, 16)}
            onChange={(e) => set('endAt', e.target.value || null)}
            disabled={readOnly}
            hint="Leave blank to run indefinitely."
          />
        </div>
      </div>
    </Modal>
  );
}

export default SectionEditor;
