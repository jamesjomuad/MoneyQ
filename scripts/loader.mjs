import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Metro allows extensionless relative imports; Node's ESM resolver does not.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/i.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.js`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true, format: 'module' };
      }
    }
    throw error;
  }
}