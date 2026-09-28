import { ExternalLink } from 'lucide-react';

import type { EmbedStatus } from '@/hooks/useInstagramEmbeds';

/**
 * One post, rendered by Instagram.
 *
 * Instagram does not allow a post's media to be played from another origin, so
 * this is their embed rather than our own player: the avatar, the video, the
 * like count and the comment box all come from them, which is also what makes
 * the card look like the real thing rather than a screenshot of one.
 *
 * The blockquote is the seed. Their script replaces it in place; until it does
 * — or if it never does, because the script is blocked or the post has been
 * deleted — the caption and link below are what the visitor sees.
 */
export function InstagramEmbed({
  url,
  caption,
  status,
}: {
  url: string;
  caption?: string;
  status: EmbedStatus;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-[26rem] flex-1">
        {status !== 'ready' && status !== 'failed' && (
          <div className="skeleton absolute inset-0 rounded-md" aria-hidden="true" />
        )}

        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ background: '#FFF', margin: 0, maxWidth: '100%', minWidth: 0, width: '100%' }}
        />
      </div>

      {status === 'failed' && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted underline underline-offset-4 hover:text-primary"
        >
          {caption || 'Open this post on Instagram'}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

export default InstagramEmbed;
