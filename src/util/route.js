/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

// ! 创建当前路由对象 route
export function createRoute(
  record: ?RouteRecord,
  location: Location,
  redirectedFrom?: ?Location,
  router?: VueRouter
): Route {
  const stringifyQuery = router && router.options.stringifyQuery

  let query: any = location.query || {}
  try {
    query = clone(query)
  } catch (e) {}

  // ! 创建 route 对象
  const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery), // ! 获取完整路径
    matched: record ? formatMatch(record) : [] // ! 获取所有的匹配 record
  }

  // ! 设置重定向路径
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route) // ! 冻结路由对象，使它不可修改
}

// ! 路由深拷贝的方法
function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone)
  } else if (value && typeof value === 'object') {
    const res = {}
    for (const key in value) {
      res[key] = clone(value[key])
    }
    return res
  } else {
    return value
  }
}

// the starting route that represents the initial state
// ! 初始的 route
export const START = createRoute(null, {
  path: '/'
})

// ! 获取所有的匹配 record
function formatMatch(record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}

// ! 获取完整路径（拼接 path + query + hash）
function getFullPath({ path, query = {}, hash = '' }, _stringifyQuery): string {
  const stringify = _stringifyQuery || stringifyQuery
  return (path || '/') + stringify(query) + hash
}

// ! 是否是相同 route
export function isSameRoute(a: Route, b: ?Route): boolean {
  if (b === START) {
    return a === b
  } else if (!b) {
    return false
  } else if (a.path && b.path) {
    return (
      a.path.replace(trailingSlashRE, '') === // ! 去斜杠 / 后再比较
        b.path.replace(trailingSlashRE, '') &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query)
    )
  } else if (a.name && b.name) {
    return (
      a.name === b.name &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query) &&
      isObjectEqual(a.params, b.params)
    )
  } else {
    return false
  }
}

// ! 是否是相同的对象（比较对象的值）
function isObjectEqual(a = {}, b = {}): boolean {
  // handle null value #1566
  if (!a || !b) return a === b
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  return aKeys.every(key => {
    const aVal = a[key]
    const bVal = b[key]
    // check nested equality
    if (typeof aVal === 'object' && typeof bVal === 'object') {
      return isObjectEqual(aVal, bVal) // ! 对象类型递归比较
    }
    return String(aVal) === String(bVal) // ! 原始类型转换成字符串后再比较
  })
}

// ! 是否包含 route -> current 是否包含 target
export function isIncludedRoute(current: Route, target: Route): boolean {
  return (
    current.path
      .replace(trailingSlashRE, '/') // ! 添加斜杠 /
      .indexOf(target.path.replace(trailingSlashRE, '/')) === 0 &&
    (!target.hash || current.hash === target.hash) &&
    queryIncludes(current.query, target.query)
  )
}

// ! 是否包含 query
function queryIncludes(
  current: Dictionary<string>,
  target: Dictionary<string>
): boolean {
  for (const key in target) {
    if (!(key in current)) {
      return false
    }
  }
  return true
}
