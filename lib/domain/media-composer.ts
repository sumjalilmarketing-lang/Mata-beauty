export function mediaSelectionError(files: Array<{ type: string; size: number }>): string | null {
  if (!files.length) return "Choisissez une photo ou une vidéo.";
  const videos = files.filter(file => file.type.startsWith("video/"));
  if (videos.length && files.length !== 1) return "Choisissez une seule vidéo, ou plusieurs photos sans vidéo.";
  if (videos.length) return !["video/mp4", "video/webm", "video/quicktime"].includes(videos[0].type) ? "Vidéo acceptée : MP4, WebM ou MOV." : videos[0].size > 100 * 1024 * 1024 ? "La vidéo dépasse 100 Mo." : null;
  if (files.length > 10) return "Choisissez au maximum 10 photos.";
  if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) return "Photo acceptée : JPEG, PNG ou WebP. Exportez les autres formats en JPEG.";
  return files.some(file => file.size > 12 * 1024 * 1024) ? "Chaque photo doit faire au maximum 12 Mo." : null;
}
export function cropRectangle(width: number, height: number, ratio: number, zoom: number, horizontal: number, vertical: number) {
  const baseWidth = Math.min(width, height * ratio);
  const cropWidth = baseWidth / Math.max(1, Math.min(3, zoom));
  const cropHeight = cropWidth / ratio;
  return { x: (width - cropWidth) * Math.max(0, Math.min(1, horizontal)), y: (height - cropHeight) * Math.max(0, Math.min(1, vertical)), width: cropWidth, height: cropHeight };
}
