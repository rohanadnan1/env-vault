'use client';

import { SWRConfig } from 'swr';
import { apiFetcher, defaultConfig } from '@/lib/swr-config';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <SWRConfig value={{ fetcher: apiFetcher, ...defaultConfig }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </SWRConfig>
  );
}
