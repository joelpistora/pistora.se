import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
