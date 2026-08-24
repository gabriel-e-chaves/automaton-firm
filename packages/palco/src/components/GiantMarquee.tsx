/**
 * The pxpush.com giant text band, rebuilt for A Firma.
 *
 * On the reference site a fixed, full-width strip of huge display type scrolls
 * slowly across the page (.marqueeText: fixed, 17vw tall, pointer-events none).
 * The owner remembered it as "white stripes passing across the page"; it never
 * made it into any branch here, so this is a fresh build, not a restore.
 *
 * Ours sits BEHIND the content as a low-contrast watermark: z-index 0, ink at
 * 5% alpha, aria-hidden, no pointer interception, and gone entirely under
 * prefers-reduced-motion. The copy is the firm's own vocabulary, static on
 * purpose — live numbers scrolling as a watermark would look like a second
 * (unlabelled) ticker.
 */
const WORDS = ["A FIRMA", "DINHEIRO DE PAPEL", "90 DIAS VIRGENS", "DARWINISMO COM CNPJ"];

export function GiantMarquee() {
  // Two identical tracks make the loop seamless: when the first has scrolled
  // fully out, the second is exactly where the first began.
  const track = WORDS.map((w) => `${w} · `).join("");
  return (
    <div className="giant-marquee" aria-hidden="true">
      <div className="giant-marquee-track">
        <span>{track}</span>
        <span>{track}</span>
      </div>
    </div>
  );
}
