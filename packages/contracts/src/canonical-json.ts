type JsonScalar = null | boolean | number | string;

function canonicalJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical JSON does not support cyclic values");
    }
    ancestors.add(value);
    try {
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Canonical JSON does not support sparse arrays");
        }
        entries.push(canonicalJsonValue(value[index], ancestors));
      }
      return `[${entries.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }

  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only supports plain objects");
    }
    if (ancestors.has(value)) {
      throw new TypeError("Canonical JSON does not support cyclic values");
    }
    ancestors.add(value);
    try {
      return `{${Object.keys(value)
        .sort()
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || "get" in descriptor || "set" in descriptor) {
            throw new TypeError("Canonical JSON does not support accessor properties");
          }
          return `${JSON.stringify(key)}:${canonicalJsonValue(descriptor.value, ancestors)}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }

  throw new TypeError("Canonical JSON only supports JSON values");
}

/** Produces deterministic, whitespace-free JSON suitable for signed bytes. */
export function canonicalJson(value: JsonScalar | readonly unknown[] | Record<string, unknown>): string {
  return canonicalJsonValue(value, new Set());
}
