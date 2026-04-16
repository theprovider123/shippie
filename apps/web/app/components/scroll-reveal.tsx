'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('visible');
          // Stagger children
          const kids = el.querySelectorAll('.reveal-child');
          kids.forEach((child, i) => {
            (child as HTMLElement).style.transitionDelay = `${i * 80}ms`;
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
