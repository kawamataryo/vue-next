import {
  createApp,
  h,
  createCommentVNode,
  withScopeId,
  resolveComponent,
  ComponentOptions
} from 'vue'
import { renderToString, renderComponent, renderSlot, escapeHtml } from '../src'

describe('ssr: renderToString', () => {
  test('should apply app context', async () => {
    const app = createApp({
      render() {
        const Foo = resolveComponent('foo') as ComponentOptions
        return h(Foo)
      }
    })
    app.component('foo', {
      render: () => h('div', 'foo')
    })
    const html = await renderToString(app)
    expect(html).toBe(`<div>foo</div>`)
  })

  describe('components', () => {
    test('vnode components', async () => {
      expect(
        await renderToString(
          createApp({
            data() {
              return { msg: 'hello' }
            },
            render(this: any) {
              return h('div', this.msg)
            }
          })
        )
      ).toBe(`<div>hello</div>`)
    })

    test('optimized components', async () => {
      expect(
        await renderToString(
          createApp({
            data() {
              return { msg: 'hello' }
            },
            ssrRender(ctx, push) {
              push(`<div>${ctx.msg}</div>`)
            }
          })
        )
      ).toBe(`<div>hello</div>`)
    })

    test('nested vnode components', async () => {
      const Child = {
        props: ['msg'],
        render(this: any) {
          return h('div', this.msg)
        }
      }

      expect(
        await renderToString(
          createApp({
            render() {
              return h('div', ['parent', h(Child, { msg: 'hello' })])
            }
          })
        )
      ).toBe(`<div>parent<div>hello</div></div>`)
    })

    test('nested optimized components', async () => {
      const Child = {
        props: ['msg'],
        ssrRender(ctx: any, push: any) {
          push(`<div>${ctx.msg}</div>`)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(renderComponent(Child, { msg: 'hello' }, null, parent))
              push(`</div>`)
            }
          })
        )
      ).toBe(`<div>parent<div>hello</div></div>`)
    })

    test('mixing optimized / vnode components', async () => {
      const OptimizedChild = {
        props: ['msg'],
        ssrRender(ctx: any, push: any) {
          push(`<div>${ctx.msg}</div>`)
        }
      }

      const VNodeChild = {
        props: ['msg'],
        render(this: any) {
          return h('div', this.msg)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(
                renderComponent(OptimizedChild, { msg: 'opt' }, null, parent)
              )
              push(renderComponent(VNodeChild, { msg: 'vnode' }, null, parent))
              push(`</div>`)
            }
          })
        )
      ).toBe(`<div>parent<div>opt</div><div>vnode</div></div>`)
    })

    test('nested components with optimized slots', async () => {
      const Child = {
        props: ['msg'],
        ssrRender(ctx: any, push: any, parent: any) {
          push(`<div class="child">`)
          renderSlot(ctx.$slots.default, { msg: 'from slot' }, push, parent)
          push(`</div>`)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(
                renderComponent(
                  Child,
                  { msg: 'hello' },
                  {
                    // optimized slot using string push
                    default: ({ msg }: any, push: any) => {
                      push(`<span>${msg}</span>`)
                    },
                    _compiled: true // important to avoid slots being normalized
                  },
                  parent
                )
              )
              push(`</div>`)
            }
          })
        )
      ).toBe(
        `<div>parent<div class="child">` +
          `<!----><span>from slot</span><!---->` +
          `</div></div>`
      )
    })

    test('nested components with vnode slots', async () => {
      const Child = {
        props: ['msg'],
        ssrRender(ctx: any, push: any, parent: any) {
          push(`<div class="child">`)
          renderSlot(ctx.$slots.default, { msg: 'from slot' }, push, parent)
          push(`</div>`)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(
                renderComponent(
                  Child,
                  { msg: 'hello' },
                  {
                    // bailed slots returning raw vnodes
                    default: ({ msg }: any) => {
                      return h('span', msg)
                    }
                  },
                  parent
                )
              )
              push(`</div>`)
            }
          })
        )
      ).toBe(
        `<div>parent<div class="child">` +
          `<!----><span>from slot</span><!---->` +
          `</div></div>`
      )
    })

    test('async components', async () => {
      const Child = {
        // should wait for resovled render context from setup()
        async setup() {
          return {
            msg: 'hello'
          }
        },
        ssrRender(ctx: any, push: any) {
          push(`<div>${ctx.msg}</div>`)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(renderComponent(Child, null, null, parent))
              push(`</div>`)
            }
          })
        )
      ).toBe(`<div>parent<div>hello</div></div>`)
    })

    test('parallel async components', async () => {
      const OptimizedChild = {
        props: ['msg'],
        async setup(props: any) {
          return {
            localMsg: props.msg + '!'
          }
        },
        ssrRender(ctx: any, push: any) {
          push(`<div>${ctx.localMsg}</div>`)
        }
      }

      const VNodeChild = {
        props: ['msg'],
        async setup(props: any) {
          return {
            localMsg: props.msg + '!'
          }
        },
        render(this: any) {
          return h('div', this.localMsg)
        }
      }

      expect(
        await renderToString(
          createApp({
            ssrRender(_ctx, push, parent) {
              push(`<div>parent`)
              push(
                renderComponent(OptimizedChild, { msg: 'opt' }, null, parent)
              )
              push(renderComponent(VNodeChild, { msg: 'vnode' }, null, parent))
              push(`</div>`)
            }
          })
        )
      ).toBe(`<div>parent<div>opt!</div><div>vnode!</div></div>`)
    })
  })

  describe('vnode element', () => {
    test('props', async () => {
      expect(
        await renderToString(
          h('div', { id: 'foo&', class: ['bar', 'baz'] }, 'hello')
        )
      ).toBe(`<div id="foo&amp;" class="bar baz">hello</div>`)
    })

    test('text children', async () => {
      expect(await renderToString(h('div', 'hello'))).toBe(`<div>hello</div>`)
    })

    test('array children', async () => {
      expect(
        await renderToString(
          h('div', [
            'foo',
            h('span', 'bar'),
            [h('span', 'baz')],
            createCommentVNode('qux')
          ])
        )
      ).toBe(
        `<div>foo<span>bar</span><!----><span>baz</span><!----><!--qux--></div>`
      )
    })

    test('void elements', async () => {
      expect(await renderToString(h('input'))).toBe(`<input>`)
    })

    test('innerHTML', async () => {
      expect(
        await renderToString(
          h(
            'div',
            {
              innerHTML: `<span>hello</span>`
            },
            'ignored'
          )
        )
      ).toBe(`<div><span>hello</span></div>`)
    })

    test('textContent', async () => {
      expect(
        await renderToString(
          h(
            'div',
            {
              textContent: `<span>hello</span>`
            },
            'ignored'
          )
        )
      ).toBe(`<div>${escapeHtml(`<span>hello</span>`)}</div>`)
    })

    test('textarea value', async () => {
      expect(
        await renderToString(
          h(
            'textarea',
            {
              value: `<span>hello</span>`
            },
            'ignored'
          )
        )
      ).toBe(`<textarea>${escapeHtml(`<span>hello</span>`)}</textarea>`)
    })
  })

  describe('scopeId', () => {
    // note: here we are only testing scopeId handling for vdom serialization.
    // compiled srr render functions will include scopeId directly in strings.
    const withId = withScopeId('data-v-test')
    const withChildId = withScopeId('data-v-child')

    test('basic', async () => {
      expect(
        await renderToString(
          withId(() => {
            return h('div')
          })()
        )
      ).toBe(`<div data-v-test></div>`)
    })

    test('with slots', async () => {
      const Child = {
        __scopeId: 'data-v-child',
        render: withChildId(function(this: any) {
          return h('div', this.$slots.default())
        })
      }

      const Parent = {
        __scopeId: 'data-v-test',
        render: withId(() => {
          return h(Child, null, {
            default: withId(() => h('span', 'slot'))
          })
        })
      }

      expect(await renderToString(h(Parent))).toBe(
        `<div data-v-child><span data-v-test data-v-child-s>slot</span></div>`
      )
    })
  })
})
