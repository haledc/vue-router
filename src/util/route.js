/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

// ! 创建路由的具体方法
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

  // ! 创建路由对象
  const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery),
    matched: record ? formatMatch(record) : [] // ! 匹配到的所有路径
  }
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route) // ! 使路由对象不可修改
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
// ! 初始路径
export const START = createRoute(null, {
  path: '/'
})

// ! 格式化匹配的路由的方法
function formatMatch(record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  // ! 通过记录循环向上找父的记录，直到找到最外层，
  // ! 并把所有的记录都存储到一个数组中，返回的就是记录的数组
  // ! 它记录了一条线路上的所有记录，从上到下
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}

function getFullPath({ path, query = {}, hash = '' }, _stringifyQuery): string {
  const stringify = _stringifyQuery || stringifyQuery
  return (path || '/') + stringify(query) + hash
}

// ! 判断是否时相同路由的方法
export function isSameRoute(a: Route, b: ?Route): boolean {
  if (b === START) {
    return a === b
  } else if (!b) {
    return false
  } else if (a.path && b.path) {
    return (
      a.path.replace(trailingSlashRE, '') ===
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
      return isObjectEqual(aVal, bVal)
    }
    return String(aVal) === String(bVal)
  })
}

export function isIncludedRoute(current: Route, target: Route): boolean {
  return (
    current.path
      .replace(trailingSlashRE, '/')
      .indexOf(target.path.replace(trailingSlashRE, '/')) === 0 &&
    (!target.hash || current.hash === target.hash) &&
    queryIncludes(current.query, target.query)
  )
}

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
