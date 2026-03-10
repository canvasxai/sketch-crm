import { useCallback, useEffect, useRef, useState } from "react";

export const DRAWER_MIN_W = 380;
export const DRAWER_DEFAULT_W = 448;
export const DRAWER_MAX_W = 700;

export function ResizableDrawerWrapper({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DRAWER_DEFAULT_W);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DRAWER_DEFAULT_W);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(DRAWER_MAX_W, Math.max(DRAWER_MIN_W, startWidth.current + delta));
      setWidth(newWidth);
    }
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="relative flex h-full" style={{ width }}>
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize group"
      >
        <div className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-primary/40 group-active:bg-primary" />
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
