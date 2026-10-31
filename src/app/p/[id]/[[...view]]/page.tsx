import { Workspace } from "@/components/workspace/Workspace";

export default async function Page({ params }: { params: Promise<{ id: string; view?: string[] }> }) {
  const { id, view } = await params;
  return <Workspace projectId={id} view={view?.[0] ?? "workspace"} />;
}
