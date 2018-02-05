

type TestResult<A> = {ok: true} | {ok: false, counterexample: A}
// declare function qc<A>(g: Gen<A>, prop: (a: A) => boolean): TestResult<A>

type RNG = {}
const rng_seed: RNG = {}
function next(rng: RNG): number {
  return 0
}

function pair<A, B>(a: A, b: B): [A, B] { return [a, b] }
function sigma<A, B>(a: A, f: (a: A) => B): [A, B] { return [a, f(a)] }

export function interleave<A>(a: A[], b: A[]): A[] {
  const out: A[] = []
  let i = 0
  for (; i < a.length && i < b.length; i++) {
    out.push(a[i])
    out.push(b[i])
  }
  out.push(...a.slice(i))
  out.push(...b.slice(i))
  return out
}

interface StrictTree<A> {
  readonly top: A,
  readonly forest: StrictTree<A>[]
}

class Tree<A> {
  constructor(
    readonly top: A,
    readonly forest: () => Tree<A>[]
  ) {}
  static pure<A>(a: A): Tree<A> {
    return new Tree(a, () => [])
  }
  static tree<A>(top: A, forest: () => Tree<A>[]): Tree<A> {
    return new Tree(top, forest)
  }
  static tree$<A>(top: A, forest: Tree<A>[]): Tree<A> {
    return new Tree(top, () => forest)
  }
  map<B>(f: (a: A) => B): Tree<B> {
    return this.then((a: A) => Tree.pure(f(a)))
  }
  then<B>(f: (a: A) => Tree<B>): Tree<B> {
    const t = f(this.top)
    return new Tree(t.top, () => [...this.forest().map(t => t.then(f)), ...t.forest()])
  }
  left_first_pair<B>(tb: Tree<B>): Tree<[A, B]> {
    return this.then(a => tb.then(b => Tree.pure(pair(a, b))))
  }
  fair_pair<B>(tb: Tree<B>): Tree<[A, B]> {
    return new Tree(
      pair(this.top, tb.top),
      () => [
        ...this.forest().map(ta2 => ta2.fair_pair(tb)),
        ...tb.forest().map(tb2 => this.fair_pair(tb2))
      ])
  }
  force(depth: number=-1): StrictTree<A> {
    return {top: this.top, forest:
      depth == 0 ? [] :
      this.forest().map(t => t.force(depth-1))}
  }
}

const [tree, pure] = [Tree.tree$, Tree.pure]

declare var require: Function
const pp = require('json-stringify-pretty-compact') as (s: any) => string
const log = (s: any) => console.log(pp(s))

function writer<A>(handle: (write: (...xs: A[]) => void) => void): A[] {
  const out: A[] = []
  handle(out.push.bind(out))
  return out
}

const halves =
  (n: number): number[] =>
  writer(write => {
    let i = n
    do {
      i = Math.floor(i / 2)
      write(i)
    } while (i > 1)
  })

function shrink_number(n: number, towards: number = 0): Tree<number> {
  if (towards != 0) {
    return shrink_number(towards - n).map(i => towards - i)
  } else if (n < 0) {
    return shrink_number(-n).map(i => -i)
  } else {
    return (function go(i: number): Tree<number> {
      return new Tree(i, () => i < 1 ? [] : [...halves(i), ...(i > 2 ? [i-1] : [])].map(go))
    })(n)
  }
}

log(shrink_number(2, 8).force())
log(shrink_number(4).fair_pair(shrink_number(4).fair_pair(shrink_number(4))).force(2))

/*

console.log('----------')
log(
  tree(1, [pure(2), pure(3)]).then(a =>
  tree(1, [pure(2), pure(3)]).then(b =>
  tree(1, [pure(2), pure(3)]).then(c =>
  pure([a, b, c])))
).force())
console.log('==========')
log(
  tree(1, [tree(2, [pure(3)])]).then(a =>
  tree(1, [tree(2, [pure(3)])]).then(b =>
  tree(1, [tree(2, [pure(3)])]).then(c =>
  pure([a, b, c])))
).force())
console.log('----------')

log(
  tree(1, [tree(2, [pure(3), pure(4)]), pure(5)]).then(a =>
  tree(0.1, [pure(0.01)]).then(b =>
    pure(a * b)))
.force())
*/

