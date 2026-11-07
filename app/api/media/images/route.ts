import { handleImageUpload } from "@/lib/media/image-upload-server";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleImageUpload(request); }
