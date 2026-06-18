import type { LayerData } from './gisLayerTypes'

const DB_NAME = 'GisMapStore'
const STORE_NAME = 'layers'

const initDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** Layers persisted in browser IndexedDB (GIS Content). */
export async function loadGisMapSavedLayers(): Promise<LayerData[]> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get('savedLayers')
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as LayerData[]) : [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}
