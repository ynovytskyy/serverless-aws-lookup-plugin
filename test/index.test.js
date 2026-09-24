'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const AwsLookupPlugin = require('../src/index.js')

const IPSET_RESOLVER = 'wafv2-ipset-regional-by-name'

function pluginWithProvider(pagesByMarker) {
    const calls = []
    const serverless = {
        providers: {
            aws: {
                request: async (service, command, params) => {
                    calls.push({ service, command, params: { ...params } })
                    const page = pagesByMarker[params.NextMarker ?? 'first']
                    if (!page) throw new Error(`fake provider: no page for marker '${params.NextMarker}'`)
                    return page
                },
            },
        },
        classes: { Error: class ServerlessError extends Error {} },
    }
    const log = { debug() {}, verbose() {} }
    const plugin = new AwsLookupPlugin(serverless, {}, { log })
    const resolve = (resolver, key) => plugin.configurationVariablesSources['aws-lookup'].resolve({ params: [resolver, key] })
    return { resolve, calls }
}

const COMPLETE_FIRST_PAGE_WITH_MARKER = {
    first: { IPSets: [{ Name: 'ada_all', ARN: 'arn:ada_all' }, { Name: 'kms_lighthouse', ARN: 'arn:kms' }], NextMarker: 'zendesk' },
    zendesk: { IPSets: [] },
}

test('a lookup that paged does not poison the next lookup of the same resolver', async () => {
    const { resolve, calls } = pluginWithProvider(COMPLETE_FIRST_PAGE_WITH_MARKER)

    assert.deepEqual(await resolve(IPSET_RESOLVER, 'ada_all'), { value: 'arn:ada_all' })
    assert.deepEqual(await resolve(IPSET_RESOLVER, 'kms_lighthouse'), { value: 'arn:kms' })

    const firstRequestOfSecondLookup = calls[2]
    assert.equal(firstRequestOfSecondLookup.params.NextMarker, undefined)
    assert.equal(AwsLookupPlugin.RESOLVERS[IPSET_RESOLVER].params.NextMarker, undefined,
        'resolver params must stay untouched')
})

test('pagination follows NextMarker until exhausted and finds items on later pages', async () => {
    const { resolve, calls } = pluginWithProvider({
        first: { IPSets: [{ Name: 'a', ARN: 'arn:a' }], NextMarker: 'a' },
        a: { IPSets: [{ Name: 'b', ARN: 'arn:b' }], NextMarker: 'b' },
        b: { IPSets: [{ Name: 'c', ARN: 'arn:c' }] },
    })

    assert.deepEqual(await resolve(IPSET_RESOLVER, 'c'), { value: 'arn:c' })
    assert.deepEqual(calls.map((c) => c.params.NextMarker), [undefined, 'a', 'b'])
    assert.ok(calls.every((c) => c.params.Scope === 'REGIONAL'), 'static params are sent on every page')
})

test('reports a missing resource by name', async () => {
    const { resolve } = pluginWithProvider(COMPLETE_FIRST_PAGE_WITH_MARKER)
    await assert.rejects(resolve(IPSET_RESOLVER, 'nope'), /No resources found with 'Name' equal to 'nope'/)
})

test('rejects ambiguous names', async () => {
    const { resolve } = pluginWithProvider({
        first: { IPSets: [{ Name: 'dup', ARN: 'arn:1' }, { Name: 'dup', ARN: 'arn:2' }] },
    })
    await assert.rejects(resolve(IPSET_RESOLVER, 'dup'), /Multiple resources found with 'Name' equal to 'dup'/)
})
