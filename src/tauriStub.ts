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

/**
 * Signatures are deliberately variadic. This module stands in for several
 * `@tauri-apps/*` entry points at once, and its callers live in the submodule —
 * a narrower signature type-errors at the call site (`invoke(cmd, args)`)
 * even though resolution succeeds at runtime.
 */
const rejects = (what: string) => (..._args: unknown[]): Promise<never> =>
  Promise.reject(new TauriUnavailableError(what));

// api/core
export function invoke<T>(cmd: string, ..._args: unknown[]): Promise<T> {
  return Promise.reject(new TauriUnavailableError(`invoke(${cmd})`));
}
export function convertFileSrc(filePath: string, _protocol?: string): string {
  return filePath;
}
export function isTauri(): boolean {
  return false;
}

// api/event
export async function listen(..._args: unknown[]): Promise<() => void> {
  return () => {};
}
export async function once(..._args: unknown[]): Promise<() => void> {
  return () => {};
}
export const emit = rejects("emit");

// api/app
export const getVersion = async (..._args: unknown[]): Promise<string> => "lab";
export const getName = async (..._args: unknown[]): Promise<string> => "TerraNova Lab";

// api/path
export const appDataDir = rejects("appDataDir");
export const resolve = rejects("resolve");
export const join = rejects("join");
export const sep = "/";

// plugin-dialog
export const open = rejects("dialog.open");
export const save = rejects("dialog.save");
export const message = rejects("dialog.message");
export const confirm = rejects("dialog.confirm");
export const ask = rejects("dialog.ask");

// plugin-fs
export const readTextFile = rejects("fs.readTextFile");
export const writeFile = rejects("fs.writeFile");
export const writeBinaryFile = rejects("fs.writeBinaryFile");
export const readFile = rejects("fs.readFile");
export const remove = rejects("fs.remove");
export const writeTextFile = rejects("fs.writeTextFile");
export const exists = async (..._args: unknown[]): Promise<boolean> => false;
export const mkdir = rejects("fs.mkdir");
export const readDir = rejects("fs.readDir");

// plugin-updater
export const check = rejects("updater.check");

export default {};
