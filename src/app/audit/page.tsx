import { Suspense } from "react";
import AuditSessionFromUrl from "@/components/AuditSessionFromUrl";

export default function StaticAuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuditSessionFromUrl />
    </Suspense>
  );
}

function Loading() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-6 sm:px-6 lg:py-8">
        <div className="rounded-lg border border-white/10 bg-surface p-6 text-sm text-muted">Loading audit session...</div>
      </section>
    </main>
  );
}
