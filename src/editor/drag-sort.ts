/**
 * Drag-to-reorder for the editor's lists: the camera list, the gallery pills,
 * the toolbar buttons and the live controls zones.
 *
 * Mouse uses native HTML5 drag events on the whole item. Touch only starts
 * from the item's grip handle, so a swipe across a row never reorders by
 * accident; the item under the finger is found with elementFromPoint.
 *
 * Optional zones (the live controls' Row 1 / Row 2 / Menu boxes): an item can
 * be dropped on another item (lands before it) or on a zone's empty space
 * (lands at the end of that zone). `canDrop` can refuse a zone.
 */

export interface DragSortDrop {
  /** Key of the dragged item. */
  src: string;
  /** Key of the item it was dropped on (lands before it), or null. */
  before: string | null;
  /** Zone it was dropped in, when zones are used. */
  zone: string | null;
}

export interface DragSortOptions {
  /** Element that contains the items (and zones). */
  root: ParentNode & Node;
  /** Selector for draggable items inside `root`. */
  item: string;
  /** Key of an item, usually from a data attribute. */
  keyOf: (el: HTMLElement) => string | undefined;
  /** Selector for the touch grip inside an item. */
  grip: string;
  /** Optional selector for drop zones, and how to read a zone's key. */
  zone?: string;
  zoneKeyOf?: (el: HTMLElement) => string | undefined;
  /** Refuse a drop in a zone (e.g. built-in pills in the menu). */
  canDrop?: (src: string, zone: string | null) => boolean;
  onDrop: (drop: DragSortDrop) => void;
  /** CSS classes for feedback. Defaults match the pill lists. */
  draggingClass?: string;
  overClass?: string;
  zoneOverClass?: string;
}

export function wireDragSort(opts: DragSortOptions): void {
  const {
    root,
    item,
    keyOf,
    grip,
    zone,
    zoneKeyOf,
    onDrop,
    draggingClass = "pill-dnd-dragging",
    overClass = "pill-dnd-over",
    zoneOverClass = "ctl-zone-over",
  } = opts;
  const canDrop = opts.canDrop ?? (() => true);
  let dragKey: string | null = null;

  const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const clearOver = () => {
    for (const el of all(`.${overClass}`)) el.classList.remove(overClass);
    for (const el of all(`.${zoneOverClass}`)) el.classList.remove(zoneOverClass);
  };
  const zoneOf = (el: Element | null): string | null => {
    if (!zone || !zoneKeyOf || !el) return null;
    const z = el.closest<HTMLElement>(zone);
    return z ? (zoneKeyOf(z) ?? null) : null;
  };
  const finish = (beforeEl: HTMLElement | null, zoneKey: string | null) => {
    const src = dragKey;
    dragKey = null;
    clearOver();
    if (!src) return;
    const before = beforeEl ? (keyOf(beforeEl) ?? null) : null;
    if (before === src) return;
    if (!canDrop(src, zoneKey)) return;
    if (!before && !zone) return; // plain lists only reorder onto another item
    onDrop({ src, before, zone: zoneKey });
  };
  const hit = (x: number, y: number): Element | null => {
    const node = root.getRootNode() as Document | ShadowRoot;
    const finder = (node as { elementFromPoint?: (x: number, y: number) => Element | null })
      .elementFromPoint;
    return finder ? finder.call(node, x, y) : document.elementFromPoint(x, y);
  };

  for (const el of all(item)) {
    const key = keyOf(el);
    if (!key) continue;

    el.addEventListener("dragstart", (e) => {
      dragKey = key;
      el.classList.add(draggingClass);
      const dt = (e as DragEvent).dataTransfer;
      if (dt) {
        dt.effectAllowed = "move";
        dt.setData("text/plain", key);
      }
    });
    el.addEventListener("dragend", () => {
      el.classList.remove(draggingClass);
      clearOver();
      dragKey = null;
    });
    el.addEventListener("dragover", (e) => {
      if (!dragKey || !canDrop(dragKey, zoneOf(el))) return;
      e.preventDefault();
      e.stopPropagation();
      const dt = (e as DragEvent).dataTransfer;
      if (dt) dt.dropEffect = "move";
      if (key !== dragKey) {
        clearOver();
        el.classList.add(overClass);
      }
    });
    el.addEventListener("dragleave", () => el.classList.remove(overClass));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish(el, zoneOf(el));
    });

    const handle = el.querySelector<HTMLElement>(grip);
    if (!handle) continue;
    handle.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        dragKey = key;
        el.classList.add(draggingClass);
      },
      { passive: false }
    );
    handle.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const t = (e as TouchEvent).touches[0];
        if (!t || !dragKey) return;
        const under = hit(t.clientX, t.clientY);
        const target = under?.closest<HTMLElement>(item) ?? null;
        const z = zoneOf(under);
        clearOver();
        if (!canDrop(dragKey, z)) return;
        if (target && keyOf(target) !== dragKey) target.classList.add(overClass);
        else if (zone && under) under.closest<HTMLElement>(zone)?.classList.add(zoneOverClass);
      },
      { passive: false }
    );
    handle.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        el.classList.remove(draggingClass);
        const t = (e as TouchEvent).changedTouches[0];
        const under = t ? hit(t.clientX, t.clientY) : null;
        const target = under?.closest<HTMLElement>(item) ?? null;
        finish(target && keyOf(target) !== key ? target : null, zoneOf(under));
      },
      { passive: false }
    );
  }

  if (zone) {
    for (const z of all(zone)) {
      z.addEventListener("dragover", (e) => {
        if (!dragKey || !canDrop(dragKey, zoneKeyOf?.(z) ?? null)) return;
        e.preventDefault();
        clearOver();
        z.classList.add(zoneOverClass);
      });
      z.addEventListener("dragleave", (e) => {
        if (!z.contains((e as DragEvent).relatedTarget as Node | null))
          z.classList.remove(zoneOverClass);
      });
      z.addEventListener("drop", (e) => {
        e.preventDefault();
        finish(null, zoneKeyOf?.(z) ?? null);
      });
    }
  }
}
