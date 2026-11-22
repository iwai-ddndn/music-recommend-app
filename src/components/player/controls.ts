"use client";

// 現在アクティブなアダプターへの操作。アダプターは常に1つだけ（PlayerEngine が管理）。
import type { PlayerAdapter } from "@/lib/player/types";

let active: PlayerAdapter | null = null;
let container: HTMLElement | null = null;
const containerWaiters: ((el: HTMLElement) => void)[] = [];
let userGesture = false;

export function setActiveAdapter(a: PlayerAdapter | null) {
  active = a;
}

export function getActiveAdapter() {
  return active;
}

export function setEmbedContainer(el: HTMLElement | null) {
  container = el;
  if (el) containerWaiters.splice(0).forEach((w) => w(el));
}

export function waitEmbedContainer(): Promise<HTMLElement> {
  if (container) return Promise.resolve(container);
  return new Promise((r) => containerWaiters.push(r));
}

/** 直近の操作がユーザー起点か（モバイルの自動再生制限の再現・判定用） */
export function markUserGesture() {
  userGesture = true;
  setTimeout(() => (userGesture = false), 1500);
}

export function isUserGesture() {
  return userGesture;
}

export async function play() {
  markUserGesture();
  await active?.play();
}

export async function pause() {
  await active?.pause();
}

export async function seek(sec: number) {
  await active?.seek?.(sec);
}
