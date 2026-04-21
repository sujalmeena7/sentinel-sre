'use client';

import { LazyMotion } from 'framer-motion';
import { ReactNode } from 'react';

const loadFeatures = () => import('framer-motion').then(res => res.domMax);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}