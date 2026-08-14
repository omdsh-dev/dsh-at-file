/**
 * `at-file` locale namespace: referenced-path dock and settings copy.
 * Chinese is the product copy; English mirrors it.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'dock.aria': '已引用的工作区路径',
  'dock.remove': '移除 {name}',
  'nav': '文件提及',
  'settings.title': '工作区文件提及',
  'settings.subtitle': '在输入框输入 @ 搜索并引用工作区路径；插件只传递路径，不读取文件内容。',
  'settings.enabled': '启用 @ 文件提及',
  'settings.enabledDesc': '关闭后隐藏 @ 路径选择器与引用条，并停止向模型标记所选路径。',
  'settings.ignoreFiles': '忽略的文件名',
  'settings.ignoreFilesDesc': '这些文件不会进入工作区路径索引。',
  'settings.ignoreFilesHint': '每行填写一个完整文件名，匹配时不区分大小写。留空可取消文件过滤。',
  'settings.save': '保存过滤设置',
  'settings.saving': '正在保存',
} satisfies Record<string, string>

/** The `at-file` namespace key union. */
export type AtFileKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'dock.aria': 'Referenced workspace paths',
  'dock.remove': 'Remove {name}',
  'nav': 'File mentions',
  'settings.title': 'Workspace file mentions',
  'settings.subtitle': 'Type @ to search and reference a workspace path; the plugin passes the path without reading file content.',
  'settings.enabled': 'Enable @ file mentions',
  'settings.enabledDesc': 'Turning this off hides the @ path picker and reference dock, and stops marking selected paths for the model.',
  'settings.ignoreFiles': 'Ignored file names',
  'settings.ignoreFilesDesc': 'These files are excluded from the workspace path index.',
  'settings.ignoreFilesHint': 'Enter one complete file name per line. Matching is case-insensitive. Leave empty to disable file filtering.',
  'settings.save': 'Save filters',
  'settings.saving': 'Saving',
} satisfies Record<AtFileKey, string>

/** Locale namespace id registered under ctx.locale. */
export const NS = 'at-file'

/**
 * Fill one dictionary template's `{name}`-style placeholders.
 * @param template - dictionary text.
 * @param params - placeholder values; absent params replace nothing.
 * @returns the filled text.
 */
export function fmt(template: string, params?: Record<string, string>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => params[key] ?? whole)
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The @file reference and settings copy. */
    [NS]: AtFileKey
  }
}
