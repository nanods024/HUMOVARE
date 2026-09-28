import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

interface LogoProps {
  /** Controls the rendered height, e.g. `h-7 md:h-8`. */
  className?: string;
  /** Render as plain markup when the logo already sits inside a link. */
  asLink?: boolean;
}

/**
 * The HUMOVARE wordmark.
 *
 * Shipped as the supplied brand artwork rather than redrawn type — the
 * letterforms are custom and the walking figure inside the H is the mark
 * itself. The asset carries its own red field, so it reads as a badge on the
 * dark canvas and needs no recolouring between light and dark contexts.
 *
 * `width`/`height` are set from the asset's intrinsic 398x144 so the header
 * reserves the right space before the image decodes.
 */
export function Logo({ className, asLink = true }: LogoProps) {
  const image = (
    <img
      // A small WebP sized for the header (the PNG stays for emails).
      src="/humovare-logo.webp"
      alt="HUMOVARE"
      width={398}
      height={144}
      className={cn('block w-auto select-none', className)}
    />
  );

  if (!asLink) return image;

  return (
    <Link to="/" aria-label="HUMOVARE — home" className="inline-flex shrink-0 items-center">
      {image}
    </Link>
  );
}

export default Logo;
