/**
 * How background work is dispatched.
 *
 * Two modes rather than a general job abstraction, because there is exactly one
 * kind of background work. A generic queue interface here would be scaffolding
 * for requirements that do not exist yet.
 */
export type QueueDriverName = 'inline' | 'database'
