/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

// ! 规范化 location 的方法
export function normalizeLocation(
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw // ! 处理字符串类型
  // named target
  // ! 已经 normalized 的直接返回它
  if (next._normalized) {
    return next
    // ! 有 name 属性扩展生成新的 next
  } else if (next.name) {
    next = extend({}, raw)

    // ! 有 params 属性扩展生成新的 params 属性
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  // ! 没有 path 有 params 和 current 时
  if (!next.path && next.params && current) {
    next = extend({}, next) // ! 扩展生成新的 next
    next._normalized = true // ! 设置成已规范化

    // ! 扩展生成新的 params -> next 的 params 优先级更高
    const params: any = extend(extend({}, current.params), next.params)
    // ! 有 name
    if (current.name) {
      next.name = current.name
      next.params = params
      // ! 有匹配的 record
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path // ! 获取 path
      next.path = fillParams(rawPath, params, `path ${current.path}`) // ! 填充动态 params
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // ! 有 path 时
  const parsedPath = parsePath(next.path || '') // ! 通过原始路径生成新的路径对象
  const basePath = (current && current.path) || '/'
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append) // ! 合并
    : basePath

  // ! 解析并扩展 query
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  // ! 生成 hash
  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true, // ! 已规范化标志
    path,
    query,
    hash
  }
}
