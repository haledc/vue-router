/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

// ! 创建路由映射的方法 -> 创建三个表：路径列表 路径映射表 命名映射表
export function createRouteMap(
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // the path list is used to control path matching priority
  // ! 路径列表 -> [path1, path2, ...]  -> 这里的路径未填充 params
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  // ! 路径映射表 { path1: record1, path2: record2, ... } -> 这里的路径未填充 params
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  // ! 命名映射表 { name1: record1, name2: record2, ... }
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // ! 遍历用户定义的 routes，把每个 route 添加到相应的表中
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end
  for (let i = 0, l = pathList.length; i < l; i++) {
    // ! 通配符 *，匹配优先级最低
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0]) // ! 取出通配符，放到路径列表最后面
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
      // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')
    // ! 获取不以 / 开头，也不是 * 的路由路径 -> 无效路径

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(
        false,
        `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`
      )
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}

// ! 增加路由记录的方法
function addRouteRecord(
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route // ! 获取路由的路径和名称
  if (process.env.NODE_ENV !== 'production') {
    // ! 路径必须填写，否则报错
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string', // ! 组件不能是字符串类型，否则报错
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )
  }

  // ! 路由正则选项
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict) // ! 规范化路径

  // ! caseSensitive 匹配规则 -> 是否大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // ! 创建 record 对象
  const record: RouteRecord = {
    path: normalizedPath, // ! 规范化后的路径
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // ! 正则表达式扩展
    components: route.components || { default: route.component }, // ! 实例组件组 / 组件
    instances: {},
    name, // ! 路由名称
    parent, // ! 父级 record
    matchAs,
    redirect: route.redirect, // ! 重定向
    beforeEnter: route.beforeEnter, // ! 路由独享的 beforeEnter 钩子
    meta: route.meta || {}, // ! 元信息
    // ! 路由组件传参
    props:
      route.props == null
        ? {}
        : route.components
        ? route.props
        : { default: route.props }
  }

  // ! 如果有子路由，递归增加路由记录
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${route.name}'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }

    // ! 遍历子路由
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // ! 添加到路径列表和路径映射表
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  // ! 处理别名
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      const aliasRoute = {
        path: alias,
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // ! 添加到命名映射表
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

// ! 生成路由匹配正则 -> 根据路径和选项生成
function compileRouteRegex(
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

// ! 规范化路径的方法 -> 拼接路径，去多余的 /
function normalizePath(
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  if (!strict) path = path.replace(/\/$/, '') // ! 没设置 strict, 去掉路径末尾的 /
  if (path[0] === '/') return path // ! 绝对路径直接返回它
  if (parent == null) return path // ! 没有父级记录直接返回它
  return cleanPath(`${parent.path}/${path}`) // ! 拼接父级路径，并使两个 // 替换为一个 /
}
