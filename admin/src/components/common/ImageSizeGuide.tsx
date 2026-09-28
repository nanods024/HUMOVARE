import { useState } from 'react';
import { ChevronDown, Ruler } from 'lucide-react';

import { cn } from '@/utils/cn';
import type { UploadFolder } from '@/hooks/useImageUpload';

interface SizeSpec {
  folder: UploadFolder;
  slot: string;
  where: string;
  ratio: string;
  /** Rendered as an `aspect-ratio`, so the shape is visible, not just stated. */
  aspect: string;
  upload: string;
  /** Slots that bypass Cloudinary's delivery pipeline and ship as uploaded. */
  unoptimised?: boolean;
}

/**
 * The sizes the storefront actually crops to.
 *
 * Every figure here comes from a real slot in the customer app — the product
 * grid is locked to 4:5, the hero to a wide crop, and so on. Uploading at
 * these ratios is what stops a photograph being cropped somewhere the
 * photographer did not intend.
 */
const SIZES: SizeSpec[] = [
  {
    folder: 'products',
    slot: 'Product photos',
    where: 'Grid cards, product page, quick view, search',
    ratio: '4:5',
    aspect: '4 / 5',
    upload: '1600 × 2000',
  },
  {
    folder: 'categories',
    slot: 'Category tiles',
    where: 'Home page categories, Shop menu',
    ratio: '4:5',
    aspect: '4 / 5',
    upload: '1200 × 1500',
  },
  {
    folder: 'collections',
    slot: 'Collection image',
    where: 'Home page “Collections” tiles, and the banner at the top of the collection page',
    ratio: '3:2',
    aspect: '3 / 2',
    upload: '1800 × 1200',
  },
  {
    folder: 'homepage',
    slot: 'Hero banner',
    where: 'Full-bleed image at the top of the home page',
    ratio: '16:10',
    aspect: '16 / 10',
    upload: '2000 × 1250',
    unoptimised: true,
  },
];

const RULES = [
  'Keep the long side at 2000px or under — anything larger is scaled down on upload, so the extra pixels only cost you time.',
  'JPEG or WebP for photographs. The same shot as a PNG is often five to ten times the file size, and the limit is 5MB per image.',
  'An off-ratio image is cropped to fit, never stretched — but you do not choose where it crops. Match the ratio when the framing matters.',
  'A product’s first image is its thumbnail everywhere; the second is what appears on hover. Give both the same ratio so the card does not jump.',];

/**
 * Reference table for whoever is doing the uploading.
 *
 * Shown where images are actually chosen rather than filed away in a document,
 * because the moment someone needs it is the moment they are looking at a file
 * picker.
 */
export function ImageSizeGuide({
  folder,
  defaultOpen = true,
  className,
}: {
  /** Narrows the table to one folder. Omit to show every slot. */
  folder?: UploadFolder;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const rows = folder ? SIZES.filter((size) => size.folder === folder) : SIZES;
  if (rows.length === 0) return null;

  return (
    <section className={cn('rounded-md border border-line bg-canvas', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <Ruler className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="flex-1 text-sm font-medium text-ink">
          {folder ? 'What size should these be?' : 'What size should each image be?'}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="border-t border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Shape</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Where it appears</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Ratio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Upload at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((size) => (
                  <tr key={`${size.folder}-${size.slot}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {/* The shape itself reads faster than "4:5" does. */}
                        <span
                          aria-hidden="true"
                          style={{ aspectRatio: size.aspect }}
                          className="h-8 shrink-0 rounded-sm border border-ink-subtle/40 bg-panel"
                        />
                        <span className="font-medium text-ink">{size.slot}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">{size.where}</td>
                    <td className="tabular py-2.5 pr-4 text-ink">{size.ratio}</td>
                    <td className="py-2.5 pr-4">
                      <span className="tabular font-medium text-ink">{size.upload}</span>
                      {size.unoptimised && (
                        <span className="block text-xs text-ink-subtle">
                          served as uploaded — keep under 400KB
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-1.5 border-t border-line px-4 py-3">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ImageSizeGuide;
