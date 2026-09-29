import {
  ArrowDownRight,
  BoxSelect,
  Circle,
  Diamond,
  Download,
  Hand,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Slash,
  Square,
  TextCursorInput,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "select" | "hand" | "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "text";
type ShapeType = Exclude<Tool, "select" | "hand">;

type Point = { x: number; y: number };
type Camera = Point & { zoom: number };

type SceneElement = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  text?: string;
};

type Interaction =
  | { kind: "idle" }
  | { kind: "pan"; start: Point; camera: Camera }
  | { kind: "draw"; start: Point; last: Point; id: string; type: ShapeType; before: SceneElement[] }
  | { kind: "move"; start: Point; id: string; element: SceneElement; before: SceneElement[] }
  | { kind: "resize"; start: Point; id: string; corner: string; element: SceneElement; before: SceneElement[] };

const tools: Array<{
  id: Tool;
  label: string;
  key: string;
  icon: typeof MousePointer2;
}> = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Pan", key: "H", icon: Hand },
  { id: "rectangle", label: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", key: "O", icon: Circle },
  { id: "diamond", label: "Diamond", key: "D", icon: Diamond },
  { id: "arrow", label: "Arrow", key: "A", icon: ArrowDownRight },
  { id: "line", label: "Line", key: "L", icon: Slash },
  { id: "text", label: "Text", key: "T", icon: TextCursorInput },
];

const colors = ["#232323", "#5f48e8", "#df4c3f", "#16856b", "#2976d2"];
const fills = ["transparent", "#e9e4ff", "#fde3df", "#dcefe8", "#dceafb"];
const initialElements: SceneElement[] = [
  {
    id: "welcome",
    type: "text",
    x: -250,
    y: -145,
    width: 500,
    height: 64,
    stroke: "#232323",
    fill: "transparent",
    strokeWidth: 2,
    text: "Make space for ideas.",
  },
  {
    id: "start-card",
    type: "rectangle",
    x: -170,
    y: -30,
    width: 340,
    height: 150,
    stroke: "#5f48e8",
    fill: "#e9e4ff",
    strokeWidth: 2,
  },
  {
    id: "start-copy",
    type: "text",
    x: -124,
    y: 12,
    width: 248,
    height: 70,
    stroke: "#38299c",
    fill: "transparent",
    strokeWidth: 2,
    text: "Choose a tool, then click and drag anywhere.",
  },
];

const storageKey = "form-canvas-elements";

const cloneElements = (elements: SceneElement[]) => elements.map((element) => ({ ...element }));
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizedBounds = (element: SceneElement) => ({
  x: Math.min(element.x, element.x + element.width),
  y: Math.min(element.y, element.y + element.height),
  width: Math.abs(element.width),
  height: Math.abs(element.height),
});

