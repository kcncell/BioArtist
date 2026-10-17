/**
 * Chem Studio ACS default: terminal methyl is a bare bond end, not the text CH3.
 *
 * Ketcher's factory "Show hydrogen labels" is "Terminal and Hetero", which
 * draws CH3 on terminal carbons. "Hetero" keeps H on O, N, and other
 * heteroatoms and leaves carbon labels off. Carbon atoms stay implicit
 * (carbonExplicitly is already false).
 *
 * This module must be imported before ketcher-react. Ketcher copies
 * localStorage key "ketcher-opts" into its settings form while that
 * package first loads.
 */

const KETCHER_OPTS_KEY = 'ketcher-opts';
const APPLIED_MARK = 'bioartist.chem.implicitMethylDefault';
/** Ketcher ShowHydrogenLabels.TerminalAndHetero */
const FACTORY_HYDROGEN_LABELS = 'Terminal and Hetero';
/** Ketcher ShowHydrogenLabels.Hetero */
const ACS_HYDROGEN_LABELS = 'Hetero';

export function ensureImplicitMethylDefault(): void {
  try {
    if (localStorage.getItem(APPLIED_MARK) === '1') return;
    const raw = localStorage.getItem(KETCHER_OPTS_KEY);
    let saved: Record<string, unknown> = {};
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        saved = parsed as Record<string, unknown>;
      }
    }
    const label = saved.showHydrogenLabels;
    // A choice other than the factory default is left as the user saved it.
    if (typeof label === 'string' && label !== FACTORY_HYDROGEN_LABELS) {
      localStorage.setItem(APPLIED_MARK, '1');
      return;
    }
    saved.showHydrogenLabels = ACS_HYDROGEN_LABELS;
    localStorage.setItem(KETCHER_OPTS_KEY, JSON.stringify(saved));
    localStorage.setItem(APPLIED_MARK, '1');
  } catch {
    /* private mode or a bad saved blob */
  }
}

ensureImplicitMethylDefault();
