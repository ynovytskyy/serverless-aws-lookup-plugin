'use strict'

class ArnResolverPlugin {
    static ARN_FIELD_NAME = 'ARN'
    static RESOLVERS = {
        'wafv2-ipset-regional-by-name': {
            fn: ArnResolverPlugin.byMatch,
            service: 'WAFV2',
            call: 'listIPSets',
            params: { Scope: 'REGIONAL' },
            collectionFieldName: 'IPSets'
        }
    }

    constructor(serverless, options, { log }) {
        log.debug('Creating ArnResolverPlugin')
        this.serverless = serverless
        this.log = log
        this.provider = serverless.providers.aws
        this.configurationVariablesSources = {
            'aws-arn': {
                resolve: async (variable) => {
                    console
                    if (!variable.params || variable.params.length !== 1) {
                        throw new this.serverless.classes.Error('Resolver name expected as parameter ' +
                            'for Arn Resolver plugin. E.g. ${aws-arn(wafv2-ipset-regional-by-name):my-ipset}');
                    }
                    const resolverName = variable.params[0]
                    const resolverInfo = ArnResolverPlugin.RESOLVERS[resolverName]
                    if (!resolverInfo) {
                        throw new this.serverless.classes.Error(`No resolver found for '${resolverName}'`);
                    }

                    const key = variable.address
                    this.log.verbose(`Resolving ARN for IPSet with name '${key}'...`)
                    const ipSets = await this.requestAll('WAFV2', 'listIPSets', { Scope: 'REGIONAL' }, 'IPSets')
                    return this.findByMatch(ipSets, 'Name', key)
                }
            }
        }
    }

    byMatch(service, call, params, matchFieldName, matchValue) {

    }

    findByMatch(collection, matchFieldName, matchValue) {
        let result = null
        for (const item of collection) {
            const itemMatchFieldValue = item[matchFieldName]
            if (itemMatchFieldValue === matchValue) {
                if (result) {
                    throw new this.serverless.classes.Error(`ARN resolution failed: multiple resources found ` +
                        `with '${matchFieldName}' equal to '${matchValue}'`);
                } else {
                    result = item
                }
            }
        }

        if (!result) {
            throw new this.serverless.classes.Error(`ARN resolution failed: no resources found ` +
                `with '${matchFieldName}' equal to '${matchValue}'`);
        }

        const resultArn = result[ArnResolverPlugin.ARN_FIELD_NAME]
        if (!resultArn) {
            throw new this.serverless.classes.Error(`ARN resolution failed: no '${ArnResolverPlugin.ARN_FIELD_NAME}' ` +
                `defined for resources with '${matchFieldName}' equal to '${matchValue}'`);
        }

        this.log.verbose(`Resolved resource with '${matchFieldName}' equal to '${matchValue}' to '${resultArn}'`)
        return {value: resultArn}
    }

    async requestAll(service, call, params, collectionFieldName) {
        const all = []
        let nextMarker = null
        do {
            if (nextMarker) {
                params.NextMarker = nextMarker
            }
            const response = await this.provider.request(service, call, params)
            const page = response[collectionFieldName] || []
            all.push(...page)
            nextMarker = response.NextMarker
        } while (nextMarker)
        return all
    }
}

module.exports = ArnResolverPlugin
