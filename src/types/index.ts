import type { Canvas, FabricObject } from 'fabric';
import type { LibraryIcon } from '../data/catalog';

export type ToolId =
  | 'library'
  | 'uploads'
  | 'bioicons'
  | 'nih'
  | 'servier'
  | 'shapes'
  | 'lines'
  | 'text'
  | 'templates'
  | 'excalidraw'
  | 'pdb'
  | 'ai'
  | 'chem';
export type LibraryTab = 'library' | 'uploads';

/** One open figure tab (multi-document). */
export interface OpenDocument {
  id: string;
  name: string;
  artboardWidth: number;
  artboardHeight: number;
  /** Last captured canvas JSON payload; null = blank / not yet snapshotted */
  snapshot: {
    version?: number;
    artboard?: { width: number; height: number };
    canvas?: unknown;
    projectName?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/** User-imported figure template (canvas snapshot) */
export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  source: 'import' | 'mcp';
  createdAt: string;
  project: {
    version?: number;
    artboard?: { width: number; height: number };
    canvas?: unknown;
    projectName?: string;
  };
}

/** Word-style shapes for the Shapes palette */
export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'arrowBlock'
  | 'chevron'
  | 'trapezoid'
  | 'parallelogram'
  | 'cross'
  | 'callout';

/** Line / connector / arrow styles */
export type LineKind =
  | 'solid'
  | 'dashed'
  | 'dotted'
  | 'dashDot'
  | 'thick'
  | 'arrowEnd'
  | 'arrowStart'
  | 'arrowDouble'
  | 'arrowDashed'
  | 'arrowDotted'
  | 'arrowDashDot'
  | 'arrowDoubleDashed'
  | 'curve'
  | 'curveDashed'
  | 'curveDotted'
  | 'curveArrow'
  | 'elbow'
  | 'elbowArrow'
  | 'inhibit'
  | 'doubleLine';

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: string;
}

export interface SelectionProps {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  name: string;
  locked: boolean;
  flipX: boolean;
  flipY: boolean;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  linethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  /** Fabric lineHeight multiplier — shown as “Line spacing” (0–2). */
  lineHeight?: number;
  /** True when every non-empty line starts with a bullet. */
  hasBullets?: boolean;
  /** True when every non-empty line starts with a number marker (1. 2.). */
  hasNumbers?: boolean;
  /** Active bullet glyph style when hasBullets. */
  bulletStyle?: 'disc' | 'circle' | 'square' | 'filled-square' | null;
  /** Super/subscript detection for selection or object. */
  scriptMode?: 'none' | 'super' | 'sub';
  isText?: boolean;
  /** Bordered text box (Fabric Textbox with baTextBox). */
  isTextBox?: boolean;
  /** Box fill behind text (text boxes only). */
  backgroundColor?: string;
}

export interface AppState {
  tool: ToolId;
  libraryTab: LibraryTab;
  projectName: string;
  search: string;
  category: string;
  userLibrary: LibraryIcon[];
  userTemplates: UserTemplate[];
  pinnedTemplateIds: string[];
  pinnedIconIds: string[];
  /** Bottom dock — favorite clip art icons */
  favorites: LibraryIcon[];
  /** Whether the bottom favorites dock is visible */
  favoritesDockOpen: boolean;
  layers: LayerInfo[];
  selectionCount: number;
  selectedIds: string[];
  selectionProps: SelectionProps | null;
  zoom: number;
  artboardWidth: number;
  artboardHeight: number;
  toast: string | null;
  exportOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  shapeKind: ShapeKind;
  objectCount: number;
  helpOpen: boolean;
  showGrid: boolean;
  snapOn: boolean;
  /** Vertical layout bands (1 = no split, ≥2 draws equal columns). Visual only. */
  columnGuides: number;
  /** Horizontal layout bands (1 = no split, ≥2 draws equal rows). Visual only. */
  rowGuides: number;
  /** Glass pane opacity 0–1 (0–100% frost) */
  glassOpacity: number;
  /** Glass tint hue 0–360 */
  glassHue: number;
  /** App chrome theme: dark liquid glass or light frosted */
  themeMode: 'dark' | 'light';
  /** Left content panel width in px (resizable for all rail tools) */
  leftPanelWidth: number;
  /** Whether the left content panel (Assets / tools) is visible */
  leftPanelOpen: boolean;
  /** Whether the right Properties / Layers panel is visible */
  rightPanelOpen: boolean;
  /** Multi-document tabs */
  openDocuments: OpenDocument[];
  activeDocumentId: string;
}

export type FabricCanvas = Canvas;
export type BaObject = FabricObject & {
  baId?: string;
  baName?: string;
  baLocked?: boolean;
  /** Shared id linking a reaction arrow to its reagent labels */
  baReactionId?: string;
  /** Role within a reaction assembly */
  baReagentSlot?: 'arrow' | 'top' | 'bottom';
};
