import type { LineKind, ShapeKind } from '../types';

export const SHAPE_ITEMS: {
  id: ShapeKind;
  label: string;
  /** Simple path or glyph for palette preview */
  preview: string;
}[] = [
  { id: 'rect', label: 'Rectangle', preview: 'M10 22h60v36H10z' },
  { id: 'roundRect', label: 'Round rect', preview: 'M18 22h44a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z' },
  { id: 'ellipse', label: 'Oval', preview: 'M40 18a28 22 0 1 1 0 44a28 22 0 1 1 0-44' },
  { id: 'circle', label: 'Circle', preview: 'M40 14a26 26 0 1 1 0 52a26 26 0 1 1 0-52' },
  { id: 'triangle', label: 'Triangle', preview: 'M40 16 L66 64 L14 64 Z' },
  { id: 'rightTriangle', label: 'Right triangle', preview: 'M18 16 L18 64 L62 64 Z' },
  { id: 'diamond', label: 'Diamond', preview: 'M40 12 L66 40 L40 68 L14 40 Z' },
  { id: 'pentagon', label: 'Pentagon', preview: 'M40 12 L66 30 L58 62 L22 62 L14 30 Z' },
  { id: 'hexagon', label: 'Hexagon', preview: 'M28 16 L52 16 L66 40 L52 64 L28 64 L14 40 Z' },
  { id: 'star', label: 'Star', preview: 'M40 12 L46 30 L66 30 L50 42 L56 62 L40 50 L24 62 L30 42 L14 30 L34 30 Z' },
  { id: 'arrowBlock', label: 'Block arrow', preview: 'M12 28h36v-12l24 24-24 24v-12H12z' },
  { id: 'chevron', label: 'Chevron', preview: 'M14 18 L40 18 L58 40 L40 62 L14 62 L32 40 Z' },
  { id: 'trapezoid', label: 'Trapezoid', preview: 'M24 20 L56 20 L66 60 L14 60 Z' },
  { id: 'parallelogram', label: 'Parallelogram', preview: 'M28 20 L66 20 L52 60 L14 60 Z' },
  { id: 'cross', label: 'Cross', preview: 'M34 14h12v20h20v12H46v20H34V46H14V34h20z' },
  { id: 'callout', label: 'Callout', preview: 'M16 18h48v32H36l-8 12v-12H16z' },
];

export const LINE_ITEMS: {
  id: LineKind;
  label: string;
  preview: string;
  dashed?: boolean;
  dotted?: boolean;
}[] = [
  { id: 'solid', label: 'Solid line', preview: 'M8 40h64' },
  { id: 'dashed', label: 'Dashed', preview: 'M8 40h64', dashed: true },
  { id: 'dotted', label: 'Dotted', preview: 'M8 40h64', dotted: true },
  { id: 'dashDot', label: 'Dash-dot', preview: 'M8 40h64', dashed: true },
  { id: 'thick', label: 'Thick line', preview: 'M8 40h64' },
  { id: 'doubleLine', label: 'Double line', preview: 'M8 34h64M8 46h64' },
  { id: 'arrowEnd', label: 'Arrow →', preview: 'M8 40h50M50 28l18 12-18 12' },
  { id: 'arrowStart', label: 'Arrow ←', preview: 'M22 40h50M22 28L4 40l18 12' },
  { id: 'arrowDouble', label: 'Double arrow', preview: 'M18 40h44M18 28L4 40l14 12M62 28l14 12-14 12' },
  { id: 'arrowDashed', label: 'Dashed arrow', preview: 'M8 40h50M50 28l18 12-18 12', dashed: true },
  { id: 'arrowDotted', label: 'Dotted arrow', preview: 'M8 40h50M50 28l18 12-18 12', dotted: true },
  { id: 'arrowDashDot', label: 'Dash-dot arrow', preview: 'M8 40h50M50 28l18 12-18 12', dashed: true },
  { id: 'arrowDoubleDashed', label: 'Double dashed', preview: 'M18 40h44M18 28L4 40l14 12M62 28l14 12-14 12', dashed: true },
  { id: 'curve', label: 'Curve', preview: 'M8 52 Q40 8 72 52' },
  { id: 'curveDashed', label: 'Dashed curve', preview: 'M8 52 Q40 8 72 52', dashed: true },
  { id: 'curveDotted', label: 'Dotted curve', preview: 'M8 52 Q40 8 72 52', dotted: true },
  { id: 'curveArrow', label: 'Curved arrow', preview: 'M8 52 Q40 8 60 40M54 28l14 14-18 4' },
  { id: 'elbow', label: 'Elbow', preview: 'M12 24h40v32' },
  { id: 'elbowArrow', label: 'Elbow arrow', preview: 'M12 24h40v28M44 44l8 12-16 0' },
  { id: 'inhibit', label: 'Inhibition ⊣', preview: 'M8 40h54M62 26v28' },
];