const escapeXml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function App() {
  const [elements, setElements] = useState<SceneElement[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? (JSON.parse(stored) as SceneElement[]) : initialElements;
    } catch {
      return initialElements;
    }
  });
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
  const [stroke, setStroke] = useState("#232323");
  const [fill, setFill] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [undoStack, setUndoStack] = useState<SceneElement[][]>([]);
  const [redoStack, setRedoStack] = useState<SceneElement[][]>([]);
  const [spacePressed, setSpacePressed] = useState(false);
  const interaction = useRef<Interaction>({ kind: "idle" });
  const stageRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => elements.find((element) => element.id === selectedId) ?? null,
    [elements, selectedId],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(elements));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [elements]);

  const commit = useCallback(
    (next: SceneElement[]) => {
      setUndoStack((stack) => [...stack.slice(-49), cloneElements(elements)]);
      setRedoStack([]);
      setElements(next);
    },
    [elements],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack((redo) => [...redo, cloneElements(elements)]);
      setElements(cloneElements(previous));
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, [elements]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((undoItems) => [...undoItems, cloneElements(elements)]);
      setElements(cloneElements(next));
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, [elements]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(elements.filter((element) => element.id !== selectedId));
    setSelectedId(null);
  }, [commit, elements, selectedId]);

  const updateSelected = useCallback(
    (updates: Partial<SceneElement>) => {
      if (!selectedId) return;
      commit(elements.map((element) => (element.id === selectedId ? { ...element, ...updates } : element)));
    },
    [commit, elements, selectedId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
        return;
      }
      const match = tools.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (match) setTool(match.id);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteSelected, redo, selectedId, undo]);

  const screenPoint = (event: ReactPointerEvent): Point => {
    const bounds = stageRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const worldPoint = (event: ReactPointerEvent): Point => {
    const point = screenPoint(event);
    return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
  };

  const beginPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1 || tool === "hand" || spacePressed) {
      event.currentTarget.setPointerCapture(event.pointerId);
      interaction.current = { kind: "pan", start: screenPoint(event), camera };
      return;
    }

    const target = (event.target as Element).closest<SVGElement>("[data-element-id]");
    const targetId = target?.dataset.elementId ?? null;
    const point = worldPoint(event);

    if (tool === "select") {
      if (!targetId) {
        setSelectedId(null);
        return;
      }
      const element = elements.find((item) => item.id === targetId);
      if (!element) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedId(targetId);
      setStroke(element.stroke);
      setFill(element.fill);
      setStrokeWidth(element.strokeWidth);
      interaction.current = {
        kind: "move",
        start: point,
        id: targetId,
        element: { ...element },
        before: cloneElements(elements),
      };
      return;
    }

    const id = newId();
    const next: SceneElement = {
      id,
      type: tool,
      x: point.x,
      y: point.y,
      width: tool === "text" ? 220 : 0,
      height: tool === "text" ? 42 : 0,
      stroke,
      fill: tool === "line" || tool === "arrow" || tool === "text" ? "transparent" : fill,
      strokeWidth,
      text: tool === "text" ? "Type something" : undefined,
    };
    const before = cloneElements(elements);
    setElements([...elements, next]);
    setSelectedId(id);
    if (tool === "text") {
      setUndoStack((stack) => [...stack.slice(-49), before]);
      setRedoStack([]);
      setTool("select");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = { kind: "draw", start: point, last: point, id, type: tool, before };
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    if (current.kind === "idle") return;

    if (current.kind === "pan") {
      const point = screenPoint(event);
      setCamera({
        ...current.camera,
        x: current.camera.x + point.x - current.start.x,
        y: current.camera.y + point.y - current.start.y,
      });
      return;
    }

    const point = worldPoint(event);
    if (current.kind === "draw") {
      interaction.current = { ...current, last: point };
      setElements((items) =>
        items.map((element) =>
          element.id === current.id
            ? { ...element, width: point.x - current.start.x, height: point.y - current.start.y }
            : element,
        ),
      );
      return;
    }

    if (current.kind === "move") {
      setElements((items) =>
        items.map((element) =>
          element.id === current.id
            ? {
                ...element,
                x: current.element.x + point.x - current.start.x,
                y: current.element.y + point.y - current.start.y,
              }
            : element,
        ),
      );
      return;
    }

    const source = current.element;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    const changes: Partial<SceneElement> = {};
    if (current.corner.includes("e")) changes.width = source.width + dx;
    if (current.corner.includes("s")) changes.height = source.height + dy;
    if (current.corner.includes("w")) {
      changes.x = source.x + dx;
      changes.width = source.width - dx;
    }
    if (current.corner.includes("n")) {
      changes.y = source.y + dy;
      changes.height = source.height - dy;
    }
    setElements((items) =>
      items.map((element) => (element.id === current.id ? { ...element, ...changes } : element)),
    );
  };

  const endPointer = () => {
    const current = interaction.current;
    if (current.kind === "draw") {
      const width = Math.abs(current.last.x - current.start.x);
      const height = Math.abs(current.last.y - current.start.y);
      const tooSmall = current.type === "line" || current.type === "arrow"
        ? Math.hypot(width, height) < 4
        : width < 4 || height < 4;
      if (tooSmall) {
        setElements(current.before);
        setSelectedId(null);
      } else {
        setUndoStack((stack) => [...stack.slice(-49), current.before]);
        setRedoStack([]);
      }
      setTool("select");
    } else if (current.kind === "move" || current.kind === "resize") {
      setUndoStack((stack) => [...stack.slice(-49), current.before]);
      setRedoStack([]);
    }
    interaction.current = { kind: "idle" };
  };

  const beginResize = (event: ReactPointerEvent<SVGCircleElement>, corner: string, element: SceneElement) => {
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    interaction.current = {
      kind: "resize",
      start: worldPoint(event),
      id: element.id,
      corner,
      element: { ...element },
      before: cloneElements(elements),
    };
  };

  const onWheel = (event: ReactWheelEvent) => {
    event.preventDefault();
    if (!event.ctrlKey && !event.metaKey) {
      setCamera((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      return;
    }
    const bounds = stageRef.current!.getBoundingClientRect();
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setCamera((current) => {
      const zoom = clamp(current.zoom * Math.exp(-event.deltaY * 0.003), 0.2, 4);
      const world = { x: (pointer.x - current.x) / current.zoom, y: (pointer.y - current.y) / current.zoom };
      return { x: pointer.x - world.x * zoom, y: pointer.y - world.y * zoom, zoom };
    });
  };

  const zoomAtCenter = (factor: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    setCamera((current) => {
      const zoom = clamp(current.zoom * factor, 0.2, 4);
      const world = { x: (center.x - current.x) / current.zoom, y: (center.y - current.y) / current.zoom };
      return { x: center.x - world.x * zoom, y: center.y - world.y * zoom, zoom };
    });
  };

  const editText = (element: SceneElement) => {
    if (element.type !== "text") return;
    const value = window.prompt("Edit text", element.text ?? "");
    if (value === null || value === element.text) return;
    setSelectedId(element.id);
    commit(elements.map((item) => (item.id === element.id ? { ...item, text: value } : item)));
  };

  const clearCanvas = () => {
    if (!elements.length || !window.confirm("Clear the whole canvas?")) return;
    commit([]);
    setSelectedId(null);
  };

  const exportSvg = () => {
    if (!elements.length) return;
    const bounds = elements.map(normalizedBounds);
    const minX = Math.min(...bounds.map((item) => item.x)) - 40;
    const minY = Math.min(...bounds.map((item) => item.y)) - 40;
    const maxX = Math.max(...bounds.map((item) => item.x + item.width)) + 40;
    const maxY = Math.max(...bounds.map((item) => item.y + item.height)) + 40;
    const body = elements.map(elementToSvg).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}"><defs><marker id="arrow-export" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#faf9f6"/>${body}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "form-canvas.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const gridSize = 24 * camera.zoom;
  const cursor = tool === "hand" || spacePressed ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><BoxSelect size={18} strokeWidth={2.4} /></div>
          <div>
            <strong>Form</strong>
            <span>Infinite canvas</span>
          </div>
        </div>
        <div className="document-title">
          <span className="status-dot" />
          Untitled board
          <small>Saved locally</small>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!undoStack.length} aria-label="Undo"><Undo2 size={17} /></button>
          <button className="icon-button" onClick={redo} disabled={!redoStack.length} aria-label="Redo"><Redo2 size={17} /></button>
          <div className="divider" />
          <button className="export-button" onClick={exportSvg} disabled={!elements.length}><Download size={16} /> Export</button>
        </div>
      </header>

      <aside className="toolbox" aria-label="Drawing tools">
        {tools.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`tool-button ${tool === item.id ? "active" : ""}`}
              onClick={() => setTool(item.id)}
              aria-label={`${item.label} (${item.key})`}
              title={`${item.label} (${item.key})`}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{item.key}</span>
            </button>
          );
        })}
      </aside>

      <aside className="properties-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{selected ? "Selection" : "Style"}</span>
            <h2>{selected ? selected.type : "Next shape"}</h2>
          </div>
          {selected && <button className="icon-button danger" onClick={deleteSelected} aria-label="Delete"><Trash2 size={16} /></button>}
        </div>

        <section className="property-group">
          <label>Stroke</label>
          <div className="swatches">
            {colors.map((color) => (
              <button
                key={color}
                className={`swatch ${stroke === color ? "selected" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setStroke(color);
                  if (selected) updateSelected({ stroke: color });
                }}
                aria-label={`Stroke ${color}`}
              />
            ))}
          </div>
        </section>

        <section className="property-group">
          <label>Fill</label>
          <div className="swatches">
            {fills.map((color) => (
              <button
                key={color}
                className={`swatch ${color === "transparent" ? "no-fill" : ""} ${fill === color ? "selected" : ""}`}
                style={color === "transparent" ? undefined : { backgroundColor: color }}
                onClick={() => {
                  setFill(color);
                  if (selected && !["line", "arrow", "text"].includes(selected.type)) updateSelected({ fill: color });
                }}
                aria-label={`Fill ${color}`}
              />
            ))}
          </div>
        </section>

        <section className="property-group">
          <label>Weight</label>
          <div className="segmented">
            {[1, 2, 4].map((weight) => (
              <button
                key={weight}
                className={strokeWidth === weight ? "selected" : ""}
                onClick={() => {
                  setStrokeWidth(weight);
                  if (selected) updateSelected({ strokeWidth: weight });
                }}
              >
                <i style={{ height: weight }} />
              </button>
            ))}
          </div>
        </section>

        {selected?.type === "text" && (
          <section className="property-group">
            <label>Content</label>
            <textarea value={selected.text} onChange={(event) => updateSelected({ text: event.target.value })} rows={3} />
          </section>
        )}

        <div className="panel-tip">
          <span>Tip</span>
          Hold Space to move the canvas. Double-click text to edit it.
        </div>
      </aside>

      <div
        ref={stageRef}
        className="canvas-stage"
        style={{
          cursor,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
      >
        <svg className="scene" width="100%" height="100%">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
            {elements.map((element) => (
              <SceneShape key={element.id} element={element} onDoubleClick={() => editText(element)} />
            ))}
            {selected && (
              <Selection element={selected} zoom={camera.zoom} onResize={beginResize} />
            )}
          </g>
        </svg>
      </div>

      <div className="zoom-controls">
        <button onClick={() => zoomAtCenter(0.8)} aria-label="Zoom out"><Minus size={16} /></button>
        <button className="zoom-value" onClick={() => setCamera({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 })}>{Math.round(camera.zoom * 100)}%</button>
        <button onClick={() => zoomAtCenter(1.25)} aria-label="Zoom in"><Plus size={16} /></button>
      </div>

      <button className="clear-button" onClick={clearCanvas}><RotateCcw size={15} /> Clear canvas</button>
      <div className="shortcut-hint">Scroll to pan · ⌘ + scroll to zoom</div>
    </main>
  );
}

function SceneShape({ element, onDoubleClick }: { element: SceneElement; onDoubleClick: () => void }) {
  const bounds = normalizedBounds(element);
  const common = {
    "data-element-id": element.id,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
    fill: element.fill,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (element.type === "rectangle") {
    return <rect {...common} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={12} />;
  }
  if (element.type === "ellipse") {
    return <ellipse {...common} cx={bounds.x + bounds.width / 2} cy={bounds.y + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} />;
  }
  if (element.type === "diamond") {
    const points = `${bounds.x + bounds.width / 2},${bounds.y} ${bounds.x + bounds.width},${bounds.y + bounds.height / 2} ${bounds.x + bounds.width / 2},${bounds.y + bounds.height} ${bounds.x},${bounds.y + bounds.height / 2}`;
    return <polygon {...common} points={points} />;
  }
  if (element.type === "line" || element.type === "arrow") {
    return (
      <line
        {...common}
        x1={element.x}
        y1={element.y}
        x2={element.x + element.width}
        y2={element.y + element.height}
        fill="none"
        markerEnd={element.type === "arrow" ? "url(#arrow)" : undefined}
      />
    );
  }
  return (
    <text
      {...common}
      x={element.x}
      y={element.y + 30}
      fill={element.stroke}
      stroke="none"
      fontFamily="Inter, Arial, sans-serif"
      fontSize={element.id === "welcome" ? 42 : 22}
      fontWeight={element.id === "welcome" ? 650 : 500}
      onDoubleClick={onDoubleClick}
    >
      {(element.text ?? "").split("\n").map((line, index) => (
        <tspan key={`${element.id}-${index}`} x={element.x} dy={index === 0 ? 0 : 27}>{line}</tspan>
      ))}
    </text>
  );
}

function Selection({
  element,
  zoom,
  onResize,
}: {
  element: SceneElement;
  zoom: number;
  onResize: (event: ReactPointerEvent<SVGCircleElement>, corner: string, element: SceneElement) => void;
}) {
  const bounds = normalizedBounds(element);
  const padding = 7 / zoom;
  const size = 8 / zoom;
  const corners = [
    { id: "nw", x: bounds.x - padding, y: bounds.y - padding },
    { id: "ne", x: bounds.x + bounds.width + padding, y: bounds.y - padding },
    { id: "se", x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding },
    { id: "sw", x: bounds.x - padding, y: bounds.y + bounds.height + padding },
  ];

  return (
    <g className="selection">
      <rect
        x={bounds.x - padding}
        y={bounds.y - padding}
        width={bounds.width + padding * 2}
        height={bounds.height + padding * 2}
        fill="none"
        stroke="#5f48e8"
        strokeWidth={1.4 / zoom}
        strokeDasharray={`${5 / zoom} ${4 / zoom}`}
        pointerEvents="none"
      />
      {corners.map((corner) => (
        <circle
          key={corner.id}
          cx={corner.x}
          cy={corner.y}
          r={size / 2}
          fill="#ffffff"
          stroke="#5f48e8"
          strokeWidth={1.5 / zoom}
          onPointerDown={(event) => onResize(event, corner.id, element)}
          style={{ cursor: `${corner.id}-resize` }}
        />
      ))}
    </g>
  );
}

function elementToSvg(element: SceneElement) {
  const bounds = normalizedBounds(element);
  const stroke = escapeXml(element.stroke);
  const fill = escapeXml(element.fill);
  if (element.type === "rectangle") return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth}"/>`;
  if (element.type === "ellipse") return `<ellipse cx="${bounds.x + bounds.width / 2}" cy="${bounds.y + bounds.height / 2}" rx="${bounds.width / 2}" ry="${bounds.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth}"/>`;
  if (element.type === "diamond") {
    const points = `${bounds.x + bounds.width / 2},${bounds.y} ${bounds.x + bounds.width},${bounds.y + bounds.height / 2} ${bounds.x + bounds.width / 2},${bounds.y + bounds.height} ${bounds.x},${bounds.y + bounds.height / 2}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth}"/>`;
  }
  if (element.type === "line" || element.type === "arrow") return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" fill="none" stroke="${stroke}" stroke-width="${element.strokeWidth}"${element.type === "arrow" ? ' marker-end="url(#arrow-export)"' : ""}/>`;
  return `<text x="${element.x}" y="${element.y + 30}" fill="${stroke}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">${escapeXml(element.text ?? "")}</text>`;
}

export default App;
