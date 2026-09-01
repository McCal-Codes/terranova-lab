/**
 * Browser stub for every `@tauri-apps/*` specifier, mapped in by the
 * `stubTauri` plugin in vite.config.ts.
 *
 * The lab runs TerraNova's modules verbatim from the submodule, and a few of
 * them reach the Tauri API transitively — notably:
 *   densityWorkerClient -> previewWorkerLog -> settingsStore -> exportSvg
 *   densityExportRegistry -> utils/ipc (invoke, plus a dynamic import of event)
 *
 * Stubbing at the `@tauri-apps` boundary (rather than at `@/utils/ipc`) keeps
 * this to one file with no export surface to keep in sync with the submodule,
 * and keeps real Tauri code out of the bundle entirely.
 *
 * Calls REJECT rather than resolving empty. Every consumer in the lab's import
 * graph already treats a failed IPC call as "no synced Hytale assets" and falls
 * back to bundled exports, so rejecting exercises the intended path; resolving
 * a fake success would invent data that isn't there.
 */

export class TauriUnavailableError extends Error {
  constructor(what: string) {
    super(`"${what}" is a desktop-only Tauri API and is unavailable in the browser.`);
    this.name = "TauriUnavailableError";
  }
}

const reject = (what: string) => () => Promise.reject(new TauriUnavailableError(what));

// api/core
export function invoke<T>(cmd: string): Promise<T> {
  return Promise.reject(new TauriUnavailableError(`invoke(${cmd})`));
}
export function convertFileSrc(filePath: string): string {
  return filePath;
}
export function isTauri(): boolean {
  return false;
}

// api/event
export async function listen(): Promise<() => void> {
  return () => {};
}
export async function once(): Promise<() => void> {
  return () => {};
}
export const emit = reject("emit");

// api/app
export const getVersion = async (): Promise<string> => "lab";
export const getName = async (): Promise<string> => "TerraNova Lab";

// api/path
export const appDataDir = reject("appDataDir");
export const resolve = reject("resolve");
export const join = reject("join");
export const sep = "/";

// plugin-dialog
export const open = reject("dialog.open");
export const save = reject("dialog.save");
export const message = reject("dialog.message");
export const confirm = reject("dialog.confirm");
export const ask = reject("dialog.ask");

// plugin-fs
export const readTextFile = reject("fs.readTextFile");
export const writeTextFile = reject("fs.writeTextFile");
export const exists = async (): Promise<boolean> => false;
export const mkdir = reject("fs.mkdir");
export const readDir = reject("fs.readDir");

// plugin-updater
export const check = reject("updater.check");

export default {};
