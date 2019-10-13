import View from './components/view'
import Link from './components/link'

export let _Vue

export function install(Vue) {
  if (install.installed && _Vue === Vue) return // !确保 install 只安装一次
  install.installed = true // ! 已安装标志

  _Vue = Vue // ! 赋值给全局遍历，共享 Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (
      isDef(i) &&
      isDef((i = i.data)) &&
      isDef((i = i.registerRouteInstance))
    ) {
      i(vm, callVal)
    }
  }

  // ! 使用 Vue 的 mixin 给路由的每个组件注入 beforeCreate 和 destroyed 钩子
  Vue.mixin({
    beforeCreate() {
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        this._router.init(this) // ! 初始化路由
        Vue.util.defineReactive(this, '_route', this._router.history.current) // ! 变成响应式
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this // ! 始终指向 Vue
      }
      registerInstance(this, this) // ! 注册路由
    },
    destroyed() {
      registerInstance(this)
    }
  })

  // ! 定义 $router，可以在 vue 实例中访问 (只读属性)
  Object.defineProperty(Vue.prototype, '$router', {
    get() {
      return this._routerRoot._router
    }
  })

  // ! 定义 $route，可以在 vue 实例中访问 (只读属性)
  Object.defineProperty(Vue.prototype, '$route', {
    get() {
      return this._routerRoot._route
    }
  })

  Vue.component('RouterView', View) // ! 全局注册 <router-view> 组件
  Vue.component('RouterLink', Link) // ! 全局注册 <router-link> 组件

  // ! 定义路由钩子合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate =
    strats.created
}
