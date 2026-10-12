const extensionPattern = /(\.[a-z0-9]+)$/i;
const validatedExtensionPattern = /-validated(\.[a-z0-9]+)$/i;

export function validatedMessageMediaPath(sourcePath: string): string {
  return sourcePath.replace(extensionPattern, "-validated$1");
}

export function sourceMessageMediaPath(validatedPath: string): string {
  return validatedPath.replace(validatedExtensionPattern, "$1");
}
