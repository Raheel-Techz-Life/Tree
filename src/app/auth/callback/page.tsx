import { Suspense } from 'react';
import CallbackClient from './CallbackClient';

export const dynamic = 'force-dynamic';

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="center-page">
          <div className="card">
            <h1>Signing you in…</h1>
          </div>
        </div>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
