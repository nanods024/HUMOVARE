import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Instagram, Plus, X, ArrowUp, ArrowDown, Save, ExternalLink, AlertTriangle, Film, Image as ImageIcon } from 'lucide-react';

import { homepageApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import {
  PageHeader, Panel, Button, Input, Textarea, Badge, Skeleton, ErrorState, EmptyState, Pagination,
} from '@/components/ui';
import { PAGE_SIZE, usePagedList } from '@/lib/pagination';

const SITE_URL = import.meta.env.VITE_SITE_URL || (import.meta.env.PROD ? 'https://humovare.in' : 'http://localhost:5173');

interface Post {
  id?: string;
  url?: string;
  caption?: string;
  /** Kept so a wall that used uploaded stills still round-trips. */
  image?: string;
  alt?: string;
}

/** Only a post permalink can be embedded — a profile or a story cannot. */
const POST_PATTERN = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i;

const isReel = (url: string) => /instagram\.com\/(reel|reels)\//i.test(url);

/** Strips the tracking query Instagram appends to a copied link. */
function tidy(url: string) {
  const clean = url.trim();
  if (!clean) return '';

  try {
    const parsed = new URL(clean);
    parsed.search = '';
    parsed.hash = '';
    // Instagram's own embeds expect the trailing slash.
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
    return parsed.toString();
  } catch {
    return clean;
  }
}

/**
 * Instagram posts on the home page.
 *
 * The wall is a section of the home page, so this screen edits that section
 * rather than owning its own store — one source of truth, and the storefront
 * already reads it. It exists as its own screen because adding a post is a
 * weekly job and should not mean hunting through a generic section editor.
 *
 * Only the link is needed: Instagram supplies the photograph, the video, the
 * handle and the like count. Nothing is uploaded here.
 */
export function InstagramPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const readOnly = !can(P.HOMEPAGE_MANAGE);

  const [heading, setHeading] = useState({ eyebrow: '', title: '', description: '' });
  const [posts, setPosts] = useState<Post[]>([]);
  const postPage = usePagedList(posts);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.homepage,
    queryFn: () => homepageApi.list(),
  });

  const section = data?.sections.find((item) => item.type === 'community');

  // Load the saved section once, then let the form own the state.
  useEffect(() => {
    if (!section || isDirty) return;
    setHeading({
      eyebrow: section.eyebrow ?? '',
      title: section.title ?? '',
      description: section.description ?? '',
    });
    setPosts(((section.items ?? []) as Post[]).map((item) => ({ ...item })));
  }, [section, isDirty]);

  const save = useMutation({
    mutationFn: () =>
      homepageApi.update(section!._id, {
        eyebrow: heading.eyebrow,
        title: heading.title,
        description: heading.description,
        items: posts
          .filter((post) => (post.url ?? '').trim() || post.image)
          .map((post, index) => ({
            id: post.id || `post-${index + 1}`,
            url: tidy(post.url ?? ''),
            caption: post.caption ?? '',
            image: post.image ?? '',
            alt: post.alt ?? '',
          })),
      }),
    onSuccess: () => {
      toast.success('Instagram wall saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save the wall')),
  });

  const change = (next: Post[]) => {
    setPosts(next);
    setIsDirty(true);
  };

  const setPost = (index: number, field: keyof Post, value: string) =>
    change(posts.map((post, i) => (i === index ? { ...post, [field]: value } : post)));

  const add = () => {
    change([...posts, { id: `post-${Date.now()}`, url: '', caption: '' }]);
    // The new, empty post goes at the end; show the page it landed on.
    postPage.setPage(Math.ceil((posts.length + 1) / PAGE_SIZE));
  };
  const remove = (index: number) => change(posts.filter((_, i) => i !== index));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= posts.length) return;
    const copy = [...posts];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    change(copy);
  };

  const invalid = posts.filter((post) => (post.url ?? '').trim() && !POST_PATTERN.test(tidy(post.url ?? '')));
  const embeddable = posts.filter((post) => POST_PATTERN.test(tidy(post.url ?? '')));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !section) {
    return (
      <ErrorState
        title="Could not load the Instagram wall"
        description="The community section is missing from the home page. Run the admin seed to restore it."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Insta posts"
        description="The Instagram wall on the home page. Paste a post link and Instagram renders the rest — photo or reel, handle, likes and comments."
        breadcrumbs={[{ label: 'Storefront' }, { label: 'Insta posts' }]}
        actions={
          <>
            <a
              href={`${SITE_URL}/#community`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm text-ink hover:bg-canvas"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View live
            </a>
            <Button
              onClick={() => save.mutate()}
              isLoading={save.isPending}
              disabled={!isDirty || readOnly || invalid.length > 0}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isDirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />

      {readOnly && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          You have read-only access to storefront content.
        </p>
      )}

      <div className="stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="space-y-6">
          <Panel
            title="Posts"
            description={`${embeddable.length} ${embeddable.length === 1 ? 'post' : 'posts'} will render on the home page.`}
            actions={
              !readOnly && (
                <Button size="sm" variant="outline" onClick={add}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add post
                </Button>
              )
            }
          >
            {posts.length === 0 ? (
              <EmptyState
                icon={Instagram}
                title="No posts yet"
                description="Until you add one, the home page shows plain photography instead of the Instagram wall."
                action={!readOnly && <Button onClick={add}>Add the first post</Button>}
              />
            ) : (
              <ul className="divide-y divide-line">
                {postPage.entries.map(({ item: post, index }) => {
                  const url = tidy(post.url ?? '');
                  const valid = POST_PATTERN.test(url);
                  const reel = valid && isReel(url);

                  return (
                    <li key={post.id ?? index} className="flex items-start gap-3 p-4">
                      <span
                        className={cn(
                          'mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                          valid ? 'bg-primary/10 text-primary' : 'bg-canvas text-ink-subtle',
                        )}
                        aria-hidden="true"
                      >
                        {reel ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          aria-label={`Instagram link ${index + 1}`}
                          value={post.url ?? ''}
                          onChange={(event) => setPost(index, 'url', event.target.value)}
                          placeholder="https://www.instagram.com/reel/XXXXXXXXXXX/"
                          disabled={readOnly}
                          error={
                            (post.url ?? '').trim() && !valid
                              ? 'That is not a post link — open the post, tap Share, then Copy link'
                              : undefined
                          }
                        />

                        <Input
                          aria-label={`Caption ${index + 1}`}
                          value={post.caption ?? ''}
                          onChange={(event) => setPost(index, 'caption', event.target.value)}
                          placeholder="Short note (optional) — only shown if Instagram cannot load"
                          disabled={readOnly}
                        />

                        {valid && (
                          <p className="flex items-center gap-2 text-xs text-ink-subtle">
                            <Badge tone={reel ? 'info' : 'neutral'}>{reel ? 'Reel' : 'Post'}</Badge>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="truncate underline underline-offset-2 hover:text-ink"
                            >
                              {url.replace('https://www.instagram.com', '')}
                            </a>
                          </p>
                        )}
                      </div>

                      {!readOnly && (
                        <div className="flex shrink-0 flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => move(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move post ${index + 1} earlier`}
                            className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(index, 1)}
                            disabled={index === posts.length - 1}
                            aria-label={`Move post ${index + 1} later`}
                            className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove post ${index + 1}`}
                            className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {posts.length > 0 && (
              <Pagination
                pageSize={PAGE_SIZE}
                page={postPage.page}
                totalPages={postPage.totalPages}
                total={postPage.total}
                onChange={postPage.setPage}
              />
            )}
          </Panel>

          <Panel title="Section heading" description="The copy above the wall.">
            <div className="space-y-4 p-5">
              <Input
                label="Eyebrow"
                value={heading.eyebrow}
                onChange={(event) => { setHeading({ ...heading, eyebrow: event.target.value }); setIsDirty(true); }}
                disabled={readOnly}
                placeholder="Tag @humovare"
              />
              <Input
                label="Heading"
                value={heading.title}
                onChange={(event) => { setHeading({ ...heading, title: event.target.value }); setIsDirty(true); }}
                disabled={readOnly}
                placeholder="The HUMOVARE community"
              />
              <Textarea
                label="Description"
                rows={2}
                value={heading.description}
                onChange={(event) => { setHeading({ ...heading, description: event.target.value }); setIsDirty(true); }}
                disabled={readOnly}
              />
            </div>
          </Panel>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          <Panel title="How to get a link">
            <ol className="space-y-2.5 p-5 text-sm text-ink-muted">
              <li>1. Open the post or reel in Instagram.</li>
              <li>2. Tap the <strong className="font-medium text-ink">share</strong> icon, then <strong className="font-medium text-ink">Copy link</strong>.</li>
              <li>3. Paste it above. The tracking bit is trimmed for you.</li>
            </ol>
            <div className="border-t border-line px-5 py-3 text-xs text-ink-subtle">
              The post has to be public. A private or deleted post shows the
              caption and a link out instead of the embed.
            </div>
          </Panel>

          {invalid.length > 0 && (
            <Panel title="Before you save">
              <p className="flex items-start gap-2 p-5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {invalid.length} {invalid.length === 1 ? 'link is' : 'links are'} not an
                Instagram post. Fix or remove {invalid.length === 1 ? 'it' : 'them'} to save.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {isDirty && !readOnly && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-panel border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-ink">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setIsDirty(false); refetch(); }}>
              Discard
            </Button>
            <Button size="sm" onClick={() => save.mutate()} isLoading={save.isPending} disabled={invalid.length > 0}>
              Save
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default InstagramPage;
