export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, action: () => void, className = 'button secondary') {
  const b = el('button', className, text);
  b.type = 'button';
  b.onclick = action;
  return b;
}

