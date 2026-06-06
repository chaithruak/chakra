// Dispatch store — reusable background tasks + their run history, persisted to disk.
// A task: { id, name, prompt, target:{type:"chat"|"project"|"folder", projectId?, folder?},
//           schedule:{enabled, everyMinutes}, lastRun }
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const rand = (p) => p + Math.random().toString(36).slice(2, 9);
const baseDir = () => path.join(app.getPath("userData"), "dispatch-data");
const runsDir = () => path.join(baseDir(), "runs");
const tasksFile = () => path.join(baseDir(), "tasks.json");
const ensure = () => fs.mkdirSync(runsDir(), { recursive: true });

function loadTasks() { try { return JSON.parse(fs.readFileSync(tasksFile(), "utf8")).tasks || []; } catch { return []; } }
function saveTasks(arr) { ensure(); fs.writeFileSync(tasksFile(), JSON.stringify({ tasks: arr }, null, 2)); }

function listTasks() { return loadTasks(); }
function getTask(id) { return loadTasks().find((t) => t.id === id) || null; }
function createTask() {
  const t = {
    id: rand("tsk_"), name: "New task", prompt: "", target: { type: "chat" },
    schedule: { mode: "off", everyMinutes: 60, time: "09:00", weekday: 1 }, // off | interval | daily | weekly
    lastRun: 0,
  };
  const arr = loadTasks(); arr.unshift(t); saveTasks(arr); return t;
}
function updateTask(id, patch) {
  const arr = loadTasks(); const i = arr.findIndex((t) => t.id === id); if (i < 0) return null;
  arr[i] = { ...arr[i], ...patch }; saveTasks(arr); return arr[i];
}
function deleteTask(id) {
  saveTasks(loadTasks().filter((t) => t.id !== id));
  try { fs.unlinkSync(path.join(runsDir(), id + ".json")); } catch {}
  return true;
}

const runsFile = (id) => path.join(runsDir(), id + ".json");
function getRuns(taskId) { try { return JSON.parse(fs.readFileSync(runsFile(taskId), "utf8")); } catch { return []; } }
function addRun(taskId, run) {
  ensure();
  const runs = getRuns(taskId);
  runs.unshift({ at: Date.now(), ...run });
  fs.writeFileSync(runsFile(taskId), JSON.stringify(runs.slice(0, 20), null, 2));
  updateTask(taskId, { lastRun: Date.now() });
  return run;
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, getRuns, addRun };
