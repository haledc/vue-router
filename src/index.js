/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

// ! 路由类
export default class VueRouter {
  static install: () => void
  static version: string

  app: any
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  options: RouterOptions
  mode: string
  history: HashHistory | HTML5History | AbstractHistory
  matcher: Matcher
  fallback: boolean
  beforeHooks: Array<?NavigationGuard>
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook>

  constructor(options: RouterOptions = {}) {
    this.app = null // ! 根 Vue 实例
    this.apps = [] // ! 存储所有子组件的 Vue 实例
    this.options = options // ! 存储传入的路由配置
    this.beforeHooks = [] // ! 存储 before 类钩子
    this.resolveHooks = [] // ! 存储 resolve 类钩子
    this.afterHooks = [] // ! after 类钩子
    this.matcher = createMatcher(options.routes || [], this) // ! 创建路由匹配对象 matcher

    let mode = options.mode || 'hash' // ! 路由模式，默认 hash 模式

    // ! 是否降级，使用了 H5 模式且浏览器不支持 pushState，并且设置了 fallback 选项为 true（默认）
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash' // ! 自动降级为 hash 模式
    }
    if (!inBrowser) {
      mode = 'abstract' // ! 非浏览器环境（服务端渲染），使用 abstract 模式
    }
    this.mode = mode // ! @API

    // ! 匹配不同的模式，生成不同的 History 实例对象
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  // ! 匹配路由 -> 调用 matcher 对象的 match 方法 -> 生成匹配的路由
  match(raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // ! 获取当前的路由 @API
  get currentRoute(): ?Route {
    return this.history && this.history.current
  }

  // ! 路由的初始化，传入组件实例为参数
  init(app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' &&
      assert(
        install.installed,
        `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
          `before creating root instance.`
      )

    this.apps.push(app) // ! 存储组件实例

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null

      if (!this.app) {
        // clean up event listeners
        // https://github.com/vuejs/vue-router/issues/2341
        this.history.teardownListeners()
      }
    })

    // main app previously initialized
    // return as we don't need to set up new history listener
    if (this.app) {
      return
    }

    this.app = app

    const history = this.history // ! 获取 History 实例

    // ! 判断 History 实例的类型，使用不同的方法切换路径（路由跳转）
    if (history instanceof HTML5History || history instanceof HashHistory) {
      const setupListeners = () => {
        history.setupListeners()
      }
      history.transitionTo(history.getCurrentLocation(), setupListeners, setupListeners)
    }

    // ! 监听并更新 route
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }

  // ! 全局路由 beforeEach 钩子 @API
  beforeEach(fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  // ! 全局路由 beforeResolve 钩子 @API
  beforeResolve(fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  // ! 全局路由 afterEach 钩子 @API
  afterEach(fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }

  // ! 监听 Ready @API
  onReady(cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  // ! 监听错误 @API
  onError(errorCb: Function) {
    this.history.onError(errorCb)
  }

  // ! push，可以返回原页面。使用 history 的 push 方法 @API
  // ! 没有设置第二和第三个参数和宿主环境支持 Promise 时，返回一个 Promise 对象
  push(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  // ! 替换，无法返回原页面。使用 history 的 replace 方法  @API
  // ! 没有设置第二和第三个参数和宿主环境支持 Promise 时，返回一个 Promise 对象
  replace(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  // ! 前进或者后退 @API
  go(n: number) {
    this.history.go(n)
  }

  // ! 后退 @API
  back() {
    this.go(-1)
  }

  // ! 前进 @API
  forward() {
    this.go(1)
  }

  // ! 获取跳转路由或者当前路由匹配的组件数组 @API
  getMatchedComponents(to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  // ! 解析跳转路由的信息 @API
  resolve(
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current) // ! 当前路由
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode) // ! 最终跳转地址
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  // ! 动态添加路由 @API -> 添加到匹配对象中
  addRoutes(routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

// ! 注册钩子的方法
function registerHook(list: Array<any>, fn: Function): Function {
  list.push(fn) // ! 加入到对应的钩子列表中
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

// ! 生成 href 的方法
function createHref(base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

VueRouter.install = install
VueRouter.version = '__VERSION__'

// ! 使用 CDN 引入时自动调用 use 安装，不用手动安装
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
