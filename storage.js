// Persistencia con localStorage siempre dentro de try/catch.
// Si el navegador no deja guardar, la app sigue en memoria y avisa una vez.

/**
 * @param key clave en localStorage
 * @param getBackend función que devuelve el storage (acceder a window.localStorage puede lanzar)
 * @param onFail se llama cuando no se puede guardar
 */
export function createStore(key, getBackend, onFail = () => {}) {
  let backend = null;
  let memory = null;
  let persistent = true;
  let warned = false;

  const fail = () => {
    persistent = false;
    if (!warned) {
      warned = true;
      onFail();
    }
  };

  try {
    backend = getBackend();
    const probe = `${key}.probe`;
    backend.setItem(probe, '1');
    backend.removeItem(probe);
  } catch {
    backend = null;
    fail();
  }

  return {
    get persistent() {
      return persistent;
    },
    load() {
      if (backend && persistent) {
        try {
          const raw = backend.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch {
          fail();
        }
      }
      return memory ? JSON.parse(memory) : null;
    },
    save(data) {
      memory = JSON.stringify(data);
      if (!backend || !persistent) return;
      try {
        backend.setItem(key, memory);
      } catch {
        fail();
      }
    },
    clear() {
      memory = null;
      if (!backend || !persistent) return;
      try {
        backend.removeItem(key);
      } catch {
        fail();
      }
    },
  };
}
