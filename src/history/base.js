/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError, isRouterError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError
} from './errors'

// ! History 基类
export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // implemented by sub-classes
  // ! 子类实现的方法
  +go: (n: number) => void
  +push: (loc: RawLocation) => void
  +replace: (loc: RawLocation) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor(router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base) // ! 基础路径
    // start with a route object that stands for "nowhere"
    this.current = START // ! 赋值初始 route
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen(cb: Function) {
    this.cb = cb
  }

  onReady(cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError(errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  // ! 路由跳转
  transitionTo(
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    const route = this.router.match(location, this.current) // ! 获取匹配路由
    this.confirmTransition(
      route,
      () => {
        const prev = this.current
        this.updateRoute(route) // ! 跳转成功更新当前路由值
        onComplete && onComplete(route) // ! 执行跳转成功函数
        this.ensureURL() // ! 确认 URL，跳转路由
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          this.ready = true
          this.readyErrorCbs.forEach(cb => {
            cb(err)
          })
        }
      }
    )
  }

  // ! 确认跳转 -> 相当于扩展 transitionTo
  confirmTransition(route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current // ! 当前路径

    // ! 中断路由跳转的方法
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      // ! 非导航重复的报错时
      if (!isRouterError(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }

    // ! 如果跳转的是相同路由就不跳转
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route)) // ! 中止并传入导航重复错误
    }

    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    // ! 构造守卫钩子队列 -> 先进先出
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated), // ! ① 在失活的组件里调用离开守卫
      // global before hooks
      this.router.beforeHooks, // ! ② 调用全局的 beforeEach 守卫
      // in-component update hooks
      extractUpdateHooks(updated), // ! ③ 在重用的组件里调用 beforeRouteUpdate 守卫
      // in-config enter guards
      activated.map(m => m.beforeEnter), // ! ④ 在激活的路由配置里调用 beforeEnter
      // async components
      resolveAsyncComponents(activated) // ! ⑤ 解析异步路由组件
    )

    // ! 存储路由
    this.pending = route

    // ! 迭代器方法 -> 执行 queue 中的守卫钩子
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        // ! 执行钩子函数（守卫）并传入参数 (route -> to current -> from next -> fn)
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            // ! next(false) -> 中断跳转
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to) // ! 最后执行 next
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // ! 执行守卫钩子队列
    runQueue(queue, iterator, () => {
      const postEnterCbs = []
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      // ! 异步组件解析之后
      // ! ⑥ 在被激活的组件里调用 beforeRouteEnter
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
      const queue = enterGuards.concat(this.router.resolveHooks) // ! ⑦ 调用全局的 beforeResolve 守卫

      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        onComplete(route) // ! ⑧ 调用全局的 afterEach 钩子
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => {
              cb()
            })
          })
        }
      })
    })
  }

  // ! 更新当前路由 this.current 的方法
  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  setupListeners () {
    // Default implementation is empty
  }

  teardownListeners () {
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []
  }
}

// ! 规范化基础路径
function normalizeBase(base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

// ! 解析队列
function resolveQueue(
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    // ! 当前路由路径和跳转路由路径不同时跳出遍历
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i), // ! 可复用的组件对应路由 -> 相同部分 record
    activated: next.slice(i), // ! 需要渲染的组件对应路由
    deactivated: current.slice(i) // ! 失活的组件对应路由
  }
}

// ! 提取所有守卫钩子
function extractGuards(
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean // ! 是否反转数组
): Array<?Function> {
  // ! 获取所有的守卫钩子
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name) // ! 获取对应的守卫钩子
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key)) // ! 遍历执行数组的守卫钩子
        : bind(guard, instance, match, key)
    }
  })
  // ! 数组降维，先判断是否需要反转
  return flatten(reverse ? guards.reverse() : guards)
}

// ! 提取守卫钩子的方法（通过 key 值函数名）
function extractGuard(
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def) // ! 是对象的时候，使用 Vue 扩展成一个构造器
  }
  return def.options[key]
}

// ! 提取离开的守卫的方法
function extractLeaveGuards(deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true) // ! 需要反转数组；先子后父
}

// ! 提取更新的守卫的方法
function extractUpdateHooks(updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

// ! 绑定守卫钩子的方法
function bindGuard(guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard() {
      return guard.apply(instance, arguments) // ! 把组件实例作为上下文
    }
  }
}

// ! 提取进入的守卫的方法
function extractEnterGuards(
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key, cbs, isValid)
    }
  )
}

// ! 绑定进入的守卫的方法
function bindEnterGuard(
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard(to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          // ! 进入前没有创建实例，无法获取 this，通过传入一个实例对象获取
          poll(cb, match.instances, key, isValid)
        })
      }
      next(cb)
    })
  }
}

function poll(
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
