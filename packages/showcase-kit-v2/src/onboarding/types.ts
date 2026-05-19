import type { ReactNode } from 'react';

export type OnboardingSlide = {
  title: ReactNode;
  body: ReactNode;
  cta?: string;
};

export type OnboardingFlowProps = {
  appSlug: string;
  version: number;
  slides: OnboardingSlide[];
  onComplete?: () => void;
};
