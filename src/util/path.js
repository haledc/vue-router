/* @flow */

// ! 拼接路径
export function resolvePath(
  relative: string, // ! 拼接路径
  base: string, // ! 基础路径
  append?: boolean // ! 是否拼接路径
): string {
  const firstChar = relative.charAt(0)

  // ! 绝对路径直接返回它
  if (firstChar === '/') {
    return relative
  }

  // ! query 和 hash 直接拼接
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  // ! 基础路径以 / 分隔字符串成数组
  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending // ! 不拼接路径
  // - appending to trailing slash (last segment is empty) // ! 以 / 结尾，即最后一个分隔体是空字符串
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  // ! 去开头的 / 然后以 / 分隔字符串成数组，再遍历数组
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    // ! 出现 .. ，需要提升一级，基础路径中删除最后一个元素
    if (segment === '..') {
      stack.pop()
      // ! 把不为 . 的元素加入到 stack
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  // ! 数组中的第一个元素不是空字符串，再前面添加空字符串
  // ! 这样合并后的路径是以 / 开头的
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

// ! 解析路径 -> 生成 path query hash 字符串组成的对象
export function parsePath(
  path: string
): {
  path: string,
  query: string,
  hash: string
} {
  // ! 先定义初始值为空字符串
  let hash = ''
  let query = ''

  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}

// ! 清除路径 -> 2个 // 替换为 1 个 /
export function cleanPath(path: string): string {
  return path.replace(/\/\//g, '/')
}
