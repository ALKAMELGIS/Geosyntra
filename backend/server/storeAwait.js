/** Resolve sync or async store method results. */
export function storeAwait(valueOrPromise) {
  return Promise.resolve(valueOrPromise)
}
