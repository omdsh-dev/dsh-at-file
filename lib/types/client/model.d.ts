/**
 * Pure display projections for the @file picker: the split of a relative path
 * into basename + directory for the picker rows. The Host validates selected
 * paths and adds existence-only reference markers at send time.
 */
/** The directory prefix of a forward-slash relative path ('' for root-level files). */
export declare function dirnameOf(relative: string): string;
/** The basename of a forward-slash relative path. */
export declare function basenameOf(relative: string): string;