/*
class Gen<A> {
  private constructor(
     private readonly gen: (rng: RNG) => Tree<A>
  ) {}
  public static pure<A>(a: A): Gen<A> {
    return new Gen(() => pair(a, []))
  }
  public static range(lo: number, hi: number): Gen<number> {
    return new Gen(
      (rng) => sigma(
        next(rng) % (hi - lo) + lo,
        a => a - 1 > lo ? [a - 1] : []))
  }
  public static pair<A, B>(ga: Gen<A>, gb: Gen<B>): Gen<[A, B]> {
    return new Gen(
      (rng) => {
        const [a, as] = ga.gen(rng)
        const [b, bs] = gb.gen(rng)
        return pair(pair(a, b), [
            ...as.map(a => pair(a, b)),
            ...bs.map(b => pair(a, b))
         ])
      })
  }
  public static record<T extends Record<string, any>>(r: {[K in keyof T]: Gen<T[K]>}): Gen<T> { throw 'TODO' }
  public static choose<A>(xs: A[]): Gen<A> { throw 'TODO' }
  public static frequency<A>(table: [number, Gen<A>][]): Gen<A> { throw 'TODO' }
  public static oneof<A>(gs: Gen<A>[]): Gen<A> { throw 'TODO' }
  public static sequence<A>(gs: Gen<A>[]): Gen<A[]> { throw 'TODO' }
  public map<B>(f: (a: A) => B): Gen<B> {
    return new Gen(
      rng => {
        const [a, as] = this.gen(rng)
        return pair(f(a), as.map(f))
      })
  }
  public then<B>(f: (a: A) => Gen<B>): Gen<B> {
    return new Gen(
      rng => {
        // NB: use tree then
        const [a, as] = this.gen(rng)
        const [b, bs] = f(a).gen(rng)
        return pair(b, [...bs, ...as.map(a => f(a).gen(rng)[0])])
      })
  }
  public pair<B>(b: Gen<B>): Gen<[A, B]> {
    return Gen.pair(this, b)
  }
  public wrap<K extends string>(k: K): Gen<Record<K, A>> {
    return Gen.record({[k as string]: this} as any as Record<K, Gen<A>>)
  }
  public union<T extends Record<string, any>>(r: {[K in keyof T]: Gen<T[K]>}): Gen<A & T> {
    throw 'TODO'
  }
  public smaller(): Gen<A> {
    return new Gen(
      rng => {
        const [a, as] = this.gen(rng)
        if (as.length == 0) {
          return pair(a, [])
        } else {
          const i = next(rng)
          return pair(as[as.length % i], [])
        }
      }
    )
  }
  public setShrinker(f: (a: A, current: A[]) => A[]): Gen<A> {
    return new Gen(
      rng => {
        const [a, as] = this.gen(rng)
        return pair(a, f(a, as))
      })
  }
  public sample(n: number = 10): A[] {
    return replicate(n, this).gen(rng_seed)[0]
  }
  public sampleWithShrinks(n?: number): {value: A, shrinks: A[]}[] {
    throw 'TODO'
  }
}

function replicate<A>(n: number, g: Gen<A>): Gen<A[]> {
  if (n == 0) {
    return Gen.pure([] as A[])
  } else if (n % 2 == 0) {
    return g
      .pair(replicate(n-1, g))
      .map(([x, xs]) => [x, ...xs])
  } else {
    return g
      .wrap('x')
      .union({xs: replicate(n-1, g)})
      .map(({x, xs}) => [x, ...xs])
  }
}

console.log(
  qc(Gen.record({a: Gen.range(0, 10), b: Gen.range(0, 10)}),
    ({a, b}) => a * b < 64
  )
)
*/