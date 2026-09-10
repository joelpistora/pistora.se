import AdminUsers from "@/components/AdminUsers";
import RequireAuth from "@/components/RequireAuth";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-16">
      <RequireAuth role="admin">
        <AdminUsers />
      </RequireAuth>
    </main>
  );
}
