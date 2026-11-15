// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";

// #307: the editor sets `live_cameras[].name` for an entity camera.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  await import("../index.js");
});

function makeEditor(cam: Record<string, unknown>) {
  const ed: any = document.createElement("camera-gallery-card-editor");
  document.body.append(ed);
  ed.hass = {
    states: {
      "camera.x": { entity_id: "camera.x", state: "idle", attributes: { friendly_name: "Porch" } },
      // The camera list only shows when there is more than one camera to pick.
      "camera.y": { entity_id: "camera.y", state: "idle", attributes: {} },
    },
    themes: {},
    config: { components: [] },
    locale: { language: "en" },
  };
  ed.setConfig({ type: "custom:camera-gallery-card", live_enabled: true, live_cameras: [cam] });
  ed._activeTab = "live";
  ed._render();
  return ed;
}

const nameInput = (ed: any) => ed.shadowRoot.querySelector('[data-name-cam="camera.x"]');

describe("editor live camera name", () => {
  it("shows the custom name, with HA's name as placeholder", () => {
    const ed = makeEditor({ entity: "camera.x", name: "Front door" });
    expect(nameInput(ed).value).toBe("Front door");
    expect(nameInput(ed).placeholder).toBe("Porch");
    ed.remove();
  });

  it("writes the name to the camera entry, and removes it when cleared", () => {
    const ed = makeEditor({ entity: "camera.x" });
    const inp = nameInput(ed);
    inp.value = "Driveway";
    inp.dispatchEvent(new Event("change"));
    expect(ed._config.live_cameras[0]).toEqual({ entity: "camera.x", name: "Driveway" });
    inp.value = "  ";
    inp.dispatchEvent(new Event("change"));
    expect(ed._config.live_cameras[0]).toEqual({ entity: "camera.x" });
    ed.remove();
  });
});
