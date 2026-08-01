import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, defaultResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (isRelative && !hasExtension && context.parentURL?.startsWith('file://')) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const candidatePath = path.resolve(parentDir, `${specifier}.ts`);
    if (await fileExists(candidatePath)) {
      return defaultResolve(pathToFileURL(candidatePath).href, context, defaultResolve);
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
}
