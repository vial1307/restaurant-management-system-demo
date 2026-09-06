export function defineLazyDerivedProperties(target, definitions) {
  for (const [key, factory] of Object.entries(definitions || {})) {
    if (typeof factory !== "function") continue;

    const materialize = (value) => {
      Object.defineProperty(target, key, {
        value,
        writable:true,
        enumerable:true,
        configurable:true,
      });
      return value;
    };

    Object.defineProperty(target, key, {
      enumerable:true,
      configurable:true,
      get() {
        return materialize(factory());
      },
      set(value) {
        materialize(value);
      },
    });
  }
  return target;
}
