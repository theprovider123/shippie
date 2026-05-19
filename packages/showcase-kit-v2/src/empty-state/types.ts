import type { ReactNode } from 'react';

export type EmptyStateAction =
  | { label: string; onClick: () => void }
  | { label: string; href: string };

export type EmptyStateProps = {
  eyebrow: string;
  headline: ReactNode;
  body?: ReactNode;
  cta?: EmptyStateAction;
  className?: string;
};
