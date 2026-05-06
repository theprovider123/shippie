/**
 * Method page — wraps the cut + method-specific guide. Each method has
 * its own sub-component with method-specific decisions and voice.
 */

import { useState } from 'react';
import type { Cut, Doneness, Method } from '../data.ts';
import { SousVideGuide } from '../components/SousVideGuide.tsx';
import { SmokingGuide } from '../components/SmokingGuide.tsx';
import { RoastingGuide } from '../components/RoastingGuide.tsx';
import { GrillingGuide } from '../components/GrillingGuide.tsx';
import { PanGuide } from '../components/PanGuide.tsx';

interface MethodProps {
  cut: Cut;
  method: Method;
  onStart(args: { target_c: number; minutes: number; weight_kg: number | null; doneness: Doneness | null }): void;
}

export function MethodPage({ cut, method, onStart }: MethodProps) {
  const [doneness, setDoneness] = useState<Doneness>(cut.defaultDoneness ?? 'med-rare');
  const [weightKg, setWeightKg] = useState<number>(1.5);

  const usesWeight = !!cut.timing[method]?.minutes_per_kg;
  const usesDoneness = cut.donenessApplies;

  const handleStart = (args: { target_c: number; minutes: number }) => {
    onStart({
      target_c: args.target_c,
      minutes: args.minutes,
      weight_kg: usesWeight ? weightKg : null,
      doneness: usesDoneness ? doneness : null,
    });
  };

  if (method === 'sous-vide') {
    return (
      <SousVideGuide
        cut={cut}
        doneness={doneness}
        onDonenessChange={setDoneness}
        onStart={handleStart}
      />
    );
  }
  if (method === 'smoke') {
    return (
      <SmokingGuide
        cut={cut}
        weightKg={weightKg}
        onWeightChange={setWeightKg}
        onStart={handleStart}
      />
    );
  }
  if (method === 'roast') {
    return (
      <RoastingGuide
        cut={cut}
        doneness={doneness}
        weightKg={weightKg}
        onDonenessChange={setDoneness}
        onWeightChange={setWeightKg}
        onStart={handleStart}
      />
    );
  }
  if (method === 'grill') {
    return (
      <GrillingGuide
        cut={cut}
        doneness={doneness}
        onDonenessChange={setDoneness}
        onStart={handleStart}
      />
    );
  }
  return (
    <PanGuide
      cut={cut}
      doneness={doneness}
      onDonenessChange={setDoneness}
      onStart={handleStart}
    />
  );
}
