import type { Canvas, FabricObject } from 'fabric';
import type { LibraryIcon } from '../data/catalog';

export type ToolId =
  | 'library'
  | 'uploads'
  | 'shapes'
  | 'lines'
  | 'text'
  | 'templates'
  | 'pdb'
  | 'ai';
export type LibraryTab = 'library' | 'uploads';

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
  isText?: boolean;
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
  columnGuides: number;
}

export type FabricCanvas = Canvas;
export type BaObject = FabricObject & {
  baId?: string;
  baName?: string;
  baLocked?: boolean;
};
