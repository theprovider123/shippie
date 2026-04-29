<script lang="ts">
  /**
   * Shippie's signature loader — 10 sage blocks build bottom-up, then the
   * sunset flame appears, then the cycle resets. 1.4s loop. CSS-only.
   * Reduced-motion users get a static rocket.
   */
  interface Props {
    label?: string;
    size?: 'sm' | 'md' | 'lg';
  }
  let { label = 'Loading', size = 'md' }: Props = $props();
</script>

<span class="loader size-{size}" role="status" aria-label={label}>
  <span class="rocket">
    <span class="blk blk-1"></span><span class="blk blk-2"></span>
    <span class="blk blk-3"></span><span class="blk blk-4"></span>
    <span class="blk blk-5"></span><span class="blk blk-6"></span>
    <span class="blk blk-7"></span><span class="blk blk-8"></span>
    <span class="blk blk-9"></span><span class="blk blk-10"></span>
    <span class="flame"></span>
  </span>
  <span class="sr-only">{label}</span>
</span>

<style>
  .loader {
    display: inline-grid;
    place-items: center;
    --blk: 10px;
    --gap: 2px;
  }
  .loader.size-sm { --blk: 7px; }
  .loader.size-lg { --blk: 14px; }

  .rocket {
    display: grid;
    grid-template-columns: repeat(2, var(--blk));
    gap: var(--gap);
    width: max-content;
  }
  .blk {
    width: var(--blk);
    height: var(--blk);
    opacity: 0;
    animation-duration: 1.4s;
    animation-iteration-count: infinite;
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  .blk-1  { background: var(--sage-deep);      animation-name: rl-1; }
  .blk-2  { background: var(--sunset);         animation-name: rl-2; }
  .blk-3  { background: var(--sage-moss);      animation-name: rl-3; }
  .blk-4  { background: var(--sage-highlight); animation-name: rl-4; }
  .blk-5  { background: var(--sage-moss);      animation-name: rl-5; }
  .blk-6  { background: var(--sage-highlight); animation-name: rl-6; }
  .blk-7  { background: var(--sage-deep);      animation-name: rl-7; }
  .blk-8  { background: var(--sage-leaf);      animation-name: rl-8; }
  .blk-9  { background: var(--sage-leaf);      animation-name: rl-9; }
  .blk-10 { background: var(--sage-moss);      animation-name: rl-10; }
  .flame {
    grid-column: 1 / 3;
    width: calc(var(--blk) * 1.2);
    height: var(--blk);
    margin: var(--gap) auto 0;
    background: linear-gradient(180deg, var(--sunset) 0%, var(--sunset-dim) 100%);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    opacity: 0;
    animation: rl-flame 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  @keyframes rl-1  { 0%, 8%  {opacity:0;transform:translateY(40%)} 14%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(0)} }
  @keyframes rl-2  { 0%, 14% {opacity:0;transform:translateY(40%)} 20%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-3  { 0%, 20% {opacity:0;transform:translateY(40%)} 26%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-4  { 0%, 26% {opacity:0;transform:translateY(40%)} 32%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-5  { 0%, 32% {opacity:0;transform:translateY(40%)} 38%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-6  { 0%, 38% {opacity:0;transform:translateY(40%)} 44%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-7  { 0%, 44% {opacity:0;transform:translateY(40%)} 50%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-8  { 0%, 50% {opacity:0;transform:translateY(40%)} 56%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-9  { 0%, 56% {opacity:0;transform:translateY(40%)} 62%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-10 { 0%, 62% {opacity:0;transform:translateY(40%)} 68%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
  @keyframes rl-flame {
    0%, 68%  { opacity: 0; transform: translateY(8px) scaleY(0.6); }
    78%, 90% { opacity: 1; transform: translateY(0) scaleY(1); }
    100%     { opacity: 0; transform: translateY(0) scaleY(0.6); }
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .blk, .flame { animation: none !important; opacity: 1 !important; transform: none !important; }
  }
</style>
