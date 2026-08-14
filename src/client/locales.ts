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
  'settings.ignoreFiles': '文件过滤',
  'settings.ignoreFilesDesc': '规则只匹配文件名，不匹配目录路径。可以使用完整名称或正则表达式，并单独设置大小写。',
  'settings.scope': '过滤范围',
  'settings.global': '全局',
  'settings.workspace': '工作区',
  'settings.globalTitle': '全局规则',
  'settings.globalDesc': '应用于所有工作区。',
  'settings.workspaceTitle': '工作区规则',
  'settings.workspaceDesc': '只应用于当前选择的工作区，并与全局规则同时生效。',
  'settings.workspaceSelect': '工作区',
  'settings.noWorkspace': '没有可用的工作区',
  'settings.restoreDefaults': '恢复默认',
  'settings.clearWorkspace': '清空此工作区',
  'settings.emptyGlobal': '当前没有全局过滤规则。',
  'settings.emptyWorkspace': '此工作区没有单独的过滤规则。',
  'settings.namePlaceholder': '例如 desktop.ini',
  'settings.regexPlaceholder': '例如 \\.map$ 或 ^test-',
  'settings.nameHint': '填写完整文件名，不要包含路径。',
  'settings.regexHint': '正则表达式作用于完整文件名，不包含目录路径。',
  'settings.invalidName': '文件名不能包含路径分隔符。',
  'settings.invalidRegex': '正则表达式无效。',
  'settings.duplicateName': '这个文件名已经在当前列表中。',
  'settings.inheritedName': '这个文件名已经由全局规则过滤。',
  'settings.add': '添加',
  'settings.saving': '正在保存',
  'settings.remove': '移除 {name}',
  'settings.inherited': '同时生效的全局规则',
  'settings.ruleType': '规则类型',
  'settings.kind.exact': 'Exact',
  'settings.kind.regex': 'Regex',
  'settings.caseSensitive': '区分大小写',
  'settings.caseInsensitive': '忽略大小写',
  'settings.caseSensitiveOption': '区分大小写',
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
  'settings.ignoreFiles': 'File filters',
  'settings.ignoreFilesDesc': 'Rules match basenames only, never directory paths. Use exact names or regular expressions with independent case settings.',
  'settings.scope': 'Filter scope',
  'settings.global': 'Global',
  'settings.workspace': 'Workspace',
  'settings.globalTitle': 'Global rules',
  'settings.globalDesc': 'Applied to every workspace.',
  'settings.workspaceTitle': 'Workspace rules',
  'settings.workspaceDesc': 'Applied only to the selected workspace, alongside the global rules.',
  'settings.workspaceSelect': 'Workspace',
  'settings.noWorkspace': 'No workspace is available',
  'settings.restoreDefaults': 'Restore defaults',
  'settings.clearWorkspace': 'Clear this workspace',
  'settings.emptyGlobal': 'There are no global file filters.',
  'settings.emptyWorkspace': 'This workspace has no additional file filters.',
  'settings.namePlaceholder': 'For example, desktop.ini',
  'settings.regexPlaceholder': 'For example, \\.map$ or ^test-',
  'settings.nameHint': 'Enter a complete file name without a path.',
  'settings.regexHint': 'The regular expression runs against the complete basename, without its directory path.',
  'settings.invalidName': 'A file name cannot contain path separators.',
  'settings.invalidRegex': 'The regular expression is invalid.',
  'settings.duplicateName': 'This file name is already in the current list.',
  'settings.inheritedName': 'This file name is already filtered globally.',
  'settings.add': 'Add',
  'settings.saving': 'Saving',
  'settings.remove': 'Remove {name}',
  'settings.inherited': 'Global rules also applied',
  'settings.ruleType': 'Rule type',
  'settings.kind.exact': 'Exact',
  'settings.kind.regex': 'Regex',
  'settings.caseSensitive': 'Case-sensitive',
  'settings.caseInsensitive': 'Case-insensitive',
  'settings.caseSensitiveOption': 'Case-sensitive',
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
