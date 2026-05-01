/**
 * GlucosaBST — Árbol Binario de Búsqueda en memoria
 *
 * Los nodos se ordenan por el campo `fecha` (string ISO "YYYY-MM-DDTHH:mm").
 * La comparación lexicográfica de esos strings equivale al orden cronológico,
 * por lo que el recorrido in-order produce la lista ordenada por fecha.
 *
 * Operaciones y complejidad (n = número de registros):
 *   insert(record)  → O(log n) promedio, O(n) peor caso (árbol degenerado)
 *   remove(id)      → O(log n) promedio
 *   toArray()       → O(n)  — recorrido in-order
 *   size            → O(1)
 *
 * Para la escala típica de este tracker (< 10 000 registros) el rendimiento
 * es más que suficiente. En producción de alta escala se usaría un árbol
 * auto-balanceado (AVL / Red-Black), pero aquí la implementación simple es
 * más legible y fácil de auditar.
 */

class BSTNode {
  constructor(record) {
    this.record = record; // { id, fecha, valor, contexto }
    this.left   = null;
    this.right  = null;
  }
}

export class GlucosaBST {
  constructor() {
    this._root = null;
    this._size = 0;
  }

  get size() {
    return this._size;
  }

  // ── Insertar ──────────────────────────────────────────────────────────────
  insert(record) {
    this._root = this._insert(this._root, record);
    this._size++;
  }

  _insert(node, record) {
    if (!node) return new BSTNode(record);
    if (record.fecha < node.record.fecha) {
      node.left  = this._insert(node.left,  record);
    } else if (record.fecha > node.record.fecha) {
      node.right = this._insert(node.right, record);
    } else {
      // Fechas iguales: desempate por id (numérico) para evitar colisiones
      if (record.id < node.record.id) {
        node.left  = this._insert(node.left,  record);
      } else {
        node.right = this._insert(node.right, record);
      }
    }
    return node;
  }

  // ── Eliminar por id ───────────────────────────────────────────────────────
  remove(id) {
    const before = this._size;
    this._root = this._remove(this._root, id);
    if (this._size === before) {
      // id no encontrado — no decrementar
    }
  }

  _remove(node, id) {
    if (!node) return null;

    if (id === node.record.id) {
      this._size--;
      // Caso 1: hoja
      if (!node.left && !node.right) return null;
      // Caso 2: un solo hijo
      if (!node.left)  return node.right;
      if (!node.right) return node.left;
      // Caso 3: dos hijos → reemplazar con el sucesor in-order (mínimo del subárbol derecho)
      const successor = this._minNode(node.right);
      node.record = successor.record;
      // Eliminar el sucesor del subárbol derecho (sin decrementar dos veces)
      this._size++;
      node.right = this._remove(node.right, successor.record.id);
    } else {
      node.left  = this._remove(node.left,  id);
      node.right = this._remove(node.right, id);
    }
    return node;
  }

  _minNode(node) {
    while (node.left) node = node.left;
    return node;
  }

  // ── Recorrido in-order → array ordenado por fecha ascendente ─────────────
  _inOrder(node, result) {
    if (!node) return;
    this._inOrder(node.left,  result);
    result.push(node.record);
    this._inOrder(node.right, result);
  }

  /**
   * Devuelve los registros ordenados de MÁS RECIENTE a MÁS ANTIGUO
   * (in-order inverso, i.e. recorrido derecha → raíz → izquierda).
   */
  toArray() {
    const result = [];
    this._inOrder(this._root, result);
    return result.reverse(); // más reciente primero
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  /** Reconstruye el árbol completo a partir de un array de registros. */
  static fromArray(records) {
    const tree = new GlucosaBST();
    for (const r of records) tree.insert(r);
    return tree;
  }
}
