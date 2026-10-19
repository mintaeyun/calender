import { notFound } from "next/navigation";
import { SettingsShell } from "@/features/settings/components/SettingsShell";
import { isSettingsTab } from "@/features/settings/lib/tabs";

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isSettingsTab(tab)) notFound();
  return <SettingsShell tab={tab} />;
}
