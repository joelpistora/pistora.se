import { Suspense } from "react";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading…</p>}>
        <ChangePasswordForm />
      </Suspense>
    </main>
  );
}
