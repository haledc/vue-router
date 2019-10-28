// ! 扩展：使用 b 扩展 a
export function extend (a, b) {
  for (const key in b) {
    a[key] = b[key]
  }
  return a
}
