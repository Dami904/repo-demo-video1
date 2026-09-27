import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");

export function filmDir(name: string): string {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`Bad film name: ${name}`);
  return join(ROOT, "videos", name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readJson(path: string): any {
  // Strip a UTF-8 byte order mark, which Windows editors sometimes add.
  return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}

/** The engine version: stage.html's ?v= must match the scripts it loads. */
export function engineVersion(): string {
  const html = readFileSync(join(ROOT, "engine", "stage.html"), "utf8");
  return /stage\.js\?v=(\w+)/.exec(html)?.[1] ?? "0";
}
