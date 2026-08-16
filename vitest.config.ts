import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const dsh = (relative) => fileURLToPath(new URL(`../deepseek-harness/${relative}`, import.meta.url))

const decoratorSyntax = /@(?:Remote|RemoteScope)\b/

/**
 * Pre-transform standard (stage-3) decorators with the TypeScript compiler:
 * vitest's esbuild pipeline does not accept the `@Remote` decorators the host
 * runtime uses, so decorator-bearing modules pass through `ts.transpileModule`
 * first — the same approach the harness's shared vitest config takes.
 */
function standardDecoratorPlugin() {
  return {
    name: 'dsh-at-file-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText
          .replace(
            /^(\s*)(__esDecorate\()/gmu,
            '$1/* v8 ignore next -- compiler-synthetic decorator accessors have no source behavior */ $2',
          )
          .replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: {
    alias: {
      // The published /client bundles are browser module-loader format and
      // crash under Node; tests resolve the same entries to their sources.
      '@deepseek-ai/dsh-client-runtime/client': dsh('packages/client/runtime/src/client/index.ts'),
      '@deepseek-ai/dsh-client-ui-input-trigger/client': dsh('packages/client/ui-input-trigger/src/client/index.ts'),
      '@deepseek-ai/dsh-client-connection/client': dsh('packages/client/connection/src/client/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      exclude: [
        // Pure type declarations: no runtime code exists to cover.
        'src/types.ts',
      ],
    },
  },
})
