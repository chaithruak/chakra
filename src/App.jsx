import { useEffect, useRef, useState, useCallback } from "react";
import { FolderOpen } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import PermissionModal from "./components/PermissionModal.jsx";
import Settings from "./components/Settings.jsx";
import Connectors from "./components/Connectors.jsx";
import Skills from "./components/Skills.jsx";
import { bridge } from "./bridge/index.js";

export default function App() {
  const [mode, setMode] = useState("chat");
  const [settings, setSettings] = useState(null);
  const [permissionMode, setPermissionMode] = useState("default");
  const [timeline, setTimeline] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(null);
  const [modelsByProfile, setModelsByProfile] = useState({});
  const [cwd, setCwd] = useState(null);
  const sessionRef = useRef(null);
  const chatRef = useRef(null);
  const streamOpen = useRef(false);

  async function loadModelsFor(cfg) {
    if (!cfg) return;
    const entries = await Promise.all(
      Object.values(cfg.profiles).map(async (p) => {
        try { return [p.id, await bridge.listModels(p.id)]; } catch { return [p.id, []]; }
      })
    );
    setModelsByProfile(Object.fromEntries(entries));
  }

  useEffect(() => { bridge.getSettings().then((cfg) => { setSettings(cfg); loadModelsFor(cfg); }); }, []);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [timeline, streaming]);

  const onEvent = useCallback((e) => {
    switch (e.kind) {
      case "init":
        if (e.data.permissionMode) setPermissionMode(e.data.permissionMode);
        break;
      case "assistant_delta": {
        const text = e.data.text ?? "";
        if (!text) break;
        setStreaming(true);
        setTimeline((tl) => {
          const last = tl[tl.length - 1];
          if (streamOpen.current && last && last.type === "message" && last.role === "assistant") {
            return [...tl.slice(0, -1), { ...last, text: last.text + text }];
          }
          streamOpen.current = true;
          return [...tl, { type: "message", role: "assistant", text }];
        });
        break;
      }
      case "assistant_message":
        streamOpen.current = false; setStreaming(false);
        break;
      case "tool_use":
        streamOpen.current = false; setStreaming(false);
        setTimeline((tl) => [...tl, { type: "tool", id: e.data.id, name: e.data.name, input: e.data.input, auto: e.data.auto, status: "run" }]);
        break;
      case "tool_result":
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, output: e.data.output, status: "ok" } : it));
        break;
      case "permission_request":
        setPerm(e.data);
        break;
      case "permission_denied":
        setPerm(null);
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, status: "deny" } : it));
        break;
      case "result":
        streamOpen.current = false; setStreaming(false); setBusy(false);
        break;
      case "error":
        streamOpen.current = false; setStreaming(false); setBusy(false);
        setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ ${e.data?.message || "Error"}` }]);
        break;
      default: break;
    }
  }, []);

  useEffect(() => bridge.onEvent(onEvent), [onEvent]);

  const isAgentMode = mode === "cowork" || mode === "code" || mode === "project";

  const send = async (text) => {
    setTimeline((tl) => [...tl, { type: "message", role: "user", text }]);
    setBusy(true);
    streamOpen.current = false;
    if (!sessionRef.current) {
      const { sessionId } = await bridge.start({ mode, prompt: text, cwd, permissionMode });
      sessionRef.current = sessionId;
    } else {
      bridge.sendInput(sessionRef.current, text);
    }
  };

  const changePermission = (m) => {
    setPermissionMode(m);
    if (sessionRef.current) bridge.setPermissionMode(sessionRef.current, m);
  };

  const pickFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (dir) { setCwd(dir); sessionRef.current = null; setTimeline([]); }
  };

  const stop = () => { if (sessionRef.current) bridge.interrupt(sessionRef.current); setBusy(false); };

  const resolve = (behavior) => {
    if (!perm) return;
    bridge.resolvePermission(perm.requestId, { behavior });
    if (behavior === "allow") {
      setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === perm.toolUseId ? { ...it, status: "run" } : it));
    }
    setPerm(null);
  };

  const switchMode = (m) => {
    setMode(m); setTimeline([]); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };

  // Live models per provider → one picker, grouped by provider.
  const profiles = settings ? Object.values(settings.profiles) : [];
  const activeProfile = settings ? settings.profiles[settings.activeProfileId] : null;
  const pickerGroups = profiles
    .map((p) => {
      const live = modelsByProfile[p.id] || [];
      const ids = live.length ? live : (p.model ? [p.model] : []);
      return { group: p.name, items: ids.slice(0, 500).map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: p.kind })) };
    })
    .filter((g) => g.items.length);

  const activeValue = activeProfile ? `${activeProfile.id}::${activeProfile.model || ""}` : undefined;

  // Selecting a model sets BOTH the active provider and that provider's model.
  // Re-read from disk first so we never clobber a profile added in the Settings panel.
  const selectModel = async (value) => {
    const i = value.indexOf("::");
    const pid = value.slice(0, i);
    const mid = value.slice(i + 2);
    const cur = await bridge.getSettings();
    if (!cur.profiles[pid]) return;
    const next = { ...cur, activeProfileId: pid, profiles: { ...cur.profiles, [pid]: { ...cur.profiles[pid], model: mid } } };
    setSettings(next); await bridge.saveSettings(next);
  };
  const refreshModels = () => loadModelsFor(settings);

  const isSettings = mode === "settings";
  const isConnectors = mode === "connectors";
  const isSkills = mode === "skills";

  return (
    <div className="app">
      <Sidebar active={mode} onSelect={switchMode} />
      <div className="main">
        <Topbar
          mode={mode}
          model={activeValue}
          groups={pickerGroups}
          onModel={selectModel}
          onRefresh={refreshModels}
          permissionMode={permissionMode}
          onPermissionChange={changePermission}
        />

        {isSettings ? (
          <Settings onChanged={setSettings} />
        ) : isConnectors ? (
          <Connectors />
        ) : isSkills ? (
          <Skills />
        ) : (
          <>
            {isAgentMode && (
              <div className="folder-bar">
                <FolderOpen size={14} />
                {cwd ? <span className="path">{cwd}</span> : <span className="path muted">No folder selected</span>}
                <button className="btn" onClick={pickFolder} style={{ marginLeft: "auto", padding: "5px 10px" }}>
                  {cwd ? "Change folder" : "Choose folder"}
                </button>
              </div>
            )}
            <div className="chat scroll" ref={chatRef}>
              {timeline.length === 0 ? (
                <div className="empty">
                  <div>
                    <div className="big">Start a {mode} session</div>
                    <div>
                      {isAgentMode && !cwd
                        ? "Choose a folder above — Chakra will read and edit files in it."
                        : activeProfile ? `Using ${activeProfile.name} · ${activeProfile.model}` : "Configure a provider in Settings."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chat-inner">
                  {timeline.map((item, i) => (
                    <Message key={i} item={item} streaming={streaming && i === timeline.length - 1 && item.type === "message" && item.role === "assistant"} />
                  ))}
                </div>
              )}
            </div>
            <Composer mode={mode} busy={busy} onSend={send} onStop={stop} />
          </>
        )}
      </div>

      <PermissionModal
        req={perm}
        onAllow={() => resolve("allow")}
        onAllowAlways={() => { changePermission("bypassPermissions"); resolve("allow"); }}
        onDeny={() => resolve("deny")}
      />
    </div>
  );
}
