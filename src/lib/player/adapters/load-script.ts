const loading = new Map<string, Promise<void>>();

/** 外部スクリプトを1回だけ読み込む */
export function loadScript(src: string, ready: () => boolean, readyEvent?: string): Promise<void> {
  if (ready()) return Promise.resolve();
  if (!loading.has(src)) {
    loading.set(
      src,
      new Promise<void>((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        const done = () => (ready() ? resolve() : undefined);
        if (readyEvent) document.addEventListener(readyEvent, () => resolve(), { once: true });
        el.onload = () => {
          if (!readyEvent) done();
          else if (ready()) resolve();
        };
        el.onerror = () => {
          loading.delete(src);
          reject(new Error(`failed to load ${src}`));
        };
        document.head.appendChild(el);
      }),
    );
  }
  return loading.get(src)!;
}

export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
