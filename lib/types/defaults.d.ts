import type { AtFileSettings, FileIgnoreRule, FileIgnoreRuleInput, WorkspaceIgnoreFiles } from './contract.ts';
/** Directory basenames omitted from the picker unless the profile supplies its own list. */
export declare const DEFAULT_IGNORE_DIRS: readonly [".git", ".hg", ".svn", ".idea", ".vs", ".vscode", ".fleet", ".history", ".metadata", ".settings", "node_modules", "bower_components", "vendor", "Pods", ".gradle", ".kotlin", ".cxx", ".externalNativeBuild", ".dart_tool", ".swiftpm", ".build", ".cache", ".parcel-cache", ".turbo", ".nx", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".venv", "venv", ".next", ".nuxt", ".output", ".svelte-kit", ".angular", "build", "bin", "dist", "out", "target", "obj", "coverage", "DerivedData", "xcuserdata", "CMakeFiles", "cmake-build-debug", "cmake-build-release", "cmake-build-relwithdebinfo", "cmake-build-minsizerel", "_deps", ".godot", "Library", "Temp", "Logs", "Binaries", "Intermediate", "Saved", "DerivedDataCache"];
/** File basenames omitted from the picker unless the Web setting replaces the list. */
export declare const DEFAULT_IGNORE_FILES: readonly ["desktop.ini", "Thumbs.db", ".DS_Store"];
/** Fresh settings defaults for Host and browser initialization. */
export declare function defaultAtFileSettings(): AtFileSettings;
/** Trim rules and remove empty entries or duplicates with identical matching semantics. */
export declare function normalizeIgnoreFiles(values: readonly FileIgnoreRuleInput[]): FileIgnoreRuleInput[];
/** Convert one legacy or structured setting value into its canonical rule. */
export declare function normalizeIgnoreRule(value: FileIgnoreRuleInput): FileIgnoreRule | undefined;
/** Stable identity for one rule, including matching semantics. */
export declare function ignoreRuleKey(value: FileIgnoreRuleInput): string;
/** Compile rules once for a bounded directory walk. */
export declare function compileIgnoreRules(values: readonly FileIgnoreRuleInput[]): readonly FileIgnoreRule[];
/** Stable comparison key for one canonical workspace path. */
export declare function workspacePathKey(value: string): string;
/** Merge duplicate workspace rows and normalize every file-name list. */
export declare function normalizeWorkspaceIgnoreFiles(entries: readonly WorkspaceIgnoreFiles[]): WorkspaceIgnoreFiles[];
/** Workspace-local file-name filters for one canonical cwd. */
export declare function workspaceIgnoreFilesFor(entries: readonly WorkspaceIgnoreFiles[], workspace: string): FileIgnoreRuleInput[];
/** Effective file-name filters for one workspace: global rules plus local additions. */
export declare function effectiveIgnoreFiles(settings: AtFileSettings, workspace: string): FileIgnoreRuleInput[];
/** Stable cache key covering every file-name filter setting. */
export declare function ignoreFilesSettingsKey(settings: AtFileSettings): string;
