import { useState } from 'react';

import { mediaApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { toast } from '@/store/toastStore';
import type { CloudinaryImage } from '@/types';

/** The folders the server will mint a signature for. */
export type UploadFolder = 'products' | 'categories' | 'homepage' | 'banners' | 'community' | 'collections';

export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif';

/**
 * Browser → Cloudinary → our database, in that order.
 *
 * The server mints a short-lived signature with the folder, size cap and
 * transformation fixed on its side; the browser uploads straight to Cloudinary
 * with it; the server then re-verifies Cloudinary's own signature before
 * recording the asset. `CLOUDINARY_API_SECRET` never reaches the browser, and
 * a client cannot register a public id it did not upload.
 *
 * Shared by the media library, the product editor and the home page editor so
 * there is one upload path to reason about rather than three.
 */
export function useImageUpload(folder: UploadFolder) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  /** Uploads every file and resolves with the ones that succeeded. */
  const upload = async (files: FileList | File[] | null): Promise<CloudinaryImage[]> => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return [];

    setIsUploading(true);
    setProgress({ done: 0, total: list.length });

    const uploaded: CloudinaryImage[] = [];

    try {
      const signature = await mediaApi.signature(folder);

      for (const file of list) {
        if (file.size > signature.maxBytes) {
          toast.error(`${file.name} is larger than ${Math.round(signature.maxBytes / 1024 / 1024)}MB`);
          continue;
        }

        const body = new FormData();
        body.append('file', file);
        body.append('api_key', signature.apiKey);
        body.append('timestamp', String(signature.timestamp));
        body.append('signature', signature.signature);
        body.append('folder', signature.folder);
        body.append('transformation', signature.transformation);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
          { method: 'POST', body },
        );

        if (!response.ok) {
          toast.error(`Cloudinary rejected ${file.name}`);
          continue;
        }

        const result = await response.json();

        await mediaApi.register({
          publicId: result.public_id,
          version: result.version,
          signature: result.signature,
          secureUrl: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
          resourceType: result.resource_type,
          folder: signature.folder,
        });

        uploaded.push({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          alt: '',
        });

        setProgress((current) => ({ ...current, done: current.done + 1 }));
      }

      if (uploaded.length > 0) {
        toast.success(uploaded.length === 1 ? 'Image uploaded' : `${uploaded.length} images uploaded`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Upload failed'));
    } finally {
      setIsUploading(false);
      setProgress({ done: 0, total: 0 });
    }

    return uploaded;
  };

  return { upload, isUploading, progress };
}

export default useImageUpload;
