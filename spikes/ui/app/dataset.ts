// Spike C001-T-023: the data the prototype page loads from `/data.json`. Built by
// `spikes/ui/prepare.ts` from a benchmark change's intake document (C001-IF-008 `intake.json`)
// and the file contents at its head, or by `spikes/ui/synthetic.ts`. Types only: shared by the
// page and the Node.js side.

export interface SpikeLine {
  readonly kind: 'added' | 'deleted';
  readonly text: string;
}

export interface SpikeHunk {
  readonly hunkId: string;
  readonly path: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly SpikeLine[];
}

export interface SpikeFile {
  readonly path: string;
  readonly changeType: 'added' | 'deleted' | 'modified' | 'renamed';
  readonly binary: boolean;
  /** The side shown in the file context: the head, or the base for a deleted file. */
  readonly side: 'new' | 'old';
  /** The file's text on that side; null for a binary file. */
  readonly text: string | null;
}

export interface SpikeGroup {
  readonly id: string;
  readonly name: string;
}

export interface SpikeDataset {
  readonly schema: 'sdd-review-ui-spike-data/1';
  readonly id: string;
  readonly source: 'benchmark' | 'synthetic';
  readonly changedLines: number;
  readonly files: readonly SpikeFile[];
  /** In the order of the intake document. */
  readonly hunks: readonly SpikeHunk[];
  /** Stand-ins for intents (2 to 10): the intake has no intents before C001-T-044. */
  readonly groups: readonly SpikeGroup[];
  /** hunkId to group id: the starting assignment. */
  readonly assignment: Readonly<Record<string, string>>;
}
