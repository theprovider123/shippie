/**
 * <RocketMark /> — the Shippie rocket icon.
 *
 * Renders the SVG inline so it's theme-aware and scalable.
 * Sizes: sm (24), md (40), lg (64), xl (96).
 */

const SIZES = { sm: 24, md: 40, lg: 64, xl: 128, '2xl': 192, '3xl': 256, hero: 384 } as const;

export function RocketMark({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof SIZES | number;
  className?: string;
}) {
  const px = typeof size === 'number' ? size : SIZES[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Shippie rocket"
    >
      <g transform="translate(0,10)">
        <path d="M512 180 L442 250 H582 Z" fill="#EDE4D3"/>
        <path d="M512 180 L512 250 L582 250 Z" fill="#D8C9A5" opacity="0.55"/>
        <rect x="440" y="260" width="64" height="64" fill="#3A4D35"/>
        <rect x="520" y="260" width="64" height="64" fill="#E8603C"/>
        <rect x="440" y="340" width="64" height="64" fill="#5E7B5C"/>
        <rect x="520" y="340" width="64" height="64" fill="#A8C491"/>
        <rect x="440" y="420" width="64" height="64" fill="#5E7B5C"/>
        <rect x="520" y="420" width="64" height="64" fill="#A8C491"/>
        <rect x="440" y="500" width="64" height="64" fill="#3A4D35"/>
        <rect x="520" y="500" width="64" height="64" fill="#7A9A6E"/>
        <rect x="440" y="580" width="64" height="64" fill="#7A9A6E"/>
        <rect x="520" y="580" width="64" height="64" fill="#5E7B5C"/>
        <path d="M356 516 L430 590 L430 676 L356 603 Z" fill="#5E7B5C"/>
        <path d="M356 617 L430 676 L430 708 L356 651 Z" fill="#5E7B5C"/>
        <path d="M668 516 L594 590 L594 676 L668 603 Z" fill="#A8C491"/>
        <path d="M668 617 L594 676 L594 708 L668 651 Z" fill="#A8C491"/>
        <path d="M512 652 C530 690 550 717 552 757 C537 742 522 746 512 780 C502 746 487 742 472 757 C474 717 494 690 512 652 Z" fill="#E8603C"/>
      </g>
    </svg>
  );
}
