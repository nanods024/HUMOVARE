import type { ReactNode } from 'react';

/** Centred card for the signed-out screens other than login. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm animate-page-in">
        <div className="mb-8">
          <span className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#e5323a] to-primary-dark text-base font-bold text-white shadow-glow">
            H
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export default AuthCard;
