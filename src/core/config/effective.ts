import type { Notice } from '../../generated/analysis-results.js';
import type { Provider } from '../../generated/review-config.js';
import {
  BUILTIN_AREAS,
  DEFAULTS,
  type BuiltinAreaId,
  type ClearingRuleName,
} from './builtin-policy.js';
import type { ReviewConfiguration } from './validate.js';

/**
 * The effective review configuration of a snapshot (C001-COMP-006): the built-in policy of
 * C001-IF-005 merged with the base commit's C001-IF-004 file, or the unreadable state, in which
 * triage clears no hunk (C001-REQ-427) and the model gateway uses no model (C001-REQ-819,
 * C001-REQ-820). Recomputed from the base commit whenever it is needed (architecture.md, state
 * table); its source and ignored settings go into the triage document (`configuration`).
 */

export const CONFIGURATION_PATH = '.sdd-review/config.json';

/** `IntakeDocument.snapshot.configurationSource` of C001-IF-008. */
export interface ConfigurationSource {
  /** True when the base commit holds no review configuration (defaults apply). */
  readonly default: boolean;
  readonly commit: string;
  readonly path: string;
  readonly readable: boolean;
}

export interface GuardedAreaSetting {
  /** A built-in area ID (C001-IF-005 §2) or the name of an added area (C001-REQ-423). */
  readonly id: string;
  /** The name shown on matching hunks. */
  readonly name: string;
  readonly builtin: boolean;
  /** Configured path patterns of an added area; built-in areas are recognised by §3 to §7. */
  readonly paths: readonly string[];
  readonly description: string | null;
}

export interface EffectiveProvider {
  readonly name: string;
  readonly api: Provider['api'];
  readonly endpoint: string;
  readonly model: string;
  readonly keyEnv: string | null;
  readonly keyCredential: { readonly service: string; readonly account: string } | null;
  readonly responseFormat: NonNullable<Provider['responseFormat']>;
  readonly maxOutputTokens: number;
}

export interface EffectiveSettings {
  readonly clearing: {
    readonly rules: Readonly<Record<ClearingRuleName, boolean>>;
    readonly generatedFiles: readonly string[];
    /** The four built-in areas first, then the added areas in file order. */
    readonly guardedAreas: readonly GuardedAreaSetting[];
  };
  readonly tests: {
    readonly command: string | null;
    readonly pathPatterns: readonly string[];
    readonly coverageReports: readonly string[];
  };
  readonly evidence: { readonly scenarioCommand: string | null };
  readonly design: { readonly minCloneLength: number };
  readonly model: {
    readonly provider: EffectiveProvider | null;
    readonly cloudOptIn: boolean;
    readonly timeoutSeconds: number;
    readonly excludedPaths: readonly string[];
    readonly maxRequestBytes: number;
  };
}

interface Common {
  readonly source: ConfigurationSource;
  /** JSON pointers of the settings removed as weakening a built-in guarded area (ERR-CFG-002). */
  readonly ignoredSettings: readonly string[];
  /** ERR-CFG-002 per ignored setting, then ERR-CFG-001 or ERR-CFG-004 when unreadable. */
  readonly notices: readonly Notice[];
}

export interface ReadableConfiguration extends Common {
  readonly readable: true;
  readonly settings: EffectiveSettings;
}

export interface UnreadableConfiguration extends Common {
  readonly readable: false;
  /** ERR-CFG-004 for a foreign credential-store service, ERR-CFG-001 for every other cause. */
  readonly error: { readonly code: 'ERR-CFG-001' | 'ERR-CFG-004'; readonly cause: string };
}

export type EffectiveConfiguration = ReadableConfiguration | UnreadableConfiguration;

const BUILTIN_AREA_SETTINGS: readonly GuardedAreaSetting[] = BUILTIN_AREAS.map((area) => ({
  id: area.id satisfies BuiltinAreaId,
  name: area.name,
  builtin: true,
  paths: [],
  description: null,
}));

/** Merges a validated configuration (or none: the defaults) with the built-in policy (§9). */
export function mergeWithBuiltinPolicy(
  configuration: ReviewConfiguration | null,
): EffectiveSettings {
  const c = configuration ?? { formatVersion: 1 };
  const provider = c.model?.provider;
  return {
    clearing: {
      rules: { ...DEFAULTS.clearingRules, ...c.clearing?.rules },
      generatedFiles: [...(c.clearing?.generatedFiles ?? DEFAULTS.generatedFiles)],
      guardedAreas: [
        ...BUILTIN_AREA_SETTINGS,
        ...(c.clearing?.guardedAreas ?? []).map((area) => ({
          id: area.name,
          name: area.name,
          builtin: false,
          paths: [...area.paths],
          description: area.description ?? null,
        })),
      ],
    },
    tests: {
      command: c.tests?.command ?? DEFAULTS.testCommand,
      pathPatterns: [...(c.tests?.pathPatterns ?? DEFAULTS.testPathPatterns)],
      coverageReports: [...(c.tests?.coverageReports ?? DEFAULTS.coverageReports)],
    },
    evidence: { scenarioCommand: c.evidence?.scenarioCommand ?? DEFAULTS.scenarioCommand },
    design: { minCloneLength: c.design?.minCloneLength ?? DEFAULTS.minCloneLength },
    model: {
      provider: provider
        ? {
            name: provider.name,
            api: provider.api,
            endpoint: provider.endpoint,
            model: provider.model,
            keyEnv: provider.keyEnv ?? null,
            keyCredential: provider.keyCredential
              ? { service: provider.keyCredential.service, account: provider.keyCredential.account }
              : null,
            responseFormat: provider.responseFormat ?? DEFAULTS.responseFormat,
            maxOutputTokens: provider.maxOutputTokens ?? DEFAULTS.maxOutputTokens,
          }
        : DEFAULTS.provider,
      cloudOptIn: c.model?.cloudOptIn ?? DEFAULTS.cloudOptIn,
      timeoutSeconds: c.model?.timeoutSeconds ?? DEFAULTS.timeoutSeconds,
      excludedPaths: [...(c.model?.excludedPaths ?? DEFAULTS.excludedPaths)],
      maxRequestBytes: c.model?.maxRequestBytes ?? DEFAULTS.maxRequestBytes,
    },
  };
}

/** True when triage may clear hunks under this configuration (false: C001-REQ-427). */
export function clearingAllowed(configuration: EffectiveConfiguration): boolean {
  return configuration.readable;
}

/** The provider the gateway may use, or `null` for model-free mode (C001-REQ-801, -819, -820). */
export function configuredProvider(
  configuration: EffectiveConfiguration,
): EffectiveProvider | null {
  return configuration.readable ? configuration.settings.model.provider : null;
}

/** `TriageDocument.configuration` of C001-IF-008. */
export function triageConfiguration(configuration: EffectiveConfiguration): {
  readonly readable: boolean;
  readonly ignoredSettings: string[];
} {
  return { readable: configuration.readable, ignoredSettings: [...configuration.ignoredSettings] };
}
