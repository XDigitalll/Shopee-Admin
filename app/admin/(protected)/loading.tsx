import { AdminStateCard } from "@/components/admin/feedback-state";

export default function AdminProtectedLoading() {
  return (
    <div className="px-6 py-8">
      <AdminStateCard
        title="A abrir o modulo"
        message="Estamos a preparar os dados principais desta area para que a navegacao responda logo."
      />
    </div>
  );
}
