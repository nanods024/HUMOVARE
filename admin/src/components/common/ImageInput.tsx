import { useRef, useState, type DragEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Images, X, ImageOff, ArrowLeft, ArrowRight, Star } from 'lucide-react';

import { mediaApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/queryKeys';
import { useImageUpload, ACCEPTED_IMAGE_TYPES, type UploadFolder } from '@/hooks/useImageUpload';
import { cn } from '@/utils/cn';
import { thumbUrl } from '@/utils/image';
import type { CloudinaryImage } from '@/types';
import { Button, Input, Modal, Skeleton, EmptyState } from '@/components/ui';

/**
 * Picks an image already in the library.
 *
 * Re-uploading the same photograph for a second product is the usual reason a
 * media library fills up with duplicates, so choosing an existing asset is
 * offered everywhere an upload is.
 */
export function MediaLibraryPicker({
  isOpen,
  onClose,
  onSelect,
  folder,
  multiple,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (images: CloudinaryImage[]) => void;
  folder: UploadFolder;
  multiple?: boolean;
}) {
  const [picked, setPicked] = useState<Record<string, CloudinaryImage>>({});

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.media.list({ folder, limit: 60 }),
    queryFn: () => mediaApi.list({ folder, limit: 60 }),
    enabled: isOpen,
  });

  const assets = data?.assets ?? [];
  const pickedCount = Object.keys(picked).length;

  const toggle = (id: string, image: CloudinaryImage) =>
    setPicked((current) => {
      if (current[id]) {
        const { [id]: _removed, ...rest } = current;
        return rest;
      }
      return multiple ? { ...current, [id]: image } : { [id]: image };
    });

  const confirm = () => {
    onSelect(Object.values(picked));
    setPicked({});
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Choose from the ${folder} library`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={pickedCount === 0}>
            Use {pickedCount || ''} {pickedCount === 1 ? 'image' : 'images'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="aspect-square" />)}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="Nothing in this folder yet"
          description="Upload an image and it will be available here next time."
        />
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {assets.map((asset) => {
            const isPicked = Boolean(picked[asset._id]);
            return (
              <li key={asset._id}>
                <button
                  type="button"
                  onClick={() =>
                    toggle(asset._id, {
                      url: asset.secureUrl,
                      publicId: asset.publicId,
                      alt: asset.altText || '',
                      width: asset.width,
                      height: asset.height,
                    })
                  }
                  aria-pressed={isPicked}
                  className={cn(
                    'block w-full overflow-hidden rounded-md border-2 transition-colors',
                    isPicked ? 'border-primary' : 'border-line hover:border-ink-subtle',
                  )}
                >
                  <img
                    src={thumbUrl(asset.secureUrl)}
                    alt={asset.altText || ''}
                    loading="lazy"
                    className="aspect-square w-full bg-canvas object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/**
 * One image: upload it, pick it from the library, or paste a URL.
 *
 * All three are offered because they cover different moments — a fresh
 * photograph, a reused one, and an image that already lives somewhere else.
 */
export function ImageInput({
  label,
  value,
  onChange,
  folder,
  disabled,
  hint,
  aspect = 'aspect-[4/5]',
  showUrlField = true,
  size = 'compact',
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: UploadFolder;
  disabled?: boolean;
  hint?: string;
  aspect?: string;
  /** Off for screens that should only ever hold a real upload — no pasted URL. */
  showUrlField?: boolean;
  /** `large` shows a full-width preview at the real storefront shape. */
  size?: 'compact' | 'large';
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useImageUpload(folder);
  const [isPicking, setIsPicking] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const handleFiles = async (files: FileList | File[] | null) => {
    const [image] = await upload(files);
    if (image) onChange(image.url);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(false);
    if (!disabled) void handleFiles(event.dataTransfer.files);
  };

  return (
    <div>
      <p className="field-label">{label}</p>

      <div className={cn(size === 'large' ? 'space-y-3' : 'flex gap-3')}>
        <div
          onDragOver={(event) => { event.preventDefault(); setIsOver(true); }}
          onDragLeave={() => setIsOver(false)}
          onDrop={onDrop}
          onClick={size === 'large' && !value && !disabled ? () => fileInput.current?.click() : undefined}
          className={cn(
            'grid shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-canvas transition-colors',
            size === 'large' ? 'w-full rounded-xl' : 'w-28 rounded-md',
            size === 'large' && !value && !disabled && 'cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03]',
            aspect,
            isOver && 'border-primary bg-primary/5',
          )}
        >
          {value ? (
            <img src={size === 'large' ? value : thumbUrl(value)} alt="" className="h-full w-full object-cover" />
          ) : size === 'large' ? (
            <span className="flex flex-col items-center gap-1.5 px-4 text-center">
              <Upload className="h-6 w-6 text-ink-subtle" aria-hidden="true" />
              <span className="text-sm font-medium text-ink">{isUploading ? 'Uploading…' : 'Click or drop an image here'}</span>
              <span className="text-xs text-ink-subtle">JPEG, PNG or WebP · up to 5MB</span>
            </span>
          ) : (
            <ImageOff className="h-5 w-5 text-ink-subtle" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              hidden
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              isLoading={isUploading}
              disabled={disabled}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsPicking(true)} disabled={disabled}>
              <Images className="h-3.5 w-3.5" aria-hidden="true" />
              Library
            </Button>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange('')} disabled={disabled}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </Button>
            )}
          </div>

          {showUrlField ? (
            <Input
              aria-label={`${label} URL`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="…or paste an image URL"
              disabled={disabled}
              hint={hint ?? 'Drop a file on the thumbnail, upload one, or reuse one from the library.'}
            />
          ) : (
            hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
          )}
        </div>
      </div>

      <MediaLibraryPicker
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(images) => images[0] && onChange(images[0].url)}
        folder={folder}
      />
    </div>
  );
}

/**
 * An ordered set of images. Order is meaningful — the first one is the
 * thumbnail the storefront uses everywhere — so reordering is explicit rather
 * than something you discover by dragging.
 */
export function ImageGalleryInput({
  images,
  onChange,
  folder,
  disabled,
}: {
  images: CloudinaryImage[];
  onChange: (next: CloudinaryImage[]) => void;
  folder: UploadFolder;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, isUploading, progress } = useImageUpload(folder);
  const [isPicking, setIsPicking] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const add = (next: CloudinaryImage[]) => {
    if (next.length > 0) onChange([...images, ...next]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const copy = [...images];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  const remove = (index: number) => onChange(images.filter((_, i) => i !== index));

  const setAlt = (index: number, alt: string) =>
    onChange(images.map((image, i) => (i === index ? { ...image, alt } : image)));

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => { event.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          if (!disabled) void upload(event.dataTransfer.files).then(add);
        }}
        className={cn(
          'rounded-md border border-dashed px-5 py-6 text-center transition-colors',
          isOver ? 'border-primary bg-primary/5' : 'border-line bg-canvas',
        )}
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          hidden
          onChange={(event) => void upload(event.target.files).then(add)}
        />

        <Upload className="mx-auto h-5 w-5 text-ink-subtle" aria-hidden="true" />
        <p className="mt-2 text-sm text-ink">Drop images here, or</p>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => fileInput.current?.click()} isLoading={isUploading} disabled={disabled}>
            Choose files
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsPicking(true)} disabled={disabled}>
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            From library
          </Button>
        </div>

        <p className="mt-2 text-xs text-ink-subtle">
          {isUploading && progress.total > 1
            ? `Uploading ${progress.done + 1} of ${progress.total}…`
            : 'JPEG, PNG, WebP or AVIF · up to 5MB each'}
        </p>
      </div>

      {images.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={`${image.url}-${index}`} className="overflow-hidden rounded-md border border-line">
              <div className="relative">
                <img src={thumbUrl(image.url)} alt={image.alt ?? ''} loading="lazy" className="aspect-[4/5] w-full bg-canvas object-cover" />
                {index === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-ink/80 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-white">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    Thumbnail
                  </span>
                )}
              </div>

              <div className="space-y-2 p-2">
                <Input
                  aria-label={`Alt text for image ${index + 1}`}
                  value={image.alt ?? ''}
                  onChange={(event) => setAlt(index, event.target.value)}
                  placeholder="Describe the image"
                  disabled={disabled}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={disabled || index === 0}
                      aria-label={`Move image ${index + 1} earlier`}
                      className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={disabled || index === images.length - 1}
                      aria-label={`Move image ${index + 1} later`}
                      className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label={`Remove image ${index + 1}`}
                    className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MediaLibraryPicker
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={add}
        folder={folder}
        multiple
      />
    </div>
  );
}

export default ImageInput;
