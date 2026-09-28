import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Upload, Trash2, Copy, Check } from 'lucide-react';

import { mediaApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { useImageUpload, ACCEPTED_IMAGE_TYPES, type UploadFolder } from '@/hooks/useImageUpload';
import { ImageSizeGuide } from '@/components/common/ImageSizeGuide';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { thumbUrl, previewUrl } from '@/utils/image';
import type { MediaAsset } from '@/types';
import {
  PageHeader, Panel, Button, Select, Modal, Skeleton, EmptyState, ErrorState,
  Pagination, ConfirmDialog,
} from '@/components/ui';

// The folders an admin browses here. Homepage and Instagram images are
// still uploaded from their own screens; they show under "All folders".
const FOLDERS: UploadFolder[] = ['products', 'categories', 'collections'];

/** What each folder is for, so the choice is not a guess. */
const FOLDER_HINTS: Partial<Record<UploadFolder, string>> = {
  products: 'Product photography',
  categories: 'Category tiles',
  collections: 'Collection images',
  homepage: 'Home page sections',
  banners: 'Promotional banners',
  community: 'Instagram wall posts',
};

/**
 * Media library.
 *
 * Uploads go straight from the browser to Cloudinary using a signature minted
 * by our server — the API secret never reaches the client, and the folder and
 * size limits are fixed server-side rather than trusted from the form.
 */

/** A 4-column grid: 24 fills whole rows. */
const MEDIA_PAGE_SIZE = 24;
export function MediaPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const fileInput = useRef<HTMLInputElement>(null);

  const [inspecting, setInspecting] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [copied, setCopied] = useState('');
  const [isOver, setIsOver] = useState(false);

  // Old links (?folder=banners) open Collections; folders no longer in the
  // picker (homepage, community) fall back to "All folders".
  const rawFolder = params.folder === 'banners' ? 'collections' : params.folder;
  const selectedFolder = FOLDERS.includes(rawFolder as UploadFolder) ? (rawFolder as UploadFolder) : undefined;
  const folder = selectedFolder ?? 'products';
  const { upload, isUploading, progress } = useImageUpload(folder);
  const query = { page, limit: MEDIA_PAGE_SIZE, folder: selectedFolder };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.media.list(query),
    queryFn: () => mediaApi.list(query),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.media.all });

  const remove = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => mediaApi.remove(id, force),
    onSuccess: () => {
      toast.success('Media deleted');
      setDeleting(null);
      invalidate();
    },
    // A 409 here means the asset is still referenced — the message explains it.
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete that asset')),
  });

  /** One upload path, shared with the product and home page editors. */
  const handleFiles = async (files: FileList | File[] | null) => {
    const uploaded = await upload(files);
    if (uploaded.length > 0) invalidate();
    if (fileInput.current) fileInput.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(false);
    if (can(P.MEDIA_UPLOAD)) void handleFiles(event.dataTransfer.files);
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.error('Could not copy — select the link instead');
    }
  };

  const assets = data?.assets ?? [];
  const pagination = data?.pagination;

  if (isError) return <ErrorState title="Could not load the media library" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Media"
        description="Images are stored in Cloudinary and delivered with automatic format and quality."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Media' }]}
        actions={
          can(P.MEDIA_UPLOAD) && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                hidden
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <Button onClick={() => fileInput.current?.click()} isLoading={isUploading}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload to /{folder}
              </Button>
            </>
          )
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <Select
            value={selectedFolder ?? ''}
            onChange={(event) => setParam('folder', event.target.value || undefined)}
            aria-label="Filter by folder"
            className="w-56"
          >
            <option value="">All folders</option>
            {FOLDERS.map((name) => (
              <option key={name} value={name}>
                {name} — {FOLDER_HINTS[name]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-ink-subtle">
            Uploads land in <strong className="font-medium text-ink">/{folder}</strong> ·
            JPEG, PNG, WebP or AVIF · up to 5MB each
          </p>
        </div>

        {can(P.MEDIA_UPLOAD) && (
          <div className="px-5 pt-5">
            <div
              onDragOver={(event) => { event.preventDefault(); setIsOver(true); }}
              onDragLeave={() => setIsOver(false)}
              onDrop={onDrop}
              className={cn(
                'rounded-md border border-dashed px-5 py-8 text-center transition-colors',
                isOver ? 'border-primary bg-primary/5' : 'border-line bg-canvas',
              )}
            >
              <Upload className="mx-auto h-6 w-6 text-ink-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink">
                Drop images here to upload them to <strong className="font-medium">/{folder}</strong>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => fileInput.current?.click()}
                isLoading={isUploading}
              >
                Choose files
              </Button>
              {isUploading && progress.total > 1 && (
                <p className="mt-2 text-xs text-ink-subtle">
                  Uploading {progress.done + 1} of {progress.total}…
                </p>
              )}
            </div>

            <ImageSizeGuide
              folder={selectedFolder}
              className="mt-4"
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No media yet"
            description="Upload product photography, category tiles and home page imagery here."
          />
        ) : (
          <ul className="stagger grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 xl:grid-cols-6">
            {assets.map((asset) => (
              <li key={asset._id} className="group relative overflow-hidden rounded-xl border border-line/80 bg-panel transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-lift">
                <button
                  type="button"
                  onClick={() => setInspecting(asset)}
                  className="block w-full overflow-hidden"
                  aria-label={`Inspect ${asset.publicId}`}
                >
                  <img
                    src={thumbUrl(asset.secureUrl)}
                    alt={asset.altText || ''}
                    loading="lazy"
                    className="aspect-square w-full bg-canvas object-cover transition-transform duration-500 ease-smooth group-hover:scale-105"
                  />
                </button>

                <div className="flex items-center gap-1 border-t border-line bg-panel px-2 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-[0.6875rem] text-ink-subtle">
                    {asset.publicId.split('/').pop()}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyUrl(asset.secureUrl)}
                    aria-label="Copy URL"
                    className="rounded p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
                  >
                    {copied === asset.secureUrl ? (
                      <Check className="h-3 w-3 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                  {can(P.MEDIA_DELETE) && (
                    <button
                      type="button"
                      onClick={() => setDeleting(asset)}
                      aria-label="Delete"
                      className="rounded p-1 text-ink-subtle hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pagination && (
          <Pagination
            pageSize={MEDIA_PAGE_SIZE}
            page={pagination.currentPage}
            totalPages={pagination.totalPages}
            total={pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>

      <Modal isOpen={Boolean(inspecting)} onClose={() => setInspecting(null)} title="Media details" size="lg">
        {inspecting && (
          <div className="grid gap-4 sm:grid-cols-2">
            <img src={previewUrl(inspecting.secureUrl)} alt={inspecting.altText || ''} className="w-full rounded-md border border-line" />
            <dl className="space-y-2.5 text-sm">
              <div><dt className="text-xs text-ink-subtle">Public ID</dt><dd className="break-all font-mono text-xs">{inspecting.publicId}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Dimensions</dt><dd>{inspecting.width} × {inspecting.height}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Size</dt><dd>{Math.round(inspecting.bytes / 1024)} KB · {inspecting.format}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Uploaded</dt><dd>{formatDate(inspecting.createdAt)} by {inspecting.uploadedBy?.name ?? 'unknown'}</dd></div>
              <div>
                <dt className="text-xs text-ink-subtle">URL</dt>
                <dd className="break-all text-xs">{inspecting.secureUrl}</dd>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyUrl(inspecting.secureUrl)}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy URL
              </Button>
            </dl>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate({ id: deleting._id, force: false })}
        title="Delete this image?"
        message="It is removed from Cloudinary permanently. If a published product or page still uses it, the deletion is refused."
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
    </>
  );
}

export default MediaPage;
