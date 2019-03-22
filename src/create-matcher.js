/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (
    raw: RawLocation,
    current?: Route,
    redirectedFrom?: Location
  ) => Route,
  addRoutes: (routes: Array<RouteConfig>) => void
}

// ! 创建匹配对象的方法
export function createMatcher(
  routes: Array<RouteConfig>, // ! 用户定义的路由配置
  router: VueRouter // ! 路由实例
): Matcher {
  const { pathList, pathMap, nameMap } = createRouteMap(routes) // ! 创建路由映射表

  // ! 动态添加路由的方法
  function addRoutes(routes) {
    createRouteMap(routes, pathList, pathMap, nameMap) // ! 再次创建路由映射表，对已有的映射表进行扩展
  }

  // ! 匹配路由的方法
  function match(
    raw: RawLocation, // ! 原生路径，可以是 url 字符串，也可以是 location 对象
    currentRoute?: Route, // ! 当前路径
    redirectedFrom?: Location // ! 重定向
  ): Route {
    const location = normalizeLocation(raw, currentRoute, false, router) // ! 格式化 URL
    const { name } = location

    // ! 如果是命名路由，判断路由记录中是否有该路由
    if (name) {
      const record = nameMap[name] // ! 在命名映射表中获取记录
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }

      // ! 如果没有记录，返回空路径
      if (!record) return _createRoute(null, location)
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      // ! 如果有命名路由的记录，计算出路径
      if (record) {
        location.path = fillParams(
          record.path,
          location.params,
          `named route "${name}"`
        )
        return _createRoute(record, location, redirectedFrom) // ! 创建路由
      }
      // ! 非命名路由处理
    } else if (location.path) {
      location.params = {}

      // ! 遍历 pathList，顺序遍历，优先匹配前面的路径
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i] // ! 获取路径
        const record = pathMap[path] // ! 获取 record
        // ! 如果匹配路径，创建路由
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }

  function redirect(record: RouteRecord, location: Location): Route {
    const originalRedirect = record.redirect
    let redirect =
      typeof originalRedirect === 'function'
        ? originalRedirect(createRoute(record, location, null, router))
        : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(
          targetRecord,
          `redirect failed: named route "${name}" not found.`
        )
      }
      return match(
        {
          _normalized: true,
          name,
          query,
          hash,
          params
        },
        undefined,
        location
      )
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      const resolvedPath = fillParams(
        rawPath,
        params,
        `redirect route with path "${rawPath}"`
      )
      // 3. rematch with existing query and hash
      return match(
        {
          _normalized: true,
          path: resolvedPath,
          query,
          hash
        },
        undefined,
        location
      )
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias(
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(
      matchAs,
      location.params,
      `aliased route with path "${matchAs}"`
    )
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  // ! 创建路由的方法；根据不同的条件创建不同的路由
  function _createRoute(
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoutes
  }
}

function matchRoute(regex: RouteRegExp, path: string, params: Object): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = val
    }
  }

  return true
}

function resolveRecordPath(path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
