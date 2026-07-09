import { store } from "@/lib/db";
import DeploymentDetail from "@/components/DeploymentDetail";

export const dynamic = "force-dynamic";

export default async function DeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Touch the store so the DB file exists before the client polls.
  store.get(id);
  return <DeploymentDetail id={id} />;
}
