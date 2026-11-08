"use client";
import { ClientControlCenter } from "@/app/client-control-center";
export function AccountSettings({ userId }: { userId: string }) {
  return <ClientControlCenter userId={userId} section="settings" embedded personalAccount />;
}
