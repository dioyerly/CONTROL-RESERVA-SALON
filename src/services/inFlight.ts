// Evita guardados duplicados (doble clic, reintento): mientras una operación con la misma clave
// esté en curso, las siguientes con esa clave se ignoran. Claves distintas sí pueden correr a la vez.
// Libera la clave tanto si la operación termina bien como si falla.
export function createInFlightRunner(onBusyChange?: (busyKeys: string[]) => void) {
  const busy = new Set<string>();
  const notify = () => onBusyChange?.(Array.from(busy));

  return {
    isBusy: (key: string) => busy.has(key),
    // Devuelve false si la clave ya estaba en curso; si fn falla, el error sigue su curso para que la UI lo muestre
    async run(key: string, fn: () => Promise<void>): Promise<boolean> {
      if (busy.has(key)) return false;
      busy.add(key);
      notify();
      try {
        await fn();
        return true;
      } finally {
        busy.delete(key);
        notify();
      }
    }
  };
}
