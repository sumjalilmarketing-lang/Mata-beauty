import { privateMetadata } from "@/lib/metadata/private";
export const metadata = privateMetadata;
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
