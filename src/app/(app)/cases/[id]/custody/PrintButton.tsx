'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

/** The only interactive part of an otherwise static document. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      Print or save as PDF
    </Button>
  );
}
