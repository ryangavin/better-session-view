GraphNode from bsv-widgets. Use via `window.BsvWidgets.GraphNode` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface GraphNodeProps {
  /** The host's own id for this node. Only ever handed back to it. */
  id: string;
  /** Position in graph coordinates — the canvas's own units, before zoom. */
  x: number;
  y: number;
  /** A `Device`, usually. Whatever it is, it is the size it wants to be. */
  children?: React.ReactNode;
  className?: string;
}
```
