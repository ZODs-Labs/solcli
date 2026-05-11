import type { Err, Ok, Result } from "@solcli/contracts";

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw r.error;
  return r.value;
}
