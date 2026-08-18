import logoSrc from '../assets/inja-logo.jpg'

/**
 * The only brand raster the product ships.
 *
 * `src/assets/inja-logo.jpg` has been in this repo since July and, until this
 * file, was imported by nothing: `grep "<img" src` returned zero and the
 * product had no brand mark at all (audit S2). `object-fit: cover`, 38px at
 * radius 11 in the app bar and 76px at radius 20 on login. Never recoloured,
 * re-cropped or redrawn as SVG.
 *
 * The box is a width/height ATTRIBUTE, not a class: an `<img>` needs its
 * intrinsic box before the file arrives or the bar reflows when it lands. The
 * theme names the same two numbers as `w-logo-bar`/`h-logo-bar` and
 * `w-logo-login`/`h-logo-login` — a caller that wants the class as well passes
 * it through `className`; the report records why this file does not write one.
 *
 * `alt=""` because every place it appears it sits beside the wordmark
 * «اینجا فست‌فود»; a second announcement of the same name is noise, not access.
 */
export function Logo({
  px = 38, radius = 'rounded-input', className = '',
}: {
  px?: number
  radius?: string
  className?: string
}) {
  return (
    <img
      src={logoSrc}
      alt=""
      width={px}
      height={px}
      className={`object-cover flex-none ${radius} ${className}`.trim()}
    />
  )
}
